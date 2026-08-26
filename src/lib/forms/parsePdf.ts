import type { DetectedField } from '@/types/form'
import { looksLikeFieldLabel } from '@/lib/forms/extract'
import {
  classifyPdfPage,
  collapseRepeatedLabel,
  isDocumentChecklist,
  isEmployerSignatoryLabel,
  isMaritalDetailLabel,
  isNoisePdfLabel,
  isSectionHeading,
  type PdfPageKind,
} from '@/lib/forms/pdfLabels'
import { normalizeText } from '@/lib/semantic/normalize'
import type * as PdfJs from 'pdfjs-dist'

let pdfjsPromise: Promise<typeof PdfJs> | null = null

async function pdfjs(): Promise<typeof PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const isNode = typeof window === 'undefined'
      const lib = isNode
        ? ((await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfJs)
        : await import('pdfjs-dist')
      if (isNode) {
        const { createRequire } = await import('node:module')
        const { pathToFileURL } = await import('node:url')
        const req = createRequire(import.meta.url)
        lib.GlobalWorkerOptions.workerSrc = pathToFileURL(
          req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
        ).href
      } else {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        lib.GlobalWorkerOptions.workerSrc = worker.default
      }
      return lib
    })()
  }
  return pdfjsPromise
}

interface PdfBit {
  str: string
  x: number
  y: number
  w: number
  h: number
}

interface PdfLine {
  y: number
  x1: number
  x2: number
  h: number
  text: string
  bits: PdfBit[]
}

interface PdfWidget {
  fieldName: string
  alternativeText: string
  fieldType: string
  buttonValue: string
  checkBox: boolean
  radioButton: boolean
  pushButton: boolean
  rect: { x1: number; y1: number; x2: number; y2: number }
}

export function isGenericAcrobatName(name: string): boolean {
  const n = normalizeText(name)
  if (!n) return true
  return /^(champ de texte|case a cocher|champ de signature|text field|textbox|checkbox|signature|undefined)(\s+\d+)?$/.test(n)
}

export async function extractPdfFields(data: ArrayBuffer): Promise<{
  fields: DetectedField[]
  text: string
  pageCount: number
}> {
  const pdfjsLib = await pdfjs()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const textParts: string[] = []
  const fields: DetectedField[] = []

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const lines = clusterLines(content)
    const pageText = lines.map((l) => l.text).join('\n')
    textParts.push(pageText)
    const pageKind = classifyPdfPage(pageText)
    if (pageKind === 'skip') continue

    const pageW = page.view[2] - page.view[0]
    const twoCols = pageHasTwoColumns(pageKind, pageText)
    const docPage = pageKind === 'tenant-docs' || pageKind === 'guarantor-docs'

    const annotations = await page.getAnnotations()
    const pending: { widget: PdfWidget; kind: 'text' | 'checkbox' }[] = []
    for (const annot of annotations) {
      const widget = readWidget(annot)
      if (!widget || widget.pushButton || widget.fieldType === 'Sig') continue
      const kind = widget.checkBox || widget.radioButton || widget.fieldType === 'Btn' ? 'checkbox' : 'text'
      if (docPage && kind === 'checkbox') continue
      pending.push({ widget, kind })
    }

    const labeled = pending.map((item) => ({
      ...item,
      label: resolvePdfLabel(item.widget, lines, item.kind),
    }))
    inheritRowLabels(labeled)

    for (const item of labeled) {
      const label = item.label
      if (!label || isNoisePdfLabel(label) || isSectionHeading(label) || isDocumentChecklist(label)) continue
      if (item.kind === 'text' && isMaritalDetailLabel(label)) continue
      if (pageKind === 'employer-letter' && isEmployerSignatoryLabel(label)) continue

      const slot = twoCols && item.widget.rect.x1 > pageW * 0.48 ? 1 : 0
      const tenant = hintsForPage(pageKind, slot)

      fields.push({
        id: `pdf_${item.widget.fieldName}_${i}_${fields.length}`,
        name: item.widget.fieldName,
        htmlId: item.widget.fieldName,
        type: item.widget.checkBox || item.widget.radioButton ? 'checkbox' : item.widget.fieldType === 'Ch' ? 'select' : 'text',
        tag: 'pdf',
        label,
        placeholder: '',
        autocomplete: '',
        nearbyText: nearbySnippet(item.widget.rect, lines),
        section: nearestSection(item.widget.rect, lines) || `Page ${i}`,
        options: item.widget.buttonValue ? [item.widget.buttonValue] : [],
        required: false,
        tenantHint: tenant.tenantHint,
        roleHint: tenant.roleHint,
        raw: {
          fieldName: item.widget.fieldName,
          page: String(i),
          acrobat: item.widget.fieldName,
          x: String(Math.round(item.widget.rect.x1)),
        },
      })
    }
  }

  return { fields: dedupeFields(fields), text: textParts.join('\n\n'), pageCount: pdf.numPages }
}

