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
import { ocrLayout } from '@/lib/ocr'
import { normalizeText } from '@/lib/semantic/normalize'
import type * as PdfJs from 'pdfjs-dist'

let pdfjsPromise: Promise<typeof PdfJs> | null = null

async function pdfjs(): Promise<typeof PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const isNode = typeof window === 'undefined'
      if (isNode) {
        const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfJs
        const { createRequire } = await import('node:module')
        const { pathToFileURL } = await import('node:url')
        const req = createRequire(import.meta.url)
        lib.GlobalWorkerOptions.workerSrc = pathToFileURL(
          req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
        ).href
        return lib
      }
      const lib = await import('pdfjs-dist')
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
      lib.GlobalWorkerOptions.workerSrc = workerUrl
      if (typeof Worker !== 'undefined') {
        lib.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: 'module' })
      }
      return lib
    })()
  }
  return pdfjsPromise
}

function pdfBytes(data: ArrayBuffer): Uint8Array {
  return new Uint8Array(data.slice(0))
}

async function loadPdf(data: ArrayBuffer) {
  const pdfjsLib = await pdfjs()
  return pdfjsLib.getDocument({ data: pdfBytes(data) }).promise
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
  try {
    return await extractPdfFieldsPdfJs(data)
  } catch {
    return extractPdfFieldsPdfLib(data)
  }
}

async function extractPdfFieldsPdfJs(data: ArrayBuffer): Promise<{
  fields: DetectedField[]
  text: string
  pageCount: number
}> {
  const pdf = await loadPdf(data)
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
    const colSplit = findColumnSplit(lines, pageW, pageText)
    const twoCols = colSplit != null
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

      const slot = twoCols && item.widget.rect.x1 >= (colSplit ?? pageW * 0.5) ? 1 : 0
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
        raw: overlayRaw(i, item.widget.rect.x1, item.widget.rect.y1 + 2, item.widget.rect.x2 - item.widget.rect.x1, item.widget.rect.y2 - item.widget.rect.y1, item.widget.fieldName),
      })
    }

    if (!docPage) {
      let layoutLines = lines
      if (pageText.replace(/\s/g, '').length < 40 && typeof document !== 'undefined') {
        const ocrLines = await linesFromOcrPage(page)
        if (ocrLines.length) layoutLines = ocrLines
      }
      const guides = await extractFillGuides(page)
      fields.push(
        ...extractLayoutFields({
          lines: layoutLines,
          pageIndex: i,
          pageW,
          pageKind,
          twoCols,
          occupied: pending.map((p) => p.widget.rect),
          guides,
          colSplit,
        }),
      )
    }
  }

  return {
    fields: applyDuplicateIdentityPages(dedupeFields(fields), textParts),
    text: textParts.join('\n\n'),
    pageCount: pdf.numPages,
  }
}

async function extractPdfFieldsPdfLib(data: ArrayBuffer): Promise<{
  fields: DetectedField[]
  text: string
  pageCount: number
}> {
  const { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField } = await import('pdf-lib')
  const doc = await PDFDocument.load(pdfBytes(data), { ignoreEncryption: true })
  let form
  try {
    form = doc.getForm()
  } catch {
    return { fields: [], text: '', pageCount: doc.getPageCount() }
  }
  const fields: DetectedField[] = []
  for (const f of form.getFields()) {
    const name = f.getName()
    if (!name) continue
    const checkbox = f instanceof PDFCheckBox || f instanceof PDFRadioGroup
    const type = checkbox ? 'checkbox' : f instanceof PDFDropdown ? 'select' : f instanceof PDFTextField ? 'text' : 'text'
    const fromName = name.replace(/[_[\]]+/g, ' ').trim()
    const label = isGenericAcrobatName(fromName) ? fromName : fromName
    fields.push({
      id: `pdf_${name}_${fields.length}`,
      name,
      htmlId: name,
      type,
      tag: 'pdf',
      label,
      placeholder: '',
      autocomplete: '',
      nearbyText: name,
      section: 'PDF',
      options: [],
      required: false,
      tenantHint: 0,
      roleHint: 'primary',
      raw: { fieldName: name, acrobat: name },
    })
  }
  return { fields: dedupeFields(fields), text: '', pageCount: doc.getPageCount() }
}

