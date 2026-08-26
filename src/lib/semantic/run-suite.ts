import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DEFAULT_SETTINGS } from '@/lib/storage/db'
import { extractPdfFields } from '@/lib/forms/parsePdf'
import { classifyPdfPage } from '@/lib/forms/pdfLabels'
import { mapFields } from '@/lib/semantic/mapper'
import { fillPdfForm } from '@/lib/pdf/fillPdf'
import { runSemanticSmoke } from '@/lib/semantic/smoke'
import { GENERATED_SHEETS } from '@/lib/semantic/makeSheets'
import {
  TEST_EMAIL_COTENANT,
  TEST_EMAIL_GUARANTOR,
  TEST_EMAIL_PRIMARY,
  testProfile,
} from '@/lib/semantic/testProfile'
import { normalizeText } from '@/lib/semantic/normalize'
import { extractFieldsFromPaste } from '@/lib/forms/extract'
import type { DetectedField, FieldMapping } from '@/types/form'

const profile = testProfile()
const fail: string[] = []
let passed = 0
let ran = 0

function ok(name: string) {
  ran += 1
  passed += 1
  console.log(`OK  ${name}`)
}

function bad(name: string, reasons: string[]) {
  ran += 1
  for (const reason of reasons) fail.push(`${name}: ${reason}`)
  console.log(`FAIL  ${name}`)
  for (const reason of reasons) console.log(`     - ${reason}`)
}

function fieldOf(fields: DetectedField[], m: FieldMapping) {
  return fields.find((f) => f.id === m.fieldId)
}

