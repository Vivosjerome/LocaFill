import { loadProfile, loadSettings, saveSession } from '@/lib/storage/db'
import {
  detectPasteKind,
  extractFieldsFromPaste,
  extractFieldsFromText,
  htmlFromFields,
  unescapeHtml,
} from '@/lib/forms/extract'
import { extractPdfFields, renderPdfPages } from '@/lib/forms/parsePdf'
import { ocrBlob } from '@/lib/ocr'
import { getProvider } from '@/lib/semantic'
import { sessionLanguage } from '@/lib/semantic/mapper'
import type { AnalysisSession, DetectedField, FormSourceKind } from '@/types/form'

export async function analyzeSource(input: {
  kind: FormSourceKind
  html?: string
  text?: string
  file?: File
  title?: string
  onProgress?: (message: string) => void
}): Promise<AnalysisSession> {
  const profile = await loadProfile()
  const settings = await loadSettings()
  const provider = getProvider(settings.semanticProvider)

  let fields: DetectedField[] = []
  let originalHtml = input.html
  let originalText = input.text
  let originalPdf: Blob | undefined
  let sourceKind = input.kind
  let fileName = input.file?.name

  if ((input.kind === 'html' || input.kind === 'text') && (input.html || input.text)) {
    const raw = (input.html || input.text || '').trim()
    const detected = detectPasteKind(raw)
    if (detected === 'url') {
      input.onProgress?.('Téléchargement de la page…')
      try {
        const res = await fetch(raw)
        if (!res.ok) throw new Error(String(res.status))
        const page = await res.text()
        originalHtml = page
        fields = extractFieldsFromPaste(page)
        sourceKind = 'html'
      } catch {
        throw new Error(
          'Cette URL ne peut pas être chargée (blocage CORS). Copiez le HTML de la page via le bookmarklet dans Réglages, ou collez le texte visible des champs.',
        )
      }
    } else {
      sourceKind = detected
      fields = extractFieldsFromPaste(raw)
      originalText = detected === 'text' ? raw : originalText
      originalHtml = nativeHtml(raw, fields, input.title)
    }
  } else if (input.file) {
    const file = input.file
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      input.onProgress?.('Extraction des champs PDF…')
      const buffer = await file.arrayBuffer()
      const extracted = await extractPdfFields(buffer)
      fields = extracted.fields
      originalText = extracted.text
      originalPdf = file
      if (!fields.length) {
        input.onProgress?.('Aucun libellé PDF : OCR des pages…')
        const pages = await renderPdfPages(buffer)
        const texts: string[] = []
        for (const page of pages) {
          texts.push(await ocrBlob(page, (s, p) => input.onProgress?.(`OCR ${s} ${Math.round(p * 100)}%`)))
        }
        originalText = texts.join('\n')
        fields = extractFieldsFromText(originalText)
      }
      sourceKind = 'pdf'
    } else if (file.type.includes('html') || file.name.endsWith('.html') || file.name.endsWith('.htm')) {
      const html = await file.text()
      originalHtml = html
      fields = extractFieldsFromPaste(html)
      originalHtml = nativeHtml(html, fields, file.name)
      sourceKind = 'html'
    } else {
      input.onProgress?.('OCR de l’image…')
      originalText = await ocrBlob(file, (s, p) => input.onProgress?.(`OCR ${s} ${Math.round(p * 100)}%`))
      fields = extractFieldsFromText(originalText)
      sourceKind = 'image'
    }
  }

  if (!fields.length) {
    throw new Error(
      'Aucun champ trouvé. Collez les libellés du formulaire (Nom, Prénom, e-mail…) ou le HTML de la page — pas seulement une URL ou un paragraphe.',
    )
  }

  if (!originalHtml) originalHtml = htmlFromFields(fields, input.title || 'Formulaire')

  input.onProgress?.('Mapping sémantique…')
  const mappings = await provider.analyze(fields, profile, settings)

  const session: AnalysisSession = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    title: input.title || fileName || 'Formulaire',
    sourceKind,
    language: sessionLanguage(fields),
    originalHtml,
    originalText,
    fileName,
    fields,
    mappings,
    provider: provider.id,
    originalPdf,
  }

  await saveSession(session)
  return session
}

function nativeHtml(raw: string, fields: DetectedField[], title?: string): string {
  if (/<(input|select|textarea)\b/i.test(raw)) return unescapeHtml(raw)
  return htmlFromFields(fields, title || 'Formulaire')
}
