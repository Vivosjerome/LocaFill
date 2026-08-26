import type { DetectedField, FieldMapping } from '@/types/form'

export interface FillResult {
  filled: number
  skipped: number
  missing: number
}

export function fillDocument(
  doc: Document,
  fields: DetectedField[],
  mappings: FieldMapping[],
): FillResult {
  const byId = new Map(fields.map((f) => [f.id, f]))
  let filled = 0
  let skipped = 0
  let missing = 0

  for (const mapping of mappings) {
    if (mapping.skipped || !mapping.displayValue) {
      skipped += 1
      continue
    }
    const field = byId.get(mapping.fieldId)
    if (!field) {
      missing += 1
      continue
    }
    const ok = applyValue(doc, field, mapping.displayValue)
    if (ok) filled += 1
    else missing += 1
  }

  return { filled, skipped, missing }
}

function applyValue(doc: Document, field: DetectedField, value: string): boolean {
  const el = findElement(doc, field)
  if (!el) return false

  if (el instanceof HTMLSelectElement) {
    const option = [...el.options].find(
      (o) =>
        o.value === value ||
        o.text === value ||
        o.text.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(o.text.toLowerCase()),
    )
    if (option) {
      el.value = option.value
      fire(el)
      return true
    }
    return false
  }

  if (el instanceof HTMLInputElement && el.type === 'radio') {
    const name = el.name
    const group = name
      ? [...doc.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${cssEscape(name)}"]`)]
      : [el]
    const match = group.find((radio) => {
      const label = radio.labels?.[0]?.textContent?.trim() ?? ''
      return (
        radio.value === value ||
        label === value ||
        label.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(label.toLowerCase())
      )
    })
    if (match) {
      match.checked = true
      fire(match)
      return true
    }
    return false
  }

  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    const truthy = /oui|yes|true|1|on|x/i.test(value)
    el.checked = truthy
    fire(el)
    return true
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = value
    fire(el)
    return true
  }

  return false
}

function findElement(doc: Document, field: DetectedField): Element | null {
  if (field.htmlId) {
    const byId = doc.getElementById(field.htmlId)
    if (byId) return byId
  }
  if (field.name) {
    const byName = doc.querySelector(`[name="${cssEscape(field.name)}"]`)
    if (byName) return byName
  }
  if (field.selector && !field.selector.includes('nth-form-field')) {
    const bySel = doc.querySelector(field.selector)
    if (bySel) return bySel
  }
  return null
}

function fire(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
  return value.replace(/"/g, '\\"')
}

export function disableSubmit(doc: Document) {
  doc.querySelectorAll('form').forEach((form) => {
    form.addEventListener(
      'submit',
      (e) => {
        e.preventDefault()
        e.stopPropagation()
      },
      true,
    )
  })
  doc.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((btn) => {
    btn.setAttribute('disabled', 'true')
    btn.setAttribute('title', 'LocaFill ne soumet jamais un formulaire automatiquement')
  })
}
