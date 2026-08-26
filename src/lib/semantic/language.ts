import { normalizeText } from './normalize'

export function detectLanguage(texts: string[]): string {
  const blob = normalizeText(texts.join(' '))
  const frHits = (
    blob.match(
      /\b(nom|prenom|adresse|ville|telephone|salaire|revenus|employeur|locataire|garantie|civilite|naissance)\b/g,
    ) ?? []
  ).length
  const enHits = (
    blob.match(
      /\b(name|surname|address|city|phone|salary|income|employer|tenant|guarantor|birth|first)\b/g,
    ) ?? []
  ).length
  if (frHits === 0 && enHits === 0) return 'unknown'
  return frHits >= enHits ? 'fr' : 'en'
}
