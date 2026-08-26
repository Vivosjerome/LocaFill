import type { AppProfile, TenantRole } from '@/types/profile'
import type { AppSettings } from '@/types/form'
import type { DetectedField, FieldMapping } from '@/types/form'
import { CANONICAL_META } from './canonical'
import { detectLanguage } from './language'
import { confidenceFromScore, scoreField } from './score'
import { formatForField, readProfileValue, tenantLabel } from './values'
import { mapChoiceField } from './choices'
import { normalizeText } from './normalize'

export function resolveTenantIndex(field: DetectedField, profile: AppProfile): number | null {
  if (field.roleHint === 'guarantor') {
    const idxs = roleIndices(profile, 'guarantor')
    const slot = field.tenantHint >= 2 ? 0 : Math.max(0, field.tenantHint)
    return idxs[slot] ?? null
  }
  if (field.roleHint === 'cotenant') {
    const idxs = roleIndices(profile, 'cotenant')
    const slot = field.tenantHint > 0 ? field.tenantHint - 1 : 0
    return idxs[slot] ?? null
  }
  const primary = profile.tenants.findIndex((t) => t.role === 'primary')
  return primary >= 0 ? primary : 0
}

function roleIndices(profile: AppProfile, role: TenantRole): number[] {
  return profile.tenants.flatMap((t, i) => (t.role === role ? [i] : []))
}

export function mapFields(
  fields: DetectedField[],
  profile: AppProfile,
  settings: AppSettings,
): FieldMapping[] {
  const mappings: FieldMapping[] = []

  const ranked = fields.map((field) => {
    const scores = scoreField(field)
    return { field, scores }
  })

  ranked.sort((a, b) => (b.scores[0]?.score ?? 0) - (a.scores[0]?.score ?? 0))

  const leftover: typeof ranked = []
  for (const item of ranked) {
    const tenantIndex = resolveTenantIndex(item.field, profile)
    if (tenantIndex == null) {
      mappings.push(emptyMapping(item.field, 0, 'Personne absente du profil'))
      continue
    }
    const choice = mapChoiceField(item.field, profile, tenantIndex)
    if (choice) {
      mappings.push(choice)
      continue
    }
    const composite = mapComposite(item.field, profile, tenantIndex, settings)
    if (composite) {
      mappings.push(composite)
      continue
    }
    leftover.push(item)
  }

  for (const { field, scores } of leftover) {
    const tenantIndex = resolveTenantIndex(field, profile)
    if (tenantIndex == null) {
      mappings.push(emptyMapping(field, 0, 'Personne absente du profil'))
      continue
    }
    const available = scores.filter((s) => s.score >= 0.38)
    const top = available[0]
    const rival = available[1]
    const ambiguous = Boolean(top && rival && top.score < 0.75 && top.score - rival.score < 0.12)
    const chosen = !ambiguous ? top : undefined

    if (!chosen) {
      mappings.push(
        ambiguous
          ? {
              ...emptyMapping(field, tenantIndex),
              rationale: `Ambigu entre ${top?.key} et ${rival?.key} — correction manuelle`,
            }
          : emptyMapping(field, tenantIndex),
      )
      continue
    }

    const key = chosen.key
    const { value, source } = readProfileValue(profile, key, tenantIndex)
    const formatted = formatForField(
      key,
      value,
      field.options,
      field.type,
      field.placeholder,
      settings.dateFormat,
    )
    if (!formatted) {
      mappings.push(awaitingValue(field, tenantIndex, key))
      continue
    }

    const confidence = confidenceFromScore(chosen.score)
    const tenant = profile.tenants[tenantIndex]

    mappings.push({
      fieldId: field.id,
      canonicalKey: key,
      tenantIndex,
      value: formatted,
      displayValue: formatted,
      source,
      confidence,
      score: chosen.score,
      rationale: [
        CANONICAL_META[key].labelFr,
        tenant ? tenantLabel(tenant, tenantIndex) : null,
        ...chosen.reasons.slice(0, 2),
      ]
        .filter(Boolean)
        .join(' · '),
      skipped: false,
    })
  }

  const order = new Map(fields.map((f, i) => [f.id, i]))
  mappings.sort((a, b) => (order.get(a.fieldId) ?? 0) - (order.get(b.fieldId) ?? 0))
  return mappings
}

function isJobSection(field: DetectedField): boolean {
  return /situation professionnelle|employeur|entreprise|attestation employeur/i.test(
    `${field.section} ${field.nearbyText} ${field.label}`,
  )
}

