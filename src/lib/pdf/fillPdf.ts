import { isTruthyChoice } from '@/lib/semantic/choices'
import type { DetectedField, FieldMapping } from '@/types/form'

export async function fillPdfForm(
  pdf: Blob,
  fields: DetectedField[],
  mappings: FieldMapping[],
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.load(await pdf.arrayBuffer(), { ignoreEncryption: true })
  const pages = doc.getPages()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const byId = new Map(fields.map((f) => [f.id, f]))

  let form: ReturnType<typeof doc.getForm> | null = null
  try {
    form = doc.getForm()
  } catch {
    form = null
  }

  const written = new Set<string>()
  for (const mapping of mappings) {
    if (mapping.skipped) continue
    const value = (mapping.overrideValue ?? mapping.displayValue ?? mapping.value).trim()
    if (!value) continue
    const field = byId.get(mapping.fieldId)
    if (!field?.name || !form) continue
    if (writeField(form, field, value)) written.add(field.id)
  }

  for (const mapping of mappings) {
    if (mapping.skipped || written.has(mapping.fieldId)) continue
    const value = (mapping.overrideValue ?? mapping.displayValue ?? mapping.value).trim()
    if (!value) continue
    const field = byId.get(mapping.fieldId)
    if (!field) continue
    if (drawOverlay(pages, font, rgb, field, value)) written.add(field.id)
  }

  let bytes: Uint8Array
  try {
    bytes = await doc.save({ updateFieldAppearances: Boolean(form && written.size) })
  } catch {
    bytes = await doc.save()
  }
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return new Blob([copy], { type: 'application/pdf' })
}

function writeField(
  form: {
    getTextField: (n: string) => { setText: (v: string) => void }
    getCheckBox: (n: string) => { check: () => void; uncheck: () => void }
    getDropdown: (n: string) => { select: (v: string) => void }
  },
  field: DetectedField,
  value: string,
): boolean {
  const name = field.name
  if (!name || name.startsWith('overlay:')) return false
  try {
    if (field.type === 'checkbox' || field.type === 'radio') {
      const box = form.getCheckBox(name)
      if (isTruthyChoice(value)) box.check()
      else box.uncheck()
      return true
    }
  } catch {
    /* try text */
  }
  try {
    if (field.type === 'select') {
      form.getDropdown(name).select(value)
      return true
    }
  } catch {
    /* try text */
  }
  try {
    form.getTextField(name).setText(value)
    return true
  } catch {
    return false
  }
}

function drawOverlay(
  pages: { getSize: () => { width: number; height: number }; drawText: (t: string, o: object) => void }[],
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  rgb: (r: number, g: number, b: number) => unknown,
  field: DetectedField,
  value: string,
): boolean {
  const pageIndex = Number(field.raw.page || '1') - 1
  const page = pages[pageIndex]
  const x = Number(field.raw.x)
  const y = Number(field.raw.y)
  if (!page || !Number.isFinite(x) || !Number.isFinite(y)) return false

  const maxW = Math.max(24, Number(field.raw.w) || 140)
  const boxH = Math.max(8, Number(field.raw.h) || 11)
  const color = rgb(0.07, 0.12, 0.1)
  const text = toWinAnsi(value)
  if (!text) return false

  try {
    if (field.type === 'checkbox' || field.type === 'radio') {
      if (isTruthyChoice(value)) {
        page.drawText('X', { x: x + 1, y: y + 1, size: Math.min(11, boxH), font, color })
      }
      return true
    }
    const fitted = layoutOverlayText(text, font, maxW - 4, boxH)
    if (!fitted.lines.length) return false
    const lineH = fitted.size + 1.4
    fitted.lines.forEach((line, i) => {
      page.drawText(line, {
        x: x + 2,
        y: Math.max(4, y - i * lineH),
        size: fitted.size,
        font,
        color,
      })
    })
    return true
  } catch {
    return false
  }
}

function layoutOverlayText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  maxW: number,
  boxH: number,
): { lines: string[]; size: number } {
  let size = Math.min(10, Math.max(7, boxH * 0.78))
  const minSize = 6
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5
  if (font.widthOfTextAtSize(text, size) <= maxW) return { lines: [text], size }

  const wrapped = wrapOverlayLine(text, font, size, maxW)
  if (wrapped.length <= 2) return { lines: wrapped, size }

  size = minSize
  const tight = wrapOverlayLine(text, font, size, maxW)
  return { lines: tight.slice(0, 3), size }
}

function wrapOverlayLine(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  size: number,
  maxW: number,
): string[] {
  if (font.widthOfTextAtSize(text, size) <= maxW) return [text]
  const at = text.indexOf('@')
  if (at > 0) {
    const left = text.slice(0, at)
    const right = text.slice(at)
    if (font.widthOfTextAtSize(left, size) <= maxW && font.widthOfTextAtSize(right, size) <= maxW) {
      return [left, right]
    }
  }
  const words = text.split(/(\s+)/).filter((p) => p.length)
  const lines: string[] = []
  let cur = ''
  const flush = () => {
    if (cur) lines.push(cur)
    cur = ''
  }
  for (const part of words) {
    const next = cur + part
    if (cur && font.widthOfTextAtSize(next, size) > maxW) {
      flush()
      cur = part.trimStart()
    } else {
      cur = next
    }
  }
  flush()
  if (lines.length >= 2) return lines
  const chars: string[] = []
  let chunk = ''
  for (const ch of text) {
    if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxW) {
      chars.push(chunk)
      chunk = ch
    } else chunk += ch
  }
  if (chunk) chars.push(chunk)
  return chars.length ? chars : [text]
}

function toWinAnsi(text: string): string {
  const map: Record<string, string> = {
    '\u0153': 'oe',
    '\u0152': 'OE',
    '\u20ac': 'EUR',
    '\u2019': "'",
    '\u2018': "'",
    '\u201c': '"',
    '\u201d': '"',
    '\u2013': '-',
    '\u2014': '-',
    '\u2026': '...',
    '\u2022': '-',
  }
  return Array.from(text)
    .map((ch) => {
      if (map[ch]) return map[ch]
      const code = ch.charCodeAt(0)
      if (code < 128 || (code >= 160 && code <= 255)) return ch
      return ''
    })
    .join('')
}
