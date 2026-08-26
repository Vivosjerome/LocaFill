import { mapFields } from './mapper'
import { extractFieldsFromPaste } from '@/lib/forms/extract'
import { isGenericAcrobatName } from '@/lib/forms/parsePdf'
import type { DetectedField } from '@/types/form'
import type { AppProfile } from '@/types/profile'
import type { AppSettings } from '@/types/form'

function field(partial: Partial<DetectedField> & { label: string }): DetectedField {
  return {
    id: crypto.randomUUID(),
    name: '',
    htmlId: '',
    type: 'text',
    tag: 'input',
    placeholder: '',
    autocomplete: '',
    nearbyText: '',
    section: '',
    options: [],
    required: false,
    tenantHint: 0,
    roleHint: 'primary',
    raw: {},
    ...partial,
  }
}

const CASES: { label: string; expect: string; field: Partial<DetectedField> & { label: string } }[] = [
  { label: 'Family name / Surname', expect: 'lastName', field: { label: 'Family name', placeholder: 'Surname', name: 'family_nm' } },
  { label: 'Given name', expect: 'firstName', field: { label: 'Given name', placeholder: 'First name' } },
  { label: 'Nom', expect: 'lastName', field: { label: 'Nom' } },
  { label: 'Prénom', expect: 'firstName', field: { label: 'Prénom' } },
  { label: 'Nom et prénom', expect: 'fullName', field: { label: 'Nom et prénom' } },
  { label: 'Net mensuel', expect: 'netMonthlyIncome', field: { label: 'Net mensuel / take-home pay', name: 'takehome' } },
  { label: 'Employeur', expect: 'employerName', field: { label: 'Company / employer', name: 'org', section: 'Employeur' } },
  { label: 'E-mail', expect: 'email', field: { label: 'Adresse e-mail', type: 'email', name: 'contact_mail' } },
  { label: 'Ressources mensuelles', expect: 'netMonthlyIncome', field: { label: 'Ressources mensuelles nettes' } },
  { label: 'Revenu fiscal', expect: 'annualIncome', field: { label: 'Revenu fiscal de référence', name: 'rfr' } },
  { label: 'ZIP', expect: 'postalCode', field: { label: 'ZIP / code postal', name: 'zipcode' } },
  { label: 'Téléphone portable', expect: 'phone', field: { label: 'Téléphone portable' } },
  { label: 'Employer phone', expect: 'employerPhone', field: { label: 'Employer phone', type: 'tel', section: 'Employeur' } },
  { label: 'Date et lieu de naissance', expect: 'birthDate', field: { label: 'Date et lieu de naissance' } },
  { label: 'Code postal et ville', expect: 'postalCode', field: { label: 'Code postal et ville' } },
  { label: 'Nom de l’entreprise', expect: 'employerName', field: { label: 'Nom de l’entreprise', section: 'SITUATION PROFESSIONNELLE' } },
  { label: 'Situation actuelle', expect: 'professionalStatus', field: { label: 'Situation actuelle' } },
  { label: 'Autres ressources', expect: 'otherIncome', field: { label: 'Autres ressources (préciser)' } },
]

export function runSemanticSmoke(profile: AppProfile, settings: AppSettings) {
  const mappingCases = CASES.map((c) => {
    const mapping = mapFields([field(c.field)], profile, settings)[0]
    const ok = mapping?.canonicalKey === c.expect
    return {
      label: c.label,
      expected: c.expect,
      got: mapping?.canonicalKey || '(aucun)',
      confidence: mapping?.confidence ?? 'none',
      ok,
    }
  })

  const pasted = `Nom
Prénom
Adresse e-mail
Téléphone portable
Ressources mensuelles nettes
Employeur`
  const extracted = extractFieldsFromPaste(pasted)
  const extractedKeys = mapFields(extracted, profile, settings).map((m) => m.canonicalKey)
  const expectedExtract = ['lastName', 'firstName', 'email', 'phone', 'netMonthlyIncome', 'employerName']
  const extractOk = expectedExtract.every((k) => extractedKeys.includes(k)) && extracted.length >= 6

  const html = `<input name="surname" placeholder="Family name"><input placeholder="Given name" aria-label="Given name">`
  const htmlFields = extractFieldsFromPaste(html)
  const htmlKeys = mapFields(htmlFields, profile, settings).map((m) => m.canonicalKey)
  const htmlOk = htmlKeys.includes('lastName') && htmlKeys.includes('firstName')

  const skipDivorced = mapFields([field({ label: 'Divorcé depuis le', type: 'text' })], profile, settings)[0]
  const skipSignatory = mapFields(
    [field({ label: 'Agissant en qualité de de la société', section: 'Attestation Employeur' })],
    profile,
    settings,
  )[0]

  return [
    ...mappingCases,
    {
      label: 'Collage texte (6 libellés FR)',
      expected: expectedExtract.join(', '),
      got: extractedKeys.join(', ') || `(${extracted.length} champs)`,
      confidence: 'high' as const,
      ok: extractOk,
    },
    {
      label: 'HTML sans <form>',
      expected: 'lastName, firstName',
      got: htmlKeys.join(', ') || `(${htmlFields.length} champs)`,
      confidence: 'high' as const,
      ok: htmlOk,
    },
    {
      label: 'Nom Acrobat générique',
      expected: 'ignoré',
      got: isGenericAcrobatName('Champ de texte 105') ? 'ignoré' : 'conservé',
      confidence: 'high' as const,
      ok: isGenericAcrobatName('Champ de texte 105') && isGenericAcrobatName('Case à cocher 92') && !isGenericAcrobatName('nomLocataire'),
    },
    {
      label: 'Divorcé depuis le ignoré',
      expected: '(aucun)',
      got: skipDivorced?.canonicalKey || '(aucun)',
      confidence: 'none' as const,
      ok: !skipDivorced?.canonicalKey || skipDivorced.skipped,
    },
    {
      label: 'Signataire employeur ignoré',
      expected: '(aucun)',
      got: skipSignatory?.canonicalKey || '(aucun)',
      confidence: 'none' as const,
      ok: skipSignatory?.canonicalKey !== 'employerName',
    },
  ]
}

export { field }
