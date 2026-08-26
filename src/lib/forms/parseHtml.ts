import type { DetectedField } from '@/types/form'

let fieldSeq = 0

function nextId(): string {
  fieldSeq += 1
  return `f_${fieldSeq}_${Math.random().toString(36).slice(2, 7)}`
}

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file'])

const CONTROL_SELECTOR = [
  'input',
  'select',
  'textarea',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[formcontrolname]',
  '[ng-model]',
  '[data-field]',
  '[data-field-name]',
].join(',')

export function parseHtmlForm(html: string): DetectedField[] {
  fieldSeq = 0
  if (typeof DOMParser === 'undefined') return parseHtmlRegex(html)
  const doc = new DOMParser().parseFromString(wrap(html), 'text/html')
  const fields: DetectedField[] = []
  const seenRadio = new Set<string>()
  const seenKey = new Set<string>()

  const nodes = doc.querySelectorAll(CONTROL_SELECTOR)
  nodes.forEach((el, index) => {
    if (!(el instanceof HTMLElement)) return
    const tag = el.tagName.toLowerCase()
    const type = (el.getAttribute('type') || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'text')).toLowerCase()
    if (SKIP_TYPES.has(type)) return

    if (type === 'radio') {
      const name = el.getAttribute('name') || ''
      if (name && seenRadio.has(name)) return
      if (name) seenRadio.add(name)
    }

    const field = describeElement(el, doc, index, type, tag)
    const key = `${field.name}|${field.htmlId}|${field.label}|${field.placeholder}`
    if (seenKey.has(key)) return
    seenKey.add(key)
    fields.push(field)
  })

  return fields
}

export function parseHtmlLabels(html: string): DetectedField[] {
  fieldSeq = 0
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(wrap(html), 'text/html')
  const labels = [...doc.querySelectorAll('label, legend, dt, th, .label, .form-label, [class*="label"]')]
  const seen = new Set<string>()
  const fields: DetectedField[] = []
  for (const el of labels) {
    if (!(el instanceof HTMLElement)) continue
    if (el.querySelector('input, select, textarea')) continue
    const text = compact(el.textContent || '')
    if (text.length < 2 || text.length > 80) continue
    const n = text.toLowerCase()
    if (seen.has(n)) continue
    seen.add(n)
    fields.push(labelField(text, fields.length))
  }
  return fields
}

export function parseHtmlRegex(html: string): DetectedField[] {
  fieldSeq = 0
  const fields: DetectedField[] = []
  const seen = new Set<string>()
  const re = /<(input|select|textarea)([^>]*)>/gi
  let match: RegExpExecArray | null
  let index = 0
  while ((match = re.exec(html))) {
    const tag = match[1].toLowerCase()
    const attrs = match[2]
    const type = (attr(attrs, 'type') || (tag === 'select' ? 'select' : tag)).toLowerCase()
    if (SKIP_TYPES.has(type)) continue
    const name = attr(attrs, 'name') || attr(attrs, 'formcontrolname') || ''
    const htmlId = attr(attrs, 'id')
    const placeholder = attr(attrs, 'placeholder')
    const aria = attr(attrs, 'aria-label')
    const before = html.slice(Math.max(0, match.index - 180), match.index)
    const wrapped = before.match(/<label\b[^>]*>([^<]*)$/i)
    const wrapLabel = wrapped?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
    const label = aria || wrapLabel || placeholder || name || htmlId
    const key = `${name}|${htmlId}|${label}`
    if (seen.has(key)) continue
    seen.add(key)
    fields.push({
      id: nextId(),
      selector: name ? `${tag}[name="${name}"]` : htmlId ? `${tag}#${htmlId}` : undefined,
      name: name || `field_${index}`,
      htmlId,
      type,
      tag,
      label,
      placeholder,
      autocomplete: attr(attrs, 'autocomplete'),
      nearbyText: label,
      section: '',
      options: [],
      required: /\srequired\b/i.test(attrs),
      tenantHint: tenantHintFromText(`${label} ${name}`),
      roleHint: roleHintFromText(`${label} ${name}`),
      raw: { name, id: htmlId, type, label },
    })
    index += 1
  }
  return fields
}

export function parsePlainTextForm(text: string): DetectedField[] {
  fieldSeq = 0
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.map((line, index) => {
    const cleaned = line.replace(/[:*?•·]+$/g, '').trim()
    return labelField(cleaned, index, lines)
  })
}

function labelField(label: string, index: number, lines: string[] = []): DetectedField {
  return {
    id: nextId(),
    name: `line_${index}`,
    htmlId: '',
    type: guessTypeFromLabel(label),
    tag: 'text',
    label,
    placeholder: '',
    autocomplete: '',
    nearbyText: lines.slice(Math.max(0, index - 1), index + 2).join(' '),
    section: guessSectionFromLines(lines, index),
    options: [],
    required: /obligatoire|\*/i.test(label),
    tenantHint: tenantHintFromText(label),
    roleHint: roleHintFromText(label),
    raw: { text: label },
  }
}

function guessTypeFromLabel(label: string): string {
  const n = label.toLowerCase()
  if (/e-?mail|courriel|mail/.test(n)) return 'email'
  if (/t[eé]l[eé]phone|portable|mobile|phone/.test(n)) return 'tel'
  if (/date|naissance|embauche|emm[eé]nagement/.test(n)) return 'date'
  if (/salaire|revenu|loyer|montant|nombre|nb |code postal|cp\b/.test(n)) return 'number'
  return 'text'
}

