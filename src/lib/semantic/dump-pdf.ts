import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { EMPTY_PROFILE, EMPTY_TENANT } from '@/types/profile'
import { DEFAULT_SETTINGS } from '@/lib/storage/db'
import { extractPdfFields } from '@/lib/forms/parsePdf'
import { mapFields } from '@/lib/semantic/mapper'

const pdfPath = resolve('fixtures/dossier-location-sud.pdf')

const profile = EMPTY_PROFILE()
profile.tenants[0] = {
  ...EMPTY_TENANT('primary'),
  id: profile.tenants[0].id,
  label: 'Jérôme',
  firstName: 'Jerome',
  lastName: 'VIVOS',
  birthName: 'VIVOS',
  birthDate: '1995-10-12',
  birthPlace: 'Bayonne',
  email: 'vivosjerome64@gmail.com',
  phone: '0627296788',
  street: '25 rue du moulin de sault',
  postalCode: '64600',
  city: 'ANGLET',
  country: 'France',
  maritalStatus: 'Célibataire',
  professionalStatus: 'Salarié',
  occupation: 'Chauffeur Livreur',
  contractType: 'CDI',
  employerName: 'LivronsChezVous',
  employerAddress: "1 rue d'etxezahar 64990 Mouguerre",
  netMonthlyIncome: '1750',
  otherIncome: '350',
  housingSince: '2025-11-02',
}
profile.tenants.push({
  ...EMPTY_TENANT('cotenant'),
  label: 'Laurine',
  firstName: 'Laurine',
  lastName: 'X',
  maritalStatus: 'Célibataire',
})
profile.tenants.push({
  ...EMPTY_TENANT('guarantor'),
  label: 'Garant',
  lastName: 'Lys',
  occupation: 'Banquier',
  netMonthlyIncome: '1900',
})
profile.household.peopleCount = '2'
profile.household.childrenCount = '0'