function filledMaps(mappings: FieldMapping[]) {
  return mappings.filter((m) => m.canonicalKey && !m.skipped && m.displayValue)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function analyze(bytes: Uint8Array) {
  const extracted = await extractPdfFields(toArrayBuffer(bytes))
  const mappings = mapFields(extracted.fields, profile, DEFAULT_SETTINGS)
  const mapped = filledMaps(mappings)
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' })
  const out = await fillPdfForm(blob, extracted.fields, mappings)
  const afterBytes = new Uint8Array(await out.arrayBuffer())
  const after = await extractPdfFields(toArrayBuffer(afterBytes))
  const pages = extracted.text.split('\n\n').map((text, i) => ({
    page: i + 1,
    kind: classifyPdfPage(text),
    text,
  }))
  return { extracted, mappings, mapped, filledText: after.text, pages, out }
}

function hasMapped(
  fields: DetectedField[],
  mapped: FieldMapping[],
  pred: (m: FieldMapping, f: DetectedField | undefined) => boolean,
) {
  return mapped.some((m) => pred(m, fieldOf(fields, m)))
}

function noPersonMixup(fields: DetectedField[], mapped: FieldMapping[], reasons: string[]) {
  if (
    hasMapped(
      fields,
      mapped,
      (m, f) => f?.roleHint === 'cotenant' && /VIVOS|Jerome/i.test(m.displayValue),
    )
  ) {
    reasons.push('colonne locataire 2 a recu Jerome/VIVOS')
  }
  if (
    hasMapped(
      fields,
      mapped,
      (m, f) => f?.roleHint === 'primary' && /MARTIN|Laurine/i.test(m.displayValue) && f.raw.page !== '2',
    )
  ) {
    reasons.push('locataire 1 a recu Laurine/MARTIN')
  }
  if (
    hasMapped(
      fields,
      mapped,
      (m, f) => f?.roleHint === 'guarantor' && /VIVOS|Jerome/i.test(m.displayValue),
    )
  ) {
    reasons.push('fiche garant a recu Jerome/VIVOS')
  }
  if (
    hasMapped(
      fields,
      mapped,
      (m, f) =>
        (f?.roleHint === 'primary' || f?.roleHint === 'cotenant') &&
        /LYS|Paul LYS/i.test(m.displayValue) &&
        !/garant|caution/i.test(f?.label ?? ''),
    )
  ) {
    reasons.push('fiche locataire a recu le nom du garant')
  }
}

function emailNotTruncated(fields: DetectedField[], mapped: FieldMapping[], filledText: string, reasons: string[]) {
  const emails = mapped.filter((m) => m.canonicalKey === 'email')
  for (const m of emails) {
    if (m.displayValue.includes('...')) reasons.push(`mapping e-mail tronque: ${m.displayValue}`)
    const f = fieldOf(fields, m)
    const w = Number(f?.raw.w)
    if (Number.isFinite(w) && w < 42) reasons.push(`zone e-mail trop etroite w=${w} (${f?.label} p${f?.raw.page})`)
  }
  if (/vivosjerome\.\.\./i.test(filledText)) reasons.push('le PDF rempli contient vivosjerome...')
  if (emails.some((m) => m.displayValue === TEST_EMAIL_PRIMARY) && !filledText.includes('vivosjerome64')) {
    reasons.push('le mail locataire 1 n’apparait pas entier dans le PDF rempli')
  }
}

function skipSheetChecks(
  name: string,
  pages: { kind: string }[],
  mapped: FieldMapping[],
  filledText: string,
  expectKind: string,
) {
  const reasons: string[] = []
  if (!pages.every((p) => p.kind === expectKind || p.kind === 'skip' || p.kind === 'tenant-docs' || p.kind === 'guarantor-docs')) {
    reasons.push(`page kind inattendu: ${pages.map((p) => p.kind).join(',')}`)
  }
  if (mapped.some((m) => /VIVOS|Jerome|Laurine|LYS/i.test(m.displayValue))) {
    reasons.push('une page a ignorer a ete remplie avec une identite')
  }
  if (/Jerome VIVOS|vivosjerome64@gmail.com/i.test(filledText) && name.includes('rgpd')) {
    reasons.push('la page RGPD a recu des donnees perso')
  }
  if (reasons.length) bad(name, reasons)
  else ok(name)
}

function checkAnchors(
  sheet: (typeof GENERATED_SHEETS)[number],
  fields: DetectedField[],
  mapped: FieldMapping[],
  reasons: string[],
) {
  for (const a of sheet.anchors ?? []) {
    const hit = mapped.find((m) => {
      const f = fieldOf(fields, m)
      return Boolean(f && normalizeText(f.label) === normalizeText(a.label) && f.roleHint === a.role)
    })
    const f = hit ? fieldOf(fields, hit) : undefined
    if (!f) {
      reasons.push(`placement: ${a.label} (${a.role}) introuvable`)
      continue
    }
    const x = Number(f.raw.x)
    const y = Number(f.raw.y)
    if (Math.abs(x - a.x) > 12) reasons.push(`placement: ${a.label} ${a.role} x=${x} attendu ~${a.x}`)
    if (Math.abs(y - a.y) > 6) reasons.push(`placement: ${a.label} ${a.role} y=${y} attendu ~${a.y}`)
  }
}

async function testGenerated() {
  console.log('\n======== FEUILLES GENEREES ========')
  for (const sheet of GENERATED_SHEETS) {
    const bytes = await sheet.build()
    const { extracted, mapped, filledText, pages } = await analyze(bytes)
    const reasons: string[] = []
    const fields = extracted.fields
    const name = `${sheet.id} ${sheet.title}`

    if (sheet.id.startsWith('07') || sheet.id.startsWith('08') || sheet.id.startsWith('09') || sheet.id.startsWith('10') || sheet.id.startsWith('11') || sheet.id.startsWith('25')) {
      const kind =
        sheet.id.startsWith('08') ? 'guarantor-docs' : sheet.id.startsWith('09') || sheet.id.startsWith('10') || sheet.id.startsWith('11') ? 'skip' : 'tenant-docs'
      skipSheetChecks(name, pages, mapped, filledText, kind)
      continue
    }

    noPersonMixup(fields, mapped, reasons)
    emailNotTruncated(fields, mapped, filledText, reasons)
    checkAnchors(sheet, fields, mapped, reasons)

    if (sheet.id === '01-locataire-2cols' || sheet.id === '02-locataire-labels-gauche' || sheet.id === '13-pointilles-courts') {
      if (!hasMapped(fields, mapped, (m, f) => f?.roleHint === 'primary' && /Jerome/i.test(m.displayValue))) {
        reasons.push('locataire 1 absent')
      }
      if (!hasMapped(fields, mapped, (m, f) => f?.roleHint === 'cotenant' && /Laurine/i.test(m.displayValue))) {
        reasons.push('locataire 2 absent')
      }
      if (!hasMapped(fields, mapped, (m) => m.displayValue === TEST_EMAIL_PRIMARY)) {
        reasons.push('mail locataire 1 incomplet')
      }
    }

    if (sheet.id === '03-locataire-simple' || sheet.id === '12-acroform' || sheet.id === '14-anglais' || sheet.id === '22-soulignes' || sheet.id === '23-bloc-identite' || sheet.id === '27-label-dessus' || sheet.id === '30-cases-cadrees' || sheet.id === '32-labels-droite' || sheet.id === '35-tableau' || sheet.id === '37-cerfa-numerote' || sheet.id === '39-photo-identite') {
      if (!hasMapped(fields, mapped, (m) => /VIVOS/i.test(m.displayValue))) reasons.push('nom locataire absent')
      if (!hasMapped(fields, mapped, (m) => m.canonicalKey === 'email' && m.displayValue === TEST_EMAIL_PRIMARY)) {
        reasons.push('mail locataire incomplet')
      }
    }

    if (sheet.id === '04-cautionnaire' || sheet.id === '24-deux-garants') {
      if (!hasMapped(fields, mapped, (m, f) => f?.roleHint === 'guarantor' && /LYS|Paul/i.test(m.displayValue))) {
        reasons.push('garant absent')
      }
      if (hasMapped(fields, mapped, (m, f) => f?.roleHint === 'primary' && /LYS/i.test(m.displayValue))) {
        reasons.push('le garant a ete mis sur un champ locataire')
      }
    }

    if (sheet.id === '05-candidature-garants') {
      if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '1' && f?.roleHint === 'primary' && /Jerome/i.test(m.displayValue))) {
        reasons.push('page 1 locataire 1 absent')
      }
      if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '1' && f?.roleHint === 'cotenant' && /Laurine/i.test(m.displayValue))) {
        reasons.push('page 1 locataire 2 absent')
      }
      if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '2' && f?.roleHint === 'guarantor' && /LYS|Paul/i.test(m.displayValue))) {
        reasons.push('page 2 garant absent')
      }
      if (hasMapped(fields, mapped, (m, f) => f?.raw.page === '1' && /LYS/i.test(m.displayValue))) {
        reasons.push('page locataires remplie avec le garant')
      }
    }

    if (sheet.id === '06-attestation-employeur') {
      if (!hasMapped(fields, mapped, (m, f) => /nom et prenom du salarie/i.test(normalizeText(f?.label ?? '')) && /Jerome VIVOS/i.test(m.displayValue))) {
        reasons.push('nom du salarie absent')
      }
      if (hasMapped(fields, mapped, (m, f) => /agissant en qualite/i.test(f?.label ?? '') && Boolean(m.displayValue))) {
        reasons.push('signataire employeur rempli')
      }
      if (hasMapped(fields, mapped, (m, f) => /lieu de travail/i.test(f?.label ?? '') && /moulin de sault/i.test(m.displayValue))) {
        reasons.push('lieu de travail = adresse perso')
      }
    }

    if (sheet.id === '15-nom-du-garant') {
      if (!hasMapped(fields, mapped, (m, f) => /nom du garant/i.test(f?.label ?? '') && /LYS/i.test(m.displayValue))) {
        reasons.push('Nom du garant doit recevoir LYS')
      }
      if (hasMapped(fields, mapped, (m, f) => /nom & prenom/i.test(f?.label ?? '') && /LYS/i.test(m.displayValue))) {
        reasons.push('le nom locataire a recu le garant')
      }
    }

    if (sheet.id === '16-loyer-honoraires') {
      if (hasMapped(fields, mapped, (m, f) => /honoraire|loyer/i.test(f?.label ?? '') && /VIVOS|Jerome|Laurine|LYS/i.test(m.displayValue))) {
        reasons.push('loyer/honoraires remplis avec une identite')
      }
      if (!hasMapped(fields, mapped, (m) => /Jerome/i.test(m.displayValue))) reasons.push('identite locataire absente')
    }

    if (sheet.id === '17-identite-2-pages') {
      if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '1' && /Jerome|VIVOS/i.test(m.displayValue))) {
        reasons.push('page 1 doit etre locataire 1')
      }
      if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '2' && /Laurine/i.test(m.displayValue))) {
        reasons.push('page 2 doit etre locataire 2')
      }
      if (hasMapped(fields, mapped, (m, f) => f?.raw.page === '2' && /Jerome|VIVOS/i.test(m.displayValue))) {
        reasons.push('page 2 a recu locataire 1')
      }
    }

    if (sheet.id === '18-situation-pro') {
      if (!hasMapped(fields, mapped, (m) => /LivronsChezVous/i.test(m.displayValue))) {
        reasons.push('nom employeur absent')
      }
      if (hasMapped(fields, mapped, (m, f) => /^adresse$/i.test(f?.label ?? '') && /moulin de sault/i.test(m.displayValue))) {
        reasons.push('adresse employeur = adresse perso')
      }
    }

    if (sheet.id === '19-celibataire') {
      if (!hasMapped(fields, mapped, (m, f) => /celibataire/.test(normalizeText(f?.label ?? '')) && m.displayValue === 'Oui')) {
        reasons.push('case Celibataire non cochée')
      }
      if (hasMapped(fields, mapped, (m, f) => /^marie/i.test(f?.label ?? '') && m.displayValue === 'Oui')) {
        reasons.push('case Marie cochée alors que profil celibataire')
      }
    }

    if (sheet.id === '20-date-lieu-naissance') {
      if (!hasMapped(fields, mapped, (m) => /Bayonne/i.test(m.displayValue))) {
        reasons.push('date/lieu de naissance sans Bayonne')
      }
    }

    if (sheet.id === '21-cp-ville') {
      if (!hasMapped(fields, mapped, (m) => /64600/i.test(m.displayValue))) {
        reasons.push('CP/ville sans 64600')
      }
    }

    if (sheet.id === '28-inline-nom-prenom') {
      const nom = mapped.find((m) => fieldOf(fields, m)?.label === 'Nom')
      const prenom = mapped.find((m) => /pr[eé]nom/i.test(fieldOf(fields, m)?.label ?? ''))
      if (nom && prenom && fieldOf(fields, nom)?.raw.y !== fieldOf(fields, prenom)?.raw.y) {
        reasons.push('Nom et Prenom doivent etre sur la meme ligne')
      }
      if (nom && prenom && Number(fieldOf(fields, prenom)?.raw.x) - Number(fieldOf(fields, nom)?.raw.x) < 80) {
        reasons.push('Prenom trop proche du Nom (doit etre a droite)')
      }
    }

    if (sheet.id === '29-trois-colonnes') {
      if (!hasMapped(fields, mapped, (m, f) => f?.roleHint === 'primary' && /VIVOS|Jerome/i.test(m.displayValue))) {
        reasons.push('colonne 1 locataire 1 absent')
      }
      if (!hasMapped(fields, mapped, (m, f) => f?.roleHint === 'cotenant' && /Laurine/i.test(m.displayValue))) {
        reasons.push('colonne 2 locataire 2 absent')
      }
      if (mapped.filter((m) => fieldOf(fields, m)?.label === 'Nom' && /VIVOS|Jerome|Laurine/i.test(m.displayValue)).length > 2) {
        reasons.push('colonne 3 (locataire absent) a ete remplie')
      }
    }

    if (sheet.id === '36-cartes-empilees' || sheet.id === '38-grille-2cols') {
      if (!hasMapped(fields, mapped, (m, f) => f?.roleHint === 'primary' && /VIVOS|Jerome/i.test(m.displayValue))) {
        reasons.push('locataire 1 absent')
      }
      if (!hasMapped(fields, mapped, (m, f) => f?.roleHint === 'cotenant' && /Laurine|MARTIN/i.test(m.displayValue))) {
        reasons.push('locataire 2 absent')
      }
    }

    if (sheet.id === '36-cartes-empilees') {
      const p = mapped.find((m) => fieldOf(fields, m)?.roleHint === 'primary' && fieldOf(fields, m)?.label === 'Nom')
      const c = mapped.find((m) => fieldOf(fields, m)?.roleHint === 'cotenant' && fieldOf(fields, m)?.label === 'Nom')
      if (p && c && Number(fieldOf(fields, c)?.raw.y) >= Number(fieldOf(fields, p)?.raw.y) - 40) {
        reasons.push('la carte locataire 2 doit etre sous la carte locataire 1')
      }
    }

    if (reasons.length) bad(name, reasons)
    else ok(name)
  }
}