function wrap(html: string): string {
  if (/<html/i.test(html) || /<form/i.test(html) || /<input/i.test(html) || /<body/i.test(html)) return html
  return `<form>${html}</form>`
}

function describeElement(
  el: HTMLElement,
  doc: Document,
  index: number,
  type: string,
  tag: string,
): DetectedField {
  const name =
    el.getAttribute('name') ||
    el.getAttribute('formcontrolname') ||
    el.getAttribute('ng-model') ||
    el.getAttribute('data-field') ||
    el.getAttribute('data-field-name') ||
    ''
  const htmlId = el.getAttribute('id') ?? ''
  const placeholder = el.getAttribute('placeholder') ?? ''
  const autocomplete = el.getAttribute('autocomplete') ?? ''
  const label = resolveLabel(el, doc)
  const section = resolveSection(el)
  const nearby = resolveNearby(el)
  const options = collectOptions(el, doc, name, type)

  return {
    id: nextId(),
    selector: cssPath(el, index),
    name,
    htmlId,
    type,
    tag,
    label,
    placeholder,
    autocomplete,
    nearbyText: nearby,
    section,
    options,
    required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
    tenantHint: tenantHintFromText(`${label} ${name} ${section}`),
    roleHint: roleHintFromText(`${label} ${section}`),
    raw: { name, id: htmlId, type, label },
  }
}

function resolveLabel(el: HTMLElement, doc: Document): string {
  const aria = el.getAttribute('aria-label')
  if (aria) return aria.trim()

  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
    if (text) return compact(text)
  }

  const id = el.getAttribute('id')
  if (id) {
    const forLabel = doc.querySelector(`label[for="${cssEscape(id)}"]`)
    if (forLabel) return compact(cloneWithoutControls(forLabel))
  }

  const wrapping = el.closest('label')
  if (wrapping) return compact(cloneWithoutControls(wrapping))

  const dt = el.closest('dd')?.previousElementSibling
  if (dt?.tagName === 'DT' && dt.textContent) return compact(dt.textContent)

  const th = el.closest('td')?.closest('tr')?.querySelector('th')
  if (th?.textContent) return compact(th.textContent)

  const prev = previousText(el)
  if (prev) return prev

  return el.getAttribute('placeholder') || el.getAttribute('name') || ''
}

function cloneWithoutControls(el: Element): string {
  const copy = el.cloneNode(true) as HTMLElement
  copy.querySelectorAll('input, select, textarea, button').forEach((n) => n.remove())
  return copy.textContent || ''
}

function resolveSection(el: HTMLElement): string {
  const legend = el.closest('fieldset')?.querySelector('legend')
  if (legend?.textContent) return compact(legend.textContent)
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const h = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend')
    if (h?.textContent) return compact(h.textContent)
    node = node.parentElement
  }
  return ''
}

function resolveNearby(el: HTMLElement): string {
  const prevEl = el.previousElementSibling
  if (prevEl && !prevEl.matches('input, select, textarea, button')) {
    const text = compact(prevEl.textContent || '')
    if (text.length > 1 && text.length < 80) return text
  }
  return previousText(el)
}

function collectOptions(el: HTMLElement, doc: Document, name: string, type: string): string[] {
  if (el instanceof HTMLSelectElement) {
    return [...el.options].map((o) => o.textContent?.trim() || o.value).filter(Boolean)
  }
  if (type === 'radio' && name) {
    return [...doc.querySelectorAll(`input[type="radio"][name="${cssEscape(name)}"]`)].map((radio) => {
      const input = radio as HTMLInputElement
      const lab = resolveLabel(input, doc)
      return lab || input.value
    })
  }
  return []
}

function previousText(el: HTMLElement): string {
  let node: ChildNode | null = el.previousSibling
  while (node) {
    const text = compact(node.textContent || '')
    if (text.length > 1) return text.slice(0, 80)
    node = node.previousSibling
  }
  return ''
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return value.replace(/"/g, '\\"')
}

function cssPath(el: HTMLElement, index: number): string {
  const name = el.getAttribute('name') || el.getAttribute('formcontrolname')
  const id = el.getAttribute('id')
  const tag = el.tagName.toLowerCase()
  if (id) return `${tag}#${id}`
  if (name) return `${tag}[name="${name}"]`
  return `${tag}:nth-form-field(${index})`
}

function attr(source: string, name: string): string {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  const m = source.match(re)
  return m?.[1] || m?.[2] || m?.[3] || ''
}

export function tenantHintFromText(text: string): number {
  const n = text.toLowerCase()
  if (/locataire\s*2|tenant\s*2|applicant\s*2|co[- ]?locataire|conjoint|co[- ]?titulaire/.test(n)) return 1
  if (/(?:garant|guarantor|cautionnaire|caution)\s*2/.test(n)) return 1
  if (/garant|guarantor|caution/.test(n)) return 0
  const num = n.match(/(?:locataire|tenant|applicant)\s*(\d)/)
  if (num) return Math.max(0, Number(num[1]) - 1)
  return 0
}

export function roleHintFromText(text: string): DetectedField['roleHint'] {
  const n = text.toLowerCase()
  if (/garant|guarantor|caution/.test(n)) return 'guarantor'
  if (/co[- ]?locataire|conjoint|co[- ]?titulaire|tenant 2/.test(n)) return 'cotenant'
  return 'primary'
}

function guessSectionFromLines(lines: string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    if (!lines[i]) continue
    if (/^[A-ZÉÈÀÂÊÎÔÛÙÇ\s]{4,}$/.test(lines[i]) || /:$/.test(lines[i])) return lines[i]
  }
  return ''
}
