import { existsSync, mkdirSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { DEFAULT_SETTINGS } from '@/lib/storage/db'
import { extractPdfFields } from '@/lib/forms/parsePdf'
import { mapFields } from '@/lib/semantic/mapper'
import { fillPdfForm } from '@/lib/pdf/fillPdf'
import { GENERATED_SHEETS } from '@/lib/semantic/makeSheets'
import { testProfile } from '@/lib/semantic/testProfile'

const profile = testProfile()
const outDir = resolve('fixtures/debug')
mkdirSync(outDir, { recursive: true })

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function fillBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const extracted = await extractPdfFields(toArrayBuffer(bytes))
  const mappings = mapFields(extracted.fields, profile, DEFAULT_SETTINGS)
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' })
  const filled = await fillPdfForm(blob, extracted.fields, mappings)
  return new Uint8Array(await filled.arrayBuffer())
}

async function renderPdf(bytes: Uint8Array, stem: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createRequire } = await import('node:module')
  const { pathToFileURL } = await import('node:url')
  const req = createRequire(import.meta.url)
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
  const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
  const ctx = canvas.getContext('2d')
  const task = page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport })
  await task.promise
  const path = resolve(outDir, `${stem}.png`)
  await writeFile(path, canvas.toBuffer('image/png'))
  console.log(`png ${path}`)
}

const ids = new Set((process.argv.slice(2).filter((a) => !a.startsWith('-'))))
const sheets = ids.size ? GENERATED_SHEETS.filter((s) => ids.has(s.id) || [...ids].some((id) => s.id.startsWith(id))) : GENERATED_SHEETS

for (const sheet of sheets) {
  await renderPdf(await fillBytes(await sheet.build()), sheet.id)
}

const reals = [
  { id: 'R2', names: ['dossier candidature 2.pdf'] },
  { id: 'R3', names: ['FICHE CANDIDAT LOCATAIRE - ERA BAYONNE.pdf'] },
  { id: 'R1', names: ['dossier-location-sud.pdf', 'Dépot de dossier Location Sud.pdf'] },
]
if (!ids.size || [...ids].some((id) => id.startsWith('R'))) {
  for (const spec of reals) {
    if (ids.size && ![...ids].some((id) => spec.id.startsWith(id) || id.startsWith(spec.id))) continue
    const roots = [resolve('fixtures'), resolve('C:/Users/Jerome/Downloads')]
    let path: string | null = null
    for (const root of roots) {
      for (const name of spec.names) {
        const p = resolve(root, name)
        if (existsSync(p)) path = p
      }
    }
    if (!path) {
      console.log(`manquant ${spec.id}`)
      continue
    }
    await renderPdf(await fillBytes(await readFile(path)), spec.id)
  }
}
