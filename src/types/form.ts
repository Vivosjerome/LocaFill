export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none'

export type FormSourceKind = 'html' | 'pdf' | 'image' | 'text'

export type SemanticProviderId = 'heuristic' | 'llm'

export interface DetectedField {
  id: string
  selector?: string
  name: string
  htmlId: string
  type: string
  tag: string
  label: string
  placeholder: string
  autocomplete: string
  nearbyText: string
  section: string
  options: string[]
  required: boolean
  tenantHint: number
  roleHint: 'primary' | 'cotenant' | 'guarantor' | null
  raw: Record<string, string>
}

export interface FieldMapping {
  fieldId: string
  canonicalKey: string
  tenantIndex: number
  value: string
  displayValue: string
  source: string
  confidence: ConfidenceLevel
  score: number
  rationale: string
  skipped: boolean
  overrideValue?: string
}

export interface AnalysisSession {
  id: string
  createdAt: string
  title: string
  sourceKind: FormSourceKind
  language: string
  originalHtml?: string
  originalText?: string
  fileName?: string
  fields: DetectedField[]
  mappings: FieldMapping[]
  provider: SemanticProviderId
  originalPdf?: Blob
}

export interface AppSettings {
  defaultLanguage: 'fr' | 'en' | 'auto'
  semanticProvider: SemanticProviderId
  llmEndpoint: string
  llmModel: string
  includeGuarantor: boolean
  dateFormat: 'fr' | 'iso'
  installHintDismissed: boolean
}
