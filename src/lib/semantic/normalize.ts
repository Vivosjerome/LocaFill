const STOPWORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'un',
  'une',
  'et',
  'ou',
  'the',
  'a',
  'an',
  'of',
  'your',
  'vous',
  'votre',
  'vos',
  'please',
  'enter',
  'saisir',
  'indiquer',
  'renseigner',
  'field',
  'champ',
])

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
}

export function normalizeText(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[_./\\-]+/g, ' ')
    .replace(/[^a-z0-9\s@+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitIdentifier(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d+)/g, ' $1 ')
}

export function tokenize(value: string): string[] {
  return normalizeText(splitIdentifier(value))
    .split(' ')
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

export function uniqueTokens(values: string[]): string[] {
  return [...new Set(values.flatMap(tokenize))]
}

export function containsPhrase(haystack: string, phrase: string): boolean {
  const h = ` ${normalizeText(haystack)} `
  const p = ` ${normalizeText(phrase)} `
  if (p === '  ') return false
  return h.includes(p)
}

export function tokenOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  const inter = a.filter((t) => setB.has(t)).length
  return inter / Math.max(a.length, b.length)
}