export async function renderPdfPages(data: ArrayBuffer, maxPages = 4): Promise<Blob[]> {
  const pdfjsLib = await pdfjs()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const blobs: Blob[] = []
  const count = Math.min(pdf.numPages, maxPages)
  for (let i = 1; i <= count; i += 1) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.6 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob) blobs.push(blob)
  }
  return blobs
}

function readWidget(annot: unknown): PdfWidget | null {
  const a = annot as {
    fieldName?: string
    alternativeText?: string
    fieldType?: string
    buttonValue?: string
    checkBox?: boolean
    radioButton?: boolean
    pushButton?: boolean
    rect?: number[]
    subtype?: string
  }
  if (a.subtype && a.subtype !== 'Widget') return null
  if (!a.fieldName || !a.rect || a.rect.length < 4) return null
  return {
    fieldName: a.fieldName,
    alternativeText: a.alternativeText || '',
    fieldType: a.fieldType || 'Tx',
    buttonValue: a.buttonValue ? String(a.buttonValue) : '',
    checkBox: Boolean(a.checkBox),
    radioButton: Boolean(a.radioButton),
    pushButton: Boolean(a.pushButton),
    rect: {
      x1: Math.min(a.rect[0], a.rect[2]),
      y1: Math.min(a.rect[1], a.rect[3]),
      x2: Math.max(a.rect[0], a.rect[2]),
      y2: Math.max(a.rect[1], a.rect[3]),
    },
  }
}

function clusterLines(content: { items: unknown[] }): PdfLine[] {
  const bits: { str: string; x: number; y: number; w: number; h: number }[] = []
  for (const item of content.items) {
    if (!item || typeof item !== 'object' || !('str' in item)) continue
    const it = item as { str: string; transform: number[]; width: number; height: number }
    if (!it.str?.trim()) continue
    const t = it.transform
    if (!t || t.length < 6) continue
    bits.push({
      str: it.str,
      x: t[4],
      y: t[5],
      w: it.width || Math.abs(t[0]) * it.str.length * 0.5,
      h: it.height || Math.abs(t[3]) || 10,
    })
  }

  const buckets: { y: number; bits: typeof bits }[] = []
  for (const bit of bits.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const bucket = buckets.find((b) => Math.abs(b.y - bit.y) < 3.2)
    if (bucket) {
      bucket.bits.push(bit)
      bucket.y = (bucket.y * (bucket.bits.length - 1) + bit.y) / bucket.bits.length
    } else {
      buckets.push({ y: bit.y, bits: [bit] })
    }
  }

  return buckets.map((bucket) => {
    const ordered = bucket.bits.sort((a, b) => a.x - b.x)
    let text = ''
    let prev: (typeof bits)[number] | null = null
    for (const bit of ordered) {
      if (prev && bit.x - (prev.x + prev.w) > 1.1) text += ' '
      text += bit.str
      prev = bit
    }
    const last = ordered[ordered.length - 1]
    return {
      y: bucket.y,
      x1: ordered[0].x,
      x2: last.x + last.w,
      h: Math.max(...ordered.map((b) => b.h)),
      text: text.replace(/\s+/g, ' ').trim(),
      bits: ordered,
    }
  })
}

function resolvePdfLabel(widget: PdfWidget, lines: PdfLine[], kind: 'text' | 'checkbox'): string {
  const alt = widget.alternativeText.trim()
  if (alt && !isGenericAcrobatName(alt) && alt.length < 80) return cleanLabel(alt)

  const { x1, y1, x2, y2 } = widget.rect
  const cy = (y1 + y2) / 2
  const rowTol = Math.max((y2 - y1) * 0.75, 9)
  const sameRow = (line: PdfLine) => Math.abs(line.y - cy) <= rowTol || (line.y >= y1 - 4 && line.y <= y2 + 4)

  if (kind === 'checkbox') {
    const local = bitsToTheRight(widget.rect, lines)
    if (local) return cleanLabel(local)
  }

  const inside = lines.filter(
    (l) => l.x1 >= x1 - 6 && l.x2 <= x2 + 6 && l.y >= y1 - 4 && l.y <= y2 + 8 && looksLikeFieldLabel(l.text) && !isSectionHeading(l.text),
  )
  if (inside[0]) return cleanLabel(inside[0].text)

  const left = lines
    .filter((l) => sameRow(l) && l.x2 <= x1 + 10 && x1 - l.x2 < 160 && l.text.length < 80 && !isSectionHeading(l.text))
    .sort((a, b) => b.x2 - a.x2)
  if (left[0] && (looksLikeFieldLabel(left[0].text) || left[0].text.length <= 40)) {
    return cleanLabel(trimLabel(left[0].text))
  }

  const above = lines
    .filter(
      (l) =>
        l.y > y2 - 3 &&
        l.y < y2 + 28 &&
        !(l.x2 < x1 - 24 || l.x1 > x2 + 24) &&
        l.text.length < 60 &&
        !isSectionHeading(l.text),
    )
    .sort((a, b) => a.y - b.y)
  if (above[0] && looksLikeFieldLabel(above[0].text)) {
    return cleanLabel(trimLabel(above[0].text))
  }

  if (!isGenericAcrobatName(widget.fieldName) && !isSectionHeading(widget.fieldName)) {
    return cleanLabel(widget.fieldName.replace(/[_[\]]+/g, ' '))
  }
  return ''
}