async function testHtmlSheet() {
  const name = '26-html Formulaire HTML colle'
  const html = `<form>
    <label>Nom <input name="nom"></label>
    <label>Prénom <input name="prenom"></label>
    <label>Adresse e-mail <input type="email" name="mail"></label>
    <label>Nom du garant <input name="garant"></label>
  </form>`
  const fields = extractFieldsFromPaste(html)
  const mappings = mapFields(fields, profile, DEFAULT_SETTINGS)
  const mapped = filledMaps(mappings)
  const reasons: string[] = []
  if (!hasMapped(fields, mapped, (m) => m.canonicalKey === 'lastName' && m.displayValue === 'VIVOS')) reasons.push('Nom')
  if (!hasMapped(fields, mapped, (m) => m.canonicalKey === 'firstName' && m.displayValue === 'Jerome')) reasons.push('Prenom')
  if (!hasMapped(fields, mapped, (m) => m.canonicalKey === 'email' && m.displayValue === TEST_EMAIL_PRIMARY)) reasons.push('mail')
  if (!hasMapped(fields, mapped, (m, f) => /garant/i.test(f?.label ?? '') && /LYS/i.test(m.displayValue))) {
    reasons.push('Nom du garant')
  }
  if (reasons.length) bad(name, reasons)
  else ok(name)
}

