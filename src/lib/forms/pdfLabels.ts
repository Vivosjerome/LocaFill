import { normalizeText } from '@/lib/semantic/normalize'

export function collapseRepeatedLabel(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t) return t
  const toks = t.split(' ')
  if (toks.length >= 2 && toks.length % 2 === 0) {
    const h = toks.length / 2
    const a = toks.slice(0, h).join(' ')
    const b = toks.slice(h).join(' ')
    if (a === b) return a
  }
  const parts = t.split(/\s*:\s*/)
  if (parts.length === 2 && parts[0].trim() === parts[1].trim()) return parts[0].trim()
  return t
}

export function isSectionHeading(text: string): boolean {
  const n = normalizeText(text)
  return /^(situation professionnelle|situation personnelle|ressources actuelles|votre agence|pieces complementaires|fiche de renseignements|candidat locataire|pour toutes les situations|page \d+|locataire 1 locataire 2|cautionnaire 1 cautionnaire 2)$/.test(
    n,
  )
}

export function isMaritalDetailLabel(text: string): boolean {
  const n = normalizeText(text)
  return (
    /depuis le/.test(n) && /divorce|pacse|marie|veuf|veuve|regime/.test(n)
  ) || /^(communaute|separation|notaire|contrat notaire|regime)$/.test(n) || /regime/.test(n) && /marie/.test(n)
}

export function isDocumentChecklist(text: string): boolean {
  const n = normalizeText(text)
  return /bulletins? de salaire|avis d imposition|pieces? complementaires|justificatif|datee et signee|datée et signée|photocopie|piece d identite|bilans|attestation comptable|attestation employeur|attestation de la banque|extrait k bis|carte etudiante|carte professionnelle|dossier garant|arrete \(si fonctionnaire\)|contrat de stage|contrat d apprentissage|contrat de mission/.test(
    n,
  )
}

export function isNoisePdfLabel(text: string): boolean {
  const t = collapseRepeatedLabel(text)
  const n = normalizeText(t)
  if (!n || n.length < 2) return true
  if (isSectionHeading(t)) return true
  if (isDocumentChecklist(t)) return true
  if (/^(fait a|fait le a|le|a|eme|votre agence|loyer c c|reference adresse du bien)$/.test(n)) return true
  if (/^mademoiselle madame monsieur$/.test(n)) return true
  if (/^madame,? monsieur$/.test(n)) return true
  if (/^nee le ne le$/.test(n)) return true
  if (/communautecontrat|contrat notairecommunaute/.test(n.replace(/\s/g, ''))) return true
  if (t.length > 70) return true
  return false
}

export function isEmployerSignatoryLabel(text: string): boolean {
  const n = normalizeText(text)
  return /agissant en qualite|je soussigne|nous soussignons|^madame,? monsieur$|^oui$|^non$|periode d essai|primes contractuelles/.test(
    n,
  )
}

export type PdfPageKind =
  | 'tenant-form'
  | 'guarantor-form'
  | 'tenant-docs'
  | 'guarantor-docs'
  | 'employer-letter'
  | 'skip'

export function classifyPdfPage(pageText: string): PdfPageKind {
  const n = normalizeText(pageText.slice(0, 1600))
  if (/rgpd|responsable du traitement/.test(n)) return 'skip'
  if (/attestation d hebergement|attestation de rattachement|foyer fiscal/.test(n)) return 'skip'
  if (/attestation employeur/.test(n)) return 'employer-letter'
  if (/pieces a fournir/.test(n) && /garant|caution/.test(n)) return 'guarantor-docs'
  if (/pieces a fournir/.test(n)) return 'tenant-docs'
  const hasCautionCols = /cautionnaire\s*[12]|caution\s*[12]|garant\s*[12]/.test(n)
  const hasTenantCols = /locataire\s*[12]/.test(n)
  if (hasCautionCols && !hasTenantCols) return 'guarantor-form'
  if (/fiche de renseignements/.test(n) && /caution|garant/.test(n) && !hasTenantCols) {
    return 'guarantor-form'
  }
  if (hasTenantCols || /fiche de renseignements/.test(n)) return 'tenant-form'
  return 'tenant-form'
}

export function isMaritalStatusChoice(text: string): boolean {
  const n = normalizeText(collapseRepeatedLabel(text))
  return /^(celibataire|concubin|marie|mariee|pacse|divorce|divorcee|veuf|veuve)$/.test(n)
}
