import type { DetectedField } from '@/types/form'
import { SYNONYMS } from '@/lib/semantic/synonyms'
import { normalizeText, tokenize } from '@/lib/semantic/normalize'
import {
  parseHtmlForm,
  parseHtmlLabels,
  parseHtmlRegex,
  parsePlainTextForm,
  tenantHintFromText,
  roleHintFromText,
} from './parseHtml'

const ALL_PHRASES = Object.values(SYNONYMS).flat()

export type PasteKind = 'url' | 'html' | 'text'

export function detectPasteKind(raw: string): PasteKind {
  const t = raw.trim()
  if (/^https?:\/\/\S+$/i.test(t) && t.length < 2000) return 'url'
  if (/&lt;\s*(input|form|select|textarea|label)\b/i.test(t)) return 'html'
  if (/<[a-z][\s\S]*>/i.test(t) && /(?:input|select|textarea|form|label|html|div|span|table)/i.test(t)) {
    return 'html'
  }
  return 'text'
}

export function unescapeHtml(raw: string): string {
  if (!/&lt;|&gt;|&amp;|&quot;/.test(raw)) return raw
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function extractFieldsFromPaste(raw: string): DetectedField[] {
  const source = unescapeHtml(raw.trim())
  if (!source) return []

  const kind = detectPasteKind(source)
  if (kind === 'html') {
    const fromDom = parseHtmlForm(source)
    if (fromDom.length) return fromDom
    const fromRegex = parseHtmlRegex(source)
    if (fromRegex.length) return fromRegex
    const fromLabels = parseHtmlLabels(source)
    if (fromLabels.length) return fromLabels
    return extractFieldsFromText(stripTags(source))
  }

  return extractFieldsFromText(source)
}

export function extractFieldsFromText(text: string): DetectedField[] {
  const lines = splitFormLines(text)
  const labels = lines.filter(looksLikeFieldLabel)
  const use = labels.length >= 2 ? labels : lines.filter((l) => l.length >= 2 && l.length <= 70)
  return parsePlainTextForm(use.join('\n'))
}

export function looksLikeFieldLabel(line: string): boolean {
  const cleaned = line.replace(/[:*•·_\s.\-–—]+$/g, '').trim()
  if (cleaned.length < 2 || cleaned.length > 72) return false
  if (/^https?:/i.test(cleaned)) return false
  if (/^\d+([.,]\d+)?\s*(€|eur|%|ans?)?$/i.test(cleaned)) return false
  if (tokenize(cleaned).length > 10) return false
  const n = normalizeText(cleaned)
  if (!n) return false
  if (ALL_PHRASES.some((p) => normalizeText(p) === n)) return true
  if (ALL_PHRASES.some((p) => normalizeText(p).length > 4 && n.includes(normalizeText(p)))) return true
  const first = tokenize(cleaned)[0]
  if (first && ALL_PHRASES.some((p) => normalizeText(p) === first)) return true
  if (/[:?]$/.test(line.trim()) && tokenize(cleaned).length <= 8) return true
  if (/_{3,}|…{2,}|\.{4,}/.test(line)) return true
  return false
}

export function htmlFromFields(fields: DetectedField[], title = 'Formulaire'): string {
  const rows = fields
    .map((f) => {
      const name = f.name || f.id
      const type = f.type === 'email' || f.type === 'tel' || f.type === 'date' || f.type === 'number' ? f.type : 'text'
      if (f.options.length) {
        const opts = f.options.map((o) => `<option>${escapeHtml(o)}</option>`).join('')
        return `<label>${escapeHtml(f.label)}<select name="${escapeHtml(name)}">${opts}</select></label>`
      }
      return `<label>${escapeHtml(f.label)}<input type="${type}" name="${escapeHtml(name)}" placeholder="${escapeHtml(f.placeholder)}"></label>`
    })
    .join('\n')
  return `<!doctype html><html lang="fr"><body><h1>${escapeHtml(title)}</h1><form id="locafill-form">${rows}<button type="submit" disabled>Envoi désactivé</button></form></body></html>`
}

function splitFormLines(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n+| {2,}|\t+|(?<=:)\s+(?=[A-ZÉÈÀÂÊÎÔÛÙÇA-Z])/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export { tenantHintFromText, roleHintFromText }
