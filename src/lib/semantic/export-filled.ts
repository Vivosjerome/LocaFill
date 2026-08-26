import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { DEFAULT_SETTINGS } from '@/lib/storage/db'
import { extractPdfFields } from '@/lib/forms/parsePdf'
import { mapFields } from '@/lib/semantic/mapper'
import { fillPdfForm } from '@/lib/pdf/fillPdf'
import { GENERATED_SHEETS } from '@/lib/semantic/makeSheets'
import { testProfile } from '@/lib/semantic/testProfile'

const profile = testProfile()
const outDir = resolve('fixtures/filled')

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function fillAndSave(id: string, bytes: Uint8Array) {
  const extracted = await extractPdfFields(toArrayBuffer(bytes))
  const mappings = mapFields(extracted.fields, profile, DEFAULT_SETTINGS)
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' })
  const filled = await fillPdfForm(blob, extracted.fields, mappings)
  const outBytes = new Uint8Array(await filled.arrayBuffer())
  const path = resolve(outDir, `${id}.pdf`)
  await writeFile(path, outBytes)
  const n = mappings.filter((m) => m.canonicalKey && !m.skipped && m.displayValue).length
  console.log(`écrit ${path}  (${n} champs remplis)`)
}

function findRealPdf(names: string[]) {
  const roots = [resolve('fixtures'), resolve('C:/Users/Jerome/Downloads')]
  for (const root of roots) {
    for (const name of names) {
      const path = resolve(root, name)
      if (existsSync(path)) return path
    }
  }
  return null
}

mkdirSync(outDir, { recursive: true })

for (const sheet of GENERATED_SHEETS) {
  await fillAndSave(sheet.id, await sheet.build())
}

const reals = [
  { id: 'R1-location-sud', names: ['dossier-location-sud.pdf', 'Dépot de dossier Location Sud.pdf', 'Depot de dossier Location Sud.pdf'] },
  { id: 'R2-candidature-2', names: ['dossier candidature 2.pdf'] },
  { id: 'R3-era-bayonne', names: ['FICHE CANDIDAT LOCATAIRE - ERA BAYONNE.pdf'] },
]
for (const spec of reals) {
  const path = findRealPdf(spec.names)
  if (!path) {
    console.log(`manquant ${spec.id}`)
    continue
  }
  await fillAndSave(spec.id, await readFile(path))
}

console.log(`\nDossier : ${outDir}`)
