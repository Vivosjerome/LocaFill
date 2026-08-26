import type { PDFDocument, PDFImage } from 'pdf-lib'

export async function imagesToPdf(files: Blob[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const pdf = await PDFDocument.create()
  for (const file of files) {
    const image = await embedImage(pdf, file)
    const page = pdf.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }
  const out = await pdf.save()
  return bytesToPdfBlob(out)
}

export async function mergePdfs(files: Blob[]): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const out = await PDFDocument.create()
  for (const file of files) {
    const src = await PDFDocument.load(await file.arrayBuffer())
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  const bytes = await out.save()
  return bytesToPdfBlob(bytes)
}

export async function assembleToPdf(files: Blob[]): Promise<Blob> {
  const pdfs: Blob[] = []
  const images: Blob[] = []
  for (const file of files) {
    if (file.type === 'application/pdf') pdfs.push(file)
    else images.push(file)
  }
  const parts: Blob[] = []
  if (images.length) parts.push(await imagesToPdf(images))
  parts.push(...pdfs)
  if (parts.length === 1) return parts[0]
  return mergePdfs(parts)
}

function bytesToPdfBlob(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return new Blob([copy], { type: 'application/pdf' })
}

async function embedImage(pdf: PDFDocument, file: Blob): Promise<PDFImage> {
  const mime = file.type
  const bytes = new Uint8Array(await file.arrayBuffer())
  try {
    if (mime.includes('png')) return await pdf.embedPng(bytes)
    if (mime.includes('jpeg') || mime.includes('jpg')) return await pdf.embedJpg(bytes)
  } catch {
    /* convert via canvas */
  }
  const png = await blobToPngBytes(file)
  return pdf.embedPng(png)
}

async function blobToPngBytes(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponible')
  ctx.drawImage(bitmap, 0, 0)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
  })
  return new Uint8Array(await blob.arrayBuffer())
}