const bytes = await readFile(pdfPath)
const extracted = await extractPdfFields(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
const mappings = mapFields(extracted.fields, profile, DEFAULT_SETTINGS)

console.log(`pages=${extracted.pageCount} fields=${extracted.fields.length}`)
console.log('--- PAGES ---')
extracted.text.split('\n\n').forEach((p, i) => {
  const head = p.replace(/\s+/g, ' ').slice(0, 220)
  console.log(`p${i + 1}: ${head}`)
})
console.log('--- FIELDS ---')
for (const f of extracted.fields) {
  console.log(`[${f.type}] p${f.raw.page} t${f.tenantHint}/${f.roleHint} ${JSON.stringify(f.label)}`)
}
console.log('--- MAPPED ---')
for (const m of mappings) {
  if (!m.canonicalKey || m.skipped) continue
  const f = extracted.fields.find((x) => x.id === m.fieldId)
  console.log(`${m.confidence} ${m.canonicalKey.padEnd(20)} <= ${JSON.stringify(f?.label)} => ${JSON.stringify(m.displayValue)}`)
}
console.log('--- CHECKS ---')
const mapped = mappings.filter((m) => m.canonicalKey && !m.skipped && m.displayValue)
const fieldOf = (m: (typeof mappings)[number]) => extracted.fields.find((f) => f.id === m.fieldId)
const byLabel = (re: RegExp) => mapped.filter((m) => re.test(fieldOf(m)?.label ?? ''))
const fail: string[] = []

if (extracted.fields.some((f) => f.raw.page === '5' || f.raw.page === '6' || f.raw.page === '8')) {
  fail.push('Les attestations foyer/hébergement et la page RGPD ne doivent pas être proposées')
}
if (byLabel(/divorc/i).length) fail.push('Divorcé ne doit pas être rempli (profil célibataire)')
if (byLabel(/agissant en qualite/i).length) fail.push('« Agissant en qualité » est le signataire employeur, pas à remplir')
if (byLabel(/^situation professionnelle$/i).length) fail.push('Titre SITUATION PROFESSIONNELLE ne doit pas être rempli')
if (byLabel(/pieces complementaires|pièces complémentaires/i).length) fail.push('Liste de pièces ne doit pas être remplie')
if (!byLabel(/situation actuelle/i).some((m) => /salari/i.test(m.displayValue))) {
  fail.push('Situation actuelle doit contenir Salarié')
}
if (!byLabel(/autres ressources/i).some((m) => m.displayValue.includes('350'))) {
  fail.push('Autres ressources doit recevoir les autres revenus')
}
if (!byLabel(/^célibataire$/i).some((m) => m.displayValue === 'Oui' && fieldOf(m)?.roleHint === 'primary')) {
  fail.push('Case Célibataire du locataire 1 doit être cochée')
}
if (!byLabel(/date et lieu de naissance/i).some((m) => /Bayonne/i.test(m.displayValue))) {
  fail.push('Date et lieu de naissance doit contenir la ville')
}
if (!byLabel(/code postal et ville/i).some((m) => /64600/i.test(m.displayValue))) {
  fail.push('Code postal et ville perso doit contenir le CP')
}
if (!mapped.some((m) => fieldOf(m)?.label === 'Nom & Prénom' && fieldOf(m)?.roleHint === 'primary' && m.displayValue === 'Jerome VIVOS')) {
  fail.push('Nom locataire 1 doit être Jerome VIVOS')
}
if (mapped.some((m) => fieldOf(m)?.label === 'Nom du locataire' && m.displayValue === 'X')) {
  fail.push('Nom du locataire ne doit pas prendre le nom du co-locataire')
}
if (!mapped.some((m) => fieldOf(m)?.label === 'Nom & Prénom' && fieldOf(m)?.roleHint === 'cotenant' && /Laurine/i.test(m.displayValue))) {
  fail.push('Nom locataire 2 doit être Laurine')
}
if (mapped.some((m) => fieldOf(m)?.roleHint === 'cotenant' && /VIVOS|Jerome/i.test(m.displayValue))) {
  fail.push('La colonne locataire 2 ne doit pas recevoir Jerome/VIVOS')
}
if (!mapped.some((m) => fieldOf(m)?.label === 'Nom & Prénom' && fieldOf(m)?.roleHint === 'guarantor' && /Lys/i.test(m.displayValue))) {
  fail.push('Nom du garant doit être Lys')
}
if (mapped.some((m) => fieldOf(m)?.roleHint === 'guarantor' && /Jerome|VIVOS/i.test(m.displayValue))) {
  fail.push('La fiche cautionnaire ne doit pas recevoir Jerome/VIVOS')
}
if (mapped.some((m) => fieldOf(m)?.label === 'Nom & Prénom' && fieldOf(m)?.raw.page === '1' && m.displayValue === 'Lys')) {
  fail.push('La fiche locataire ne doit pas recevoir le nom du garant')
}
if (
  mapped.some(
    (m) =>
      fieldOf(m)?.label === 'Adresse' &&
      /situation professionnelle/i.test(fieldOf(m)?.section ?? '') &&
      /moulin de sault/i.test(m.displayValue),
  )
) {
  fail.push('Adresse employeur ne doit pas être l’adresse perso')
}

if (!mapped.some((m) => fieldOf(m)?.label === 'Nom et prénom du salarié' && m.displayValue === 'Jerome VIVOS')) {
  fail.push('Attestation employeur : nom du salarié = Jerome VIVOS')
}
if (
  mapped.some(
    (m) =>
      /lieu de travail/i.test(fieldOf(m)?.label ?? '') && /moulin de sault/i.test(m.displayValue),
  )
) {
  fail.push('Lieu de travail ne doit pas être l’adresse perso')
}
if (!mapped.some((m) => /durée indéterminée/i.test(fieldOf(m)?.label ?? '') && m.displayValue === 'Oui')) {
  fail.push('Case CDI doit être cochée')
}

if (fail.length) {
  console.error(fail.join('\n'))
  process.exit(1)
}
console.log(`PDF Location Sud: contrôles OK (${mapped.length} champs remplis)`)