function findRealPdf(names: string[]) {
  const roots = [
    resolve('fixtures'),
    resolve('C:/Users/Jerome/Downloads'),
    resolve('C:/dev/LocaFill/fixtures'),
  ]
  for (const root of roots) {
    for (const name of names) {
      const path = resolve(root, name)
      if (existsSync(path)) return path
    }
  }
  return null
}

async function testRealPdfs() {
  console.log('\n======== 3 PDF REELS ========')
  const specs = [
    {
      id: 'R1-location-sud',
      names: ['dossier-location-sud.pdf', 'Dépot de dossier Location Sud.pdf', 'Depot de dossier Location Sud.pdf'],
      check: locationSudChecks,
    },
    {
      id: 'R2-candidature-2',
      names: ['dossier candidature 2.pdf'],
      check: candidature2Checks,
    },
    {
      id: 'R3-era-bayonne',
      names: ['FICHE CANDIDAT LOCATAIRE - ERA BAYONNE.pdf'],
      check: eraChecks,
    },
  ]

  for (const spec of specs) {
    const path = findRealPdf(spec.names)
    if (!path) {
      bad(spec.id, [`PDF introuvable (${spec.names.join(', ')})`])
      continue
    }
    const bytes = await readFile(path)
    const result = await analyze(bytes)
    const reasons = spec.check(result)
    if (reasons.length) bad(`${spec.id} ${path}`, reasons)
    else ok(`${spec.id}`)
  }
}