export async function renderPdfPages(data: ArrayBuffer, maxPages = 4): Promise<Blob[]> {
  const pdf = await loadPdf(data)
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
  const bits: PdfBit[] = []
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
  return clusterBits(bits)
}

function clusterBits(bits: PdfBit[]): PdfLine[] {
  const buckets: { y: number; bits: PdfBit[] }[] = []
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
    let prev: PdfBit | null = null
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

async function linesFromOcrPage(page: PdfJs.PDFPageProxy): Promise<PdfLine[]> {
  const scale = 2
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return []
  const { words } = await ocrLayout(blob)
  const pageH = page.view[3] - page.view[1]
  const bits: PdfBit[] = words.map((w) => ({
    str: w.str,
    x: w.x0 / scale,
    y: pageH - w.y1 / scale,
    w: Math.max(2, (w.x1 - w.x0) / scale),
    h: Math.max(6, (w.y1 - w.y0) / scale),
  }))
  return clusterBits(bits)
}

function overlayRaw(
  page: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fieldName = '',
): Record<string, string> {
  return {
    fieldName,
    page: String(page),
    acrobat: fieldName,
    x: String(Math.round(x)),
    y: String(Math.round(y)),
    w: String(Math.round(Math.max(24, w))),
    h: String(Math.round(Math.max(8, h))),
    overlay: '1',
  }
}

interface FillZone {
  x1: number
  x2: number
  y: number
  h: number
}

async function extractFillGuides(page: PdfJs.PDFPageProxy): Promise<{ lines: FillZone[]; boxes: FillZone[] }> {
  const lib = await pdfjs()
  const OPS = lib.OPS
  const opList = await page.getOperatorList()
  const pageW = page.view[2] - page.view[0]
  const pageH = page.view[3] - page.view[1]
  const onPage = (b: { x1: number; x2: number; y1: number; y2: number }) =>
    b.x1 > -40 && b.x2 < pageW + 40 && b.y1 > -40 && b.y2 < pageH + 40
  const raw: FillZone[] = []
  const boxes: FillZone[] = []
  const stack: number[][] = []
  let ctm = [1, 0, 0, 1, 0, 0]

  const mul = (a: number[], b: number[]) => [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
  const mapBox = (x0: number, y0: number, x1: number, y1: number) => {
    const pts = [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ].map(([x, y]) => ({
      x: ctm[0] * x + ctm[2] * y + ctm[4],
      y: ctm[1] * x + ctm[3] * y + ctm[5],
    }))
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    return {
      x1: Math.min(...xs),
      x2: Math.max(...xs),
      y1: Math.min(...ys),
      y2: Math.max(...ys),
    }
  }

  for (let i = 0; i < opList.fnArray.length; i += 1) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i] as unknown
    if (fn === OPS.save) stack.push(ctm.slice())
    else if (fn === OPS.restore) ctm = stack.pop() || ctm
    else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      ctm = mul(ctm, args as number[])
    } else if (fn === OPS.constructPath) {
      const mm = readMinMax(args)
      if (!mm) continue
      const mapped = mapBox(mm[0], mm[1], mm[2], mm[3])
      const plain = {
        x1: Math.min(mm[0], mm[2]),
        x2: Math.max(mm[0], mm[2]),
        y1: Math.min(mm[1], mm[3]),
        y2: Math.max(mm[1], mm[3]),
      }
      const box = onPage(mapped) ? mapped : plain
      const w = box.x2 - box.x1
      const h = box.y2 - box.y1
      if (w < 18) continue
      if (h <= 3.8) {
        raw.push({ x1: box.x1, x2: box.x2, y: (box.y1 + box.y2) / 2, h: Math.max(h, 1) })
      } else if (h >= 7 && h <= 42 && w >= 28) {
        boxes.push({ x1: box.x1, x2: box.x2, y: box.y1, h })
      }
    }
  }

  return { lines: mergeZones(raw, 8), boxes: mergeZones(boxes, 4) }
}

