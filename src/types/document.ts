export type DocumentKind =
  | 'id_card'
  | 'passport'
  | 'driver_license'
  | 'payslip'
  | 'tax_notice'
  | 'employment_contract'
  | 'proof_of_address'
  | 'bank_statement'
  | 'rib'
  | 'tax_return'
  | 'other'

export interface ExtractedField {
  key: string
  label: string
  value: string
  confidence: number
}

export interface StoredDocument {
  id: string
  name: string
  mimeType: string
  size: number
  kind: DocumentKind
  kindConfidence: number
  createdAt: string
  ocrText: string
  extracted: ExtractedField[]
  pageCount?: number
  blob: Blob
}