function locationSudChecks(result: Awaited<ReturnType<typeof analyze>>) {
  const { extracted, mapped, filledText, pages } = result
  const fields = extracted.fields
  const reasons: string[] = []
  noPersonMixup(fields, mapped, reasons)
  emailNotTruncated(fields, mapped, filledText, reasons)
  if (fields.some((f) => f.raw.page === '5' || f.raw.page === '6' || f.raw.page === '8')) {
    reasons.push('attestations foyer/hebergement/RGPD proposees')
  }
  if (!hasMapped(fields, mapped, (m, f) => f?.label === 'Nom & Prénom' && f?.roleHint === 'primary' && m.displayValue === 'Jerome VIVOS')) {
    reasons.push('locataire 1')
  }
  if (!hasMapped(fields, mapped, (m, f) => f?.label === 'Nom & Prénom' && f?.roleHint === 'cotenant' && /Laurine/i.test(m.displayValue))) {
    reasons.push('locataire 2')
  }
  if (!hasMapped(fields, mapped, (m, f) => f?.label === 'Nom & Prénom' && f?.roleHint === 'guarantor' && /Lys|LYS/i.test(m.displayValue))) {
    reasons.push('garant')
  }
  if (!hasMapped(fields, mapped, (m) => m.displayValue === TEST_EMAIL_PRIMARY)) reasons.push('mail locataire 1')
  if (pages[0] && pages[0].kind !== 'tenant-form') reasons.push(`p1 kind=${pages[0].kind}`)
  if (pages[2] && pages[2].kind !== 'guarantor-form') reasons.push(`p3 kind=${pages[2].kind}`)
  return reasons
}