function bitsToTheRight(rect: PdfWidget['rect'], lines: PdfLine[]): string {
  const cy = (rect.y1 + rect.y2) / 2
  const bits = lines
    .flatMap((l) => l.bits)
    .filter((b) => Math.abs(b.y - cy) < 9 && b.x >= rect.x2 - 2 && b.x <= rect.x2 + 110)
    .sort((a, b) => a.x - b.x)
  if (!bits.length) return ''
  let text = bits[0].str
  let prev = bits[0]
  for (const bit of bits.slice(1)) {
    if (bit.x - (prev.x + prev.w) > 6) break
    text += bit.x - (prev.x + prev.w) > 1.1 ? ` ${bit.str}` : bit.str
    prev = bit
    if (text.replace(/\s/g, '').length > 18) break
  }
  return text.replace(/\s+/g, ' ').trim()
}

function pageHasTwoColumns(kind: PdfPageKind, pageText: string): boolean {
  if (kind === 'tenant-form') return /locataire\s*1/i.test(pageText) && /locataire\s*2/i.test(pageText)
  if (kind === 'guarantor-form') {
    return /(?:cautionnaire|garant|caution)\s*1/i.test(pageText) && /(?:cautionnaire|garant|caution)\s*2/i.test(pageText)
  }
  return false
}

function hintsForPage(
  kind: PdfPageKind,
  slot: number,
): { tenantHint: number; roleHint: DetectedField['roleHint'] } {
  if (kind === 'guarantor-form' || kind === 'guarantor-docs') {
    return { tenantHint: slot, roleHint: 'guarantor' }
  }
  if (kind === 'tenant-form' && slot === 1) {
    return { tenantHint: 1, roleHint: 'cotenant' }
  }
  return { tenantHint: 0, roleHint: 'primary' }
}

function inheritRowLabels(
  items: { widget: PdfWidget; kind: 'text' | 'checkbox'; label: string }[],
): void {
  for (const item of items) {
    if (item.label) continue
    const cy = (item.widget.rect.y1 + item.widget.rect.y2) / 2
    const donor = items
      .filter((other) => {
        if (!other.label || other === item) return false
        const oy = (other.widget.rect.y1 + other.widget.rect.y2) / 2
        return Math.abs(oy - cy) < 14
      })
      .sort((a, b) => a.widget.rect.x1 - b.widget.rect.x1)[0]
    if (donor) item.label = donor.label
  }
}

function nearestSection(rect: PdfWidget['rect'], lines: PdfLine[]): string {
  const above = lines
    .filter((l) => l.y > rect.y2 + 8 && l.y < rect.y2 + 220 && l.text.length < 50)
    .sort((a, b) => a.y - b.y)
  const heading = [...above].reverse().find((l) => {
    const t = l.text
    return (
      /^[A-ZÉÈÀÂÊÎÔÛÙÇ0-9 \-']{4,}$/.test(t) ||
      /identité|identite|coordonn|adresse|employeur|ressource|revenu|garant|locataire|situation|foyer|banque|profession/i.test(
        t,
      )
    )
  })
  return heading?.text ?? ''
}

function nearbySnippet(rect: PdfWidget['rect'], lines: PdfLine[]): string {
  return lines
    .filter((l) => Math.abs(l.y - (rect.y1 + rect.y2) / 2) < 28)
    .sort((a, b) => a.x1 - b.x1)
    .map((l) => l.text)
    .join(' · ')
    .slice(0, 180)
}

function trimLabel(text: string): string {
  const cut = text.replace(/\s*[:.]\s*$/, '').trim()
  const parts = cut.split(/\s+/)
  if (parts.length > 8) return parts.slice(-6).join(' ')
  return cut
}

function cleanLabel(text: string): string {
  return collapseRepeatedLabel(text.replace(/\s+/g, ' ').replace(/[:•*]+$/g, '').trim())
}

function dedupeFields(fields: DetectedField[]): DetectedField[] {
  const seen = new Set<string>()
  return fields.filter((f) => {
    const key = `${f.name}|${f.raw.page ?? ''}|${f.raw.x ?? ''}|${f.tenantHint}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