function readMinMax(args: unknown): number[] | null {
  const list = Array.isArray(args) ? args : args != null ? [args] : []
  for (const item of list) {
    if (!item) continue
    if (Array.isArray(item) && item.length >= 4 && item.slice(0, 4).every((v) => typeof v === 'number')) {
      const [a, b, c, d] = item as number[]
      return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)]
    }
    if (typeof item === 'object' && item !== null && 'length' in item) {
      const arr = Array.from(item as ArrayLike<number>)
      if (arr.length >= 4 && arr.slice(0, 4).every((v) => typeof v === 'number' && Number.isFinite(v))) {
        return [Math.min(arr[0], arr[2]), Math.min(arr[1], arr[3]), Math.max(arr[0], arr[2]), Math.max(arr[1], arr[3])]
      }
    }
  }
  return null
}

function mergeZones(zones: FillZone[], gap: number): FillZone[] {
  const sorted = [...zones].sort((a, b) => a.y - b.y || a.x1 - b.x1)
  const out: FillZone[] = []
  for (const z of sorted) {
    const hit = out.find((o) => Math.abs(o.y - z.y) < 2.2 && z.x1 <= o.x2 + gap && z.x2 >= o.x1 - gap)
    if (hit) {
      hit.x1 = Math.min(hit.x1, z.x1)
      hit.x2 = Math.max(hit.x2, z.x2)
      hit.h = Math.max(hit.h, z.h)
    } else out.push({ ...z })
  }
  return out.filter((z) => z.x2 - z.x1 >= 22)
}

function isLeaderText(text: string): boolean {
  const t = text.replace(/\s/g, '')
  if (!t) return false
  if (/^[.\-_·•…=\u2013\u2014]{1,}$/.test(t)) return true
  const rest = t.replace(/[.\-_·•…=\u2013\u2014]/g, '')
  return t.length >= 3 && rest.length / t.length <= 0.2
}

function leaderZonesFromLine(line: PdfLine): FillZone[] {
  const zones: FillZone[] = []
  let run: PdfBit[] = []
  const flush = () => {
    if (!run.length) return
    const x1 = run[0].x
    const last = run[run.length - 1]
    const x2 = last.x + last.w
    if (x2 - x1 >= 16) zones.push({ x1, x2, y: line.y, h: Math.max(line.h, 8) })
    run = []
  }
  for (const bit of line.bits) {
    const mixed = bit.str.match(/^(.*?)([.\-_·•…]{3,})(.*)$/)
    if (mixed && mixed[1].replace(/\s/g, '').length > 0) {
      flush()
      const startRatio = mixed[1].length / Math.max(1, bit.str.length)
      const leaderLen = mixed[2].length / Math.max(1, bit.str.length)
      const x1 = bit.x + bit.w * startRatio
      const x2 = x1 + bit.w * leaderLen
      if (x2 - x1 >= 16) zones.push({ x1, x2, y: line.y, h: Math.max(line.h, 8) })
      continue
    }
    if (isLeaderText(bit.str)) run.push(bit)
    else flush()
  }
  flush()
  return zones
}