function candidature2Checks(result: Awaited<ReturnType<typeof analyze>>) {
  const { extracted, mapped, filledText } = result
  const fields = extracted.fields
  const reasons: string[] = []
  noPersonMixup(fields, mapped, reasons)
  emailNotTruncated(fields, mapped, filledText, reasons)
  if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '1' && f?.roleHint === 'primary' && /Jerome/i.test(m.displayValue))) {
    reasons.push('page locataires: locataire 1')
  }
  if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '1' && f?.roleHint === 'cotenant' && /Laurine/i.test(m.displayValue))) {
    reasons.push('page locataires: locataire 2')
  }
  if (
    !hasMapped(
      fields,
      mapped,
      (m, f) => f?.raw.page === '1' && f?.roleHint === 'cotenant' && Number(f?.raw.x) >= 360 && /Laurine/i.test(m.displayValue),
    )
  ) {
    reasons.push('locataire 2 n’est pas dans la colonne de droite')
  }
  if (!hasMapped(fields, mapped, (m, f) => f?.raw.page === '2' && f?.roleHint === 'guarantor' && /LYS|Paul/i.test(m.displayValue))) {
    reasons.push('page garants: garant')
  }
  if (hasMapped(fields, mapped, (m, f) => f?.raw.page === '1' && /LYS/i.test(m.displayValue))) {
    reasons.push('page locataires remplie avec le garant')
  }
  if (!hasMapped(fields, mapped, (m) => m.displayValue === TEST_EMAIL_PRIMARY)) reasons.push('mail complet locataire 1')
  if (!hasMapped(fields, mapped, (m) => m.displayValue === TEST_EMAIL_COTENANT)) reasons.push('mail locataire 2')
  if (!hasMapped(fields, mapped, (m) => m.displayValue === TEST_EMAIL_GUARANTOR)) reasons.push('mail garant')
  return reasons
}

function eraChecks(result: Awaited<ReturnType<typeof analyze>>) {
  const { extracted, mapped, filledText } = result
  const fields = extracted.fields
  const reasons: string[] = []
  emailNotTruncated(fields, mapped, filledText, reasons)
  if (!hasMapped(fields, mapped, (m, f) => /nom/i.test(f?.label ?? '') && m.displayValue === 'VIVOS')) {
    reasons.push('Nom')
  }
  if (!hasMapped(fields, mapped, (m, f) => /pr[eé]nom/i.test(f?.label ?? '') && /Jerome/i.test(m.displayValue))) {
    reasons.push('Prenom')
  }
  if (!hasMapped(fields, mapped, (m) => m.displayValue === TEST_EMAIL_PRIMARY)) reasons.push('mail')
  if (hasMapped(fields, mapped, (m) => /LYS/i.test(m.displayValue))) reasons.push('ERA locataire rempli avec le garant')
  if (hasMapped(fields, mapped, (m, f) => /domicile actuel/i.test(f?.label ?? '') && Boolean(m.displayValue))) {
    reasons.push('le titre DOMICILE ACTUEL a ete rempli')
  }
  if (!hasMapped(fields, mapped, (m, f) => /^adresse$/i.test(f?.label ?? '') && /moulin de sault/i.test(m.displayValue))) {
    reasons.push('Adresse (pas le titre de section) doit recevoir le domicile')
  }
  return reasons
}

function testSmoke() {
  console.log('\n======== MAPPING SEMANTIQUE ========')
  const rows = runSemanticSmoke(profile, DEFAULT_SETTINGS)
  for (const row of rows) {
    if (row.ok) ok(`smoke ${row.label}`)
    else bad(`smoke ${row.label}`, [`got ${row.got}, attendu ${row.expected}`])
  }
}

testSmoke()
await testGenerated()
await testHtmlSheet()
await testRealPdfs()

console.log('\n======== BILAN ========')
console.log(`${passed}/${ran} tests OK`)
if (fail.length) {
  console.error(`\n${fail.length} erreur(s):`)
  for (const f of fail) console.error(`- ${f}`)
  process.exit(1)
}
console.log('0 erreur — toutes les feuilles passent')
