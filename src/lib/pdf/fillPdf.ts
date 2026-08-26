import { isTruthyChoice } from '@/lib/semantic/choices'
import type { DetectedField, FieldMapping } from '@/types/form'

export async function fillPdfForm(
  pdf: Blob,
  fields: DetectedField[],
  mappings: FieldMapping[],
): Promise<Blob> {
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await pdf.arrayBuffer(), { ignoreEncryption: true })
  const form = doc.getForm()
  const byId = new Map(fields.map((f) => [f.id, f]))
  let filled = 0

  for (const mapping of mappings) {
    if (mapping.skipped) continue
    const value = (mapping.overrideValue ?? mapping.displayValue ?? mapping.value).trim()
    if (!value) continue
    const field = byId.get(mapping.fieldId)
    if (!field?.name) continue
    if (writeField(form, field, value)) filled += 1
  }

  if (!filled) throw new Error('Aucun champ PDF n’a pu être écrit. Les noms Acrobat ne correspondent peut-être pas.')

  let bytes: Uint8Array
  try {
    bytes = await doc.save({ updateFieldAppearances: true })
  } catch {
    bytes = await doc.save()
  }
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return new Blob([copy], { type: 'application/pdf' })
}

function writeField(
  form: { getTextField: (n: string) => { setText: (v: string) => void }; getCheckBox: (n: string) => { check: () => void; uncheck: () => void }; getDropdown: (n: string) => { select: (v: string) => void } },
  field: DetectedField,
  value: string,
): boolean {
  const name = field.name
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