function extractLayoutFields(input: {
  lines: PdfLine[]
  pageIndex: number
  pageW: number
  pageKind: PdfPageKind
  twoCols: boolean
  occupied: PdfWidget['rect'][]
  guides: { lines: FillZone[]; boxes: FillZone[] }
  colSplit: number | null
}): DetectedField[] {
  const { lines, pageIndex, pageW, pageKind, occupied, guides, colSplit } = input
  const fields: DetectedField[] = []
  const textLeaders = lines.flatMap(leaderZonesFromLine)
  const allLines = splitAcrossColumn(mergeZones([...guides.lines, ...textLeaders], 6), colSplit)
  const boxes = splitAcrossColumn(guides.boxes, colSplit)

  const taken = (x: number, y: number) =>
    occupied.some((r) => x >= r.x1 - 8 && x <= r.x2 + 8 && y >= r.y1 - 8 && y <= r.y2 + 8)

  const colEnd = (x: number) => (colSplit != null && x < colSplit ? colSplit - 10 : pageW - 16)

  const labelBits = (line: PdfLine) =>
    line.bits.filter((b) => !isLeaderText(b.str) && b.str.replace(/[.\-_·•…]/g, '').trim().length > 0)

  const push = (label: string, zone: FillZone, nearby: string, labelX: number) => {
    const cleaned = cleanLabel(label.replace(/[.\-_·•…]{2,}/g, ' '))
    if (!cleaned || isNoisePdfLabel(cleaned) || isSectionHeading(cleaned) || isDocumentChecklist(cleaned)) return
    if (!looksLikeFieldLabel(cleaned)) return
    if (isMaritalDetailLabel(cleaned) || isEmployerSignatoryLabel(cleaned)) return
    const x = zone.x1 + 2
    const w = zone.x2 - zone.x1 - 4
    const y = zone.y + Math.min(3, zone.h * 0.25)
    if (taken(x, y) || w < 18) return
    const slot = colSplit != null && labelX >= colSplit ? 1 : 0
    const tenant = hintsForPage(pageKind, slot)
    occupied.push({ x1: zone.x1, y1: zone.y - 4, x2: zone.x2, y2: zone.y + zone.h + 4 })
    fields.push({
      id: `pdf_overlay_${pageIndex}_${Math.round(x)}_${Math.round(y)}_${fields.length}`,
      name: `overlay:${pageIndex}:${Math.round(x)}:${Math.round(y)}`,
      htmlId: '',
      type: 'text',
      tag: 'pdf-overlay',
      label: cleaned,
      placeholder: '',
      autocomplete: '',
      nearbyText: nearby,
      section: nearestSection({ x1: x, y1: y, x2: x + w, y2: y + 10 }, lines) || `Page ${pageIndex}`,
      options: [],
      required: false,
      tenantHint: tenant.tenantHint,
      roleHint: tenant.roleHint,
      raw: overlayRaw(pageIndex, x, y, w, Math.max(9, zone.h)),
    })
  }

  const zoneFor = (labelEnd: number, labelY: number, left: number): FillZone | null => {
    const right = colEnd(left)
    const sameCol = (z: FillZone) =>
      colSplit == null || (left < colSplit ? z.x2 <= colSplit + 8 : z.x1 >= colSplit - 8)
    const onRow = (z: FillZone) =>
      sameCol(z) && Math.abs(z.y - labelY) <= 9 && z.x2 > labelEnd + 6 && z.x1 < right + 8
    const rowLeaders = allLines.filter((z) => onRow(z) && z.x1 >= labelEnd - 12).sort((a, b) => a.x1 - b.x1)
    if (rowLeaders[0]) {
      const z = rowLeaders[0]
      return { ...z, x1: Math.max(z.x1, labelEnd + 2), x2: Math.min(z.x2, right) }
    }
    const rowBox = boxes
      .filter((z) => sameCol(z) && Math.abs(z.y + z.h / 2 - labelY) <= 12 && z.x1 >= labelEnd - 8 && z.x1 < right)
      .sort((a, b) => a.x1 - b.x1)[0]
    if (rowBox) return { x1: rowBox.x1 + 2, x2: Math.min(rowBox.x2 - 2, right), y: rowBox.y + 2, h: rowBox.h }
    const below = [...allLines, ...boxes]
      .filter((z) => sameCol(z) && z.y < labelY - 1 && labelY - z.y < 22 && z.x2 > labelEnd - 20 && z.x1 < right)
      .sort((a, b) => labelY - (a.y + (a.h || 0)) - (labelY - (b.y + (b.h || 0))) || a.x1 - b.x1)
    if (below[0]) {
      const z = below[0]
      return {
        x1: Math.min(Math.max(z.x1, left), z.x2 - 24),
        x2: Math.min(z.x2, right),
        y: z.y + 2,
        h: Math.max(z.h, 9),
      }
    }
    return null
  }

  for (const line of lines) {
    const useful = labelBits(line)
    if (!useful.length) continue
    const groups: PdfBit[][] = [[useful[0]]]
    for (const bit of useful.slice(1)) {
      const cur = groups[groups.length - 1]
      const prev = cur[cur.length - 1]
      if (bit.x - (prev.x + prev.w) < 14) cur.push(bit)
      else groups.push([bit])
    }
    for (let gi = 0; gi < groups.length; gi += 1) {
      const group = groups[gi]
      const label = group
        .map((b) => b.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      const end = group[group.length - 1].x + group[group.length - 1].w
      let zone = zoneFor(end, line.y, group[0].x)
      if (!zone) {
        const nextX = groups[gi + 1]?.[0]?.x ?? colEnd(group[0].x)
        if (nextX - end >= 52) {
          zone = { x1: end + 16, x2: nextX - 8, y: line.y, h: Math.max(line.h, 10) }
        }
      }
      if (zone) push(label, zone, line.text, group[0].x)
    }
  }

  return fields
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

function applyDuplicateIdentityPages(fields: DetectedField[], textParts: string[]): DetectedField[] {
  const identityPages: number[] = []
  textParts.forEach((text, idx) => {
    const n = normalizeText(text)
    if (classifyPdfPage(text) !== 'tenant-form') return
    if (/locataire\s*1/.test(n) && /locataire\s*2/.test(n) && /situation personnelle/.test(n)) return
    if (/nom/.test(n) && /naissance/.test(n)) identityPages.push(idx + 1)
  })
  if (identityPages.length < 2) return fields
  const slotOf = new Map(identityPages.map((page, slot) => [page, slot]))
  return fields.map((field) => {
    const page = Number(field.raw.page || '0')
    const slot = slotOf.get(page)
    if (slot == null || slot === 0) return field
    if (field.roleHint === 'guarantor') return field
    const tenant = hintsForPage('tenant-form', slot)
    return { ...field, tenantHint: tenant.tenantHint, roleHint: tenant.roleHint }
  })
}

function splitAcrossColumn(zones: FillZone[], split: number | null): FillZone[] {
  if (split == null) return zones
  const out: FillZone[] = []
  for (const z of zones) {
    if (z.x1 < split - 6 && z.x2 > split + 6) {
      out.push({ ...z, x2: split - 6 })
      out.push({ ...z, x1: split + 6 })
    } else {
      out.push(z)
    }
  }
  return out.filter((z) => z.x2 - z.x1 >= 16)
}

function findColumnSplit(lines: PdfLine[], pageW: number, pageText: string): number | null {
  for (const line of lines) {
    const n = normalizeText(line.text)
    const has1 = /(?:locataire|cautionnaire|caution|garant|candidat)\s*1/.test(n)
    const has2 = /(?:locataire|cautionnaire|caution|garant|candidat)\s*2/.test(n)
    if (!has1 || !has2) continue
    let x1: number | undefined
    let x2: number | undefined
    const bits = line.bits
    for (let i = 0; i < bits.length; i += 1) {
      const local = normalizeText(bits.slice(i, i + 4).map((b) => b.str).join(' '))
      if (x1 == null && /(?:locataire|cautionnaire|caution|garant|candidat)\s*1/.test(local)) x1 = bits[i].x
      if (/(?:locataire|cautionnaire|caution|garant|candidat)\s*2/.test(local)) x2 = bits[i].x
    }
    if (x1 != null && x2 != null && x2 > x1 + 40) return Math.round((x1 + x2) / 2)
  }

  let votes = 0
  let splitSum = 0
  for (const line of lines) {
    const useful = line.bits.filter((b) => !isLeaderText(b.str) && b.str.trim())
    if (useful.length < 2) continue
    const groups: PdfBit[][] = [[useful[0]]]
    for (const bit of useful.slice(1)) {
      const cur = groups[groups.length - 1]
      const prev = cur[cur.length - 1]
      if (bit.x - (prev.x + prev.w) < 16) cur.push(bit)
      else groups.push([bit])
    }
    const labeled = groups.filter((g) => looksLikeFieldLabel(g.map((b) => b.str).join(' ')))
    if (labeled.length >= 2) {
      const a = labeled[0][0].x
      const b = labeled[1][0].x
      if (b - a > pageW * 0.28) {
        votes += 1
        splitSum += (a + b) / 2
      }
    }
  }
  if (votes >= 2) return Math.round(splitSum / votes)

  if (pageHasTwoColumns('tenant-form', pageText) || pageHasTwoColumns('guarantor-form', pageText)) {
    return Math.round(pageW * 0.5)
  }
  return null
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
