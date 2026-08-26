import type { AppProfile } from '@/types/profile'
import type { DetectedField, FieldMapping } from '@/types/form'
import { CANONICAL_META, type CanonicalKey } from './canonical'
import { normalizeText } from './normalize'
import { readProfileValue, tenantLabel } from './values'

const CHOICE_GROUPS: { key: CanonicalKey; options: string[][] }[] = [
  {
    key: 'civility',
    options: [
      ['m', 'm.', 'mr', 'monsieur', 'homme'],
      ['mme', 'madame', 'mrs', 'ms', 'femme'],
      ['mx'],
    ],
  },
  {
    key: 'contractType',
    options: [
      ['cdi', 'duree indeterminee', 'contrat a duree indeterminee'],
      ['cdd', 'duree determinee', 'contrat a duree determinee'],
      ['interim'],
      ['freelance', 'independant', 'auto entrepreneur'],
      ['stage'],
      ['alternance'],
    ],
  },
  {
    key: 'housingStatus',
    options: [
      ['locataire', 'tenant'],
      ['proprietaire', 'owner'],
      ['heberge', 'heberge chez', 'hosted'],
    ],
  },
  {
    key: 'professionalStatus',
    options: [
      ['salarie', 'employee'],
      ['independant', 'self employed'],
      ['etudiant', 'student'],
      ['sans emploi', 'chomage'],
      ['retraite'],
    ],
  },
  {
    key: 'maritalStatus',
    options: [
      ['celibataire', 'single'],
      ['concubin', 'concubinage', 'union libre'],
      ['marie', 'mariee', 'married'],
      ['pacse'],
      ['divorce', 'divorcee'],
      ['veuf', 'veuve'],
    ],
  },
]

export function mapChoiceField(
  field: DetectedField,
  profile: AppProfile,
  tenantIndex: number,
): FieldMapping | null {
  if (field.type !== 'checkbox' && field.type !== 'radio') return null
  const labelN = normalizeText(field.label)
  if (!labelN || labelN.length > 80) return null

  const tenant = profile.tenants[tenantIndex] ?? profile.tenants[0]
  if (!tenant) return null

  for (const group of CHOICE_GROUPS) {
    for (const option of group.options) {
      if (
        !option.some(
          (o) =>
            labelN === o ||
            labelN.startsWith(`${o} `) ||
            labelN.endsWith(` ${o}`) ||
            (o.length > 10 && labelN.includes(o)),
        )
      ) {
        continue
      }
      const { value, source } = readProfileValue(profile, group.key, tenantIndex)
      const profileN = normalizeText(value)
      const matches = option.some((o) => profileN === o || profileN.includes(o) || o.includes(profileN))
      if (!matches || !value) {
        return {
          fieldId: field.id,
          canonicalKey: group.key,
          tenantIndex,
          value: '',
          displayValue: '',
          source,
          confidence: 'low',
          score: 0.7,
          rationale: `${CANONICAL_META[group.key].labelFr} — option non retenue`,
          skipped: true,
        }
      }
      return {
        fieldId: field.id,
        canonicalKey: group.key,
        tenantIndex,
        value: 'Oui',
        displayValue: 'Oui',
        source,
        confidence: 'high',
        score: 0.88,
        rationale: `${CANONICAL_META[group.key].labelFr} · ${tenantLabel(tenant, tenantIndex)} · case « ${field.label} »`,
        skipped: false,
      }
    }
  }
  return null
}

export function isTruthyChoice(value: string): boolean {
  return /oui|yes|true|1|x|on|checked/i.test(value.trim())
}
