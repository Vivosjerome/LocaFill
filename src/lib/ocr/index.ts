import type { DocumentKind, ExtractedField } from '@/types/document'
import type { createWorker as CreateWorker, Worker } from 'tesseract.js'

let workerPromise: Promise<Worker> | null = null

async function getWorker(onProgress?: (status: string, progress: number) => void): Promise<Worker> {
  if (!workerPromise) {
    const { createWorker } = (await import('tesseract.js')) as {
      createWorker: typeof CreateWorker
    }
    workerPromise = createWorker('fra+eng', 1, {
      logger: (m: { status?: string; progress?: number }) => {
        if (m.status && onProgress) {
          onProgress(m.status, typeof m.progress === 'number' ? m.progress : 0)
        }
      },
    })
  }
  return workerPromise
}

export async function ocrBlob(
  blob: Blob,
  onProgress?: (status: string, progress: number) => void,
): Promise<string> {
  const worker = await getWorker(onProgress)
  const { data } = await worker.recognize(blob)
  return data.text ?? ''
}

export function classifyDocument(text: string, fileName: string): { kind: DocumentKind; confidence: number } {
  const blob = `${fileName} ${text}`.toLowerCase()
  const rules: { kind: DocumentKind; tests: RegExp[] }[] = [
    { kind: 'id_card', tests: [/carte nationale/, /identité/, /republique francaise/, /national id/, /cni/] },
    { kind: 'passport', tests: [/passeport/, /passport/, /passeport français/] },
    { kind: 'driver_license', tests: [/permis de conduire/, /driving licence/, /driver.?license/] },
    {
      kind: 'payslip',
      tests: [/bulletin de paie/, /bulletin de salaire/, /net à payer/, /net a payer/, /salaire brut/, /payslip/],
    },
    {
      kind: 'tax_notice',
      tests: [/avis d'impôt/, /avis d impôt/, /direction générale des finances/, /revenu fiscal de référence/],
    },
    { kind: 'employment_contract', tests: [/contrat de travail/, /cdi/, /cdd/, /emploi/, /employment contract/] },
    {
      kind: 'proof_of_address',
      tests: [/justificatif de domicile/, /facture/, /quittance/, /attestation de domicile/, /edf/, /engie/],
    },
    { kind: 'rib', tests: [/\biban\b/, /\bbic\b/, /relevé d'identité bancaire/, /rib/] },
    { kind: 'bank_statement', tests: [/relevé de compte/, /bank statement/, /solde débiteur/, /solde créditeur/] },
    { kind: 'tax_return', tests: [/déclaration de revenus/, /tax return/, /2042/] },
  ]

  let best: { kind: DocumentKind; confidence: number } = { kind: 'other', confidence: 0.2 }
  for (const rule of rules) {
    const hits = rule.tests.filter((t) => t.test(blob)).length
    if (!hits) continue
    const confidence = Math.min(0.95, 0.35 + hits * 0.2)
    if (confidence > best.confidence) best = { kind: rule.kind, confidence }
  }
  return best
}

export function extractFromOcr(kind: DocumentKind, text: string): ExtractedField[] {
  const fields: ExtractedField[] = []
  const pick = (key: string, label: string, value: string | undefined, confidence: number) => {
    if (value?.trim()) fields.push({ key, label, value: value.trim(), confidence })
  }

  pick('fullName', 'Nom détecté', matchAfter(text, /(?:nom(?: et prénoms?)?|name)\s*[:\n]\s*([A-Za-zÀ-ÿ' -]{2,60})/i), 0.55)
  pick('lastName', 'Nom', matchAfter(text, /nom(?: de famille)?\s*[:\n]\s*([A-Za-zÀ-ÿ' -]{2,40})/i), 0.6)
  pick('firstName', 'Prénom', matchAfter(text, /prénom[s]?\s*[:\n]\s*([A-Za-zÀ-ÿ' -]{2,40})/i), 0.6)
  pick(
    'birthDate',
    'Date de naissance',
    matchAfter(text, /né[e]?\s+le\s+(\d{2}[/-]\d{2}[/-]\d{4})/i) || text.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/)?.[1],
    0.5,
  )
  pick('iban', 'IBAN', text.match(/\b([A-Z]{2}\d{2}(?:[ ]?\d{4}){4,7})\b/)?.[1], 0.8)
  pick(
    'netMonthlyIncome',
    'Net à payer',
    matchAmount(text, /net\s*(?:à|a)\s*payer|salaire net|net mensuel/i),
    kind === 'payslip' ? 0.75 : 0.45,
  )
  pick(
    'employerName',
    'Employeur',
    matchAfter(text, /(?:employeur|société|company)\s*[:\n]\s*([A-Za-z0-9À-ÿ' .,&-]{3,60})/i),
    0.5,
  )
  pick('postalCode', 'Code postal', text.match(/\b(\d{5})\b/)?.[1], 0.35)
  pick('email', 'E-mail', text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0], 0.7)
  pick('phone', 'Téléphone', text.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/)?.[0], 0.55)

  return fields
}

function matchAfter(text: string, re: RegExp): string | undefined {
  return text.match(re)?.[1]
}

function matchAmount(text: string, around: RegExp): string | undefined {
  const idx = text.search(around)
  if (idx < 0) return undefined
  const window = text.slice(idx, idx + 80)
  return window.match(/(\d{1,3}(?:[ \u00a0]?\d{3})*(?:[.,]\d{2})?)/)?.[1]?.replace(/\s/g, '')
}