function mapComposite(
  field: DetectedField,
  profile: AppProfile,
  tenantIndex: number,
  settings: AppSettings,
): FieldMapping | null {
  if (field.type === 'checkbox' || field.type === 'radio') return null
  const n = normalizeText(field.label)
  const tenant = profile.tenants[tenantIndex]
  if (!tenant) return null

  if (/autres ressources/.test(n)) {
    const amount = formatForField('otherIncome', tenant.otherIncome, [], 'text', '', settings.dateFormat)
    const value = [amount, tenant.otherIncomeDescription.trim()].filter(Boolean).join(' — ')
    if (!value) return awaitingValue(field, tenantIndex, 'otherIncome')
    return filled(field, tenantIndex, 'otherIncome', value, tenant, 'Autres ressources')
  }

  if (/^situation actuelle$/.test(n)) {
    const value = [tenant.professionalStatus, tenant.occupation].filter(Boolean).join(' · ')
    if (!value) return awaitingValue(field, tenantIndex, 'professionalStatus')
    return filled(field, tenantIndex, 'professionalStatus', value, tenant, 'Situation actuelle')
  }

  if (/salaire de base mensuel brut|^salaire brut$/.test(n)) {
    const raw = tenant.grossMonthlyIncome.trim() || tenant.netMonthlyIncome.trim()
    if (!raw) return awaitingValue(field, tenantIndex, 'grossMonthlyIncome')
    const value = formatForField('grossMonthlyIncome', raw, [], 'text', '', settings.dateFormat)
    const fromNet = !tenant.grossMonthlyIncome.trim()
    return filled(
      field,
      tenantIndex,
      fromNet ? 'netMonthlyIncome' : 'grossMonthlyIncome',
      value,
      tenant,
      fromNet ? 'Salaire net utilisé (brut absent du profil)' : 'Salaire brut',
      fromNet ? 'medium' : 'high',
    )
  }

  if (isJobSection(field) && /^(adresse|adresse de l entreprise)$/.test(n)) {
    const value = tenant.employerAddress.trim()
    if (!value) return awaitingValue(field, tenantIndex, 'employerAddress')
    return filled(field, tenantIndex, 'employerAddress', value, tenant)
  }

  if (isJobSection(field) && /code postal et ville|^cp et ville$/.test(n)) {
    const parsed = postalFromAddress(tenant.employerAddress)
    if (!parsed) return awaitingValue(field, tenantIndex, 'employerAddress')
    return filled(field, tenantIndex, 'postalCode', parsed, tenant)
  }

  if (/date et lieu de naissance/.test(n)) {
    const date = formatForField('birthDate', tenant.birthDate, [], 'text', '', settings.dateFormat)
    const value = [date, tenant.birthPlace].filter(Boolean).join(' — ')
    if (!value) return awaitingValue(field, tenantIndex, 'birthDate')
    return filled(field, tenantIndex, 'birthDate', value, tenant, 'Date et lieu de naissance')
  }

  if (/code postal et ville|^cp et ville$/.test(n)) {
    const value = `${tenant.postalCode} ${tenant.city}`.trim()
    if (!value) return awaitingValue(field, tenantIndex, 'postalCode')
    return filled(field, tenantIndex, 'postalCode', value, tenant, 'Code postal et ville')
  }

  return null
}

function postalFromAddress(address: string): string {
  const m = address.match(/(\d{5})\s+(.+)$/)
  return m ? `${m[1]} ${m[2].replace(/,?\s*france$/i, '').trim()}` : ''
}

function filled(
  field: DetectedField,
  tenantIndex: number,
  canonicalKey: FieldMapping['canonicalKey'],
  value: string,
  tenant: AppProfile['tenants'][number],
  rationale?: string,
  confidence: FieldMapping['confidence'] = 'high',
): FieldMapping {
  return {
    fieldId: field.id,
    canonicalKey,
    tenantIndex,
    value,
    displayValue: value,
    source: `Profil — ${tenantLabel(tenant, tenantIndex)}`,
    confidence,
    score: confidence === 'high' ? 0.9 : 0.55,
    rationale: rationale || CANONICAL_META[canonicalKey as keyof typeof CANONICAL_META]?.labelFr || canonicalKey,
    skipped: false,
  }
}

function awaitingValue(field: DetectedField, tenantIndex: number, canonicalKey: string): FieldMapping {
  return {
    fieldId: field.id,
    canonicalKey,
    tenantIndex,
    value: '',
    displayValue: '',
    source: 'À compléter',
    confidence: 'none',
    score: 0.5,
    rationale: 'Aucune valeur dans le profil — vous pouvez la saisir ici',
    skipped: false,
  }
}

function emptyMapping(field: DetectedField, tenantIndex: number, rationale?: string): FieldMapping {
  return {
    fieldId: field.id,
    canonicalKey: '',
    tenantIndex,
    value: '',
    displayValue: '',
    source: 'Non reconnu',
    confidence: 'none',
    score: 0,
    rationale: rationale || 'Aucun champ du profil ne correspond avec assez de certitude',
    skipped: true,
  }
}

export function sessionLanguage(fields: DetectedField[]): string {
  return detectLanguage(
    fields.flatMap((f) => [f.label, f.placeholder, f.nearbyText, f.section]),
  )
}
