import type { DetectedField } from '@/types/form'
import { CANONICAL_FIELDS, type CanonicalKey } from './canonical'
import { containsPhrase, normalizeText, splitIdentifier, tokenize } from './normalize'
import { AUTOCOMPLETE_MAP, OPTION_HINTS, SECTION_HINTS, SYNONYMS, TYPE_HINTS } from './synonyms'

export interface ScoreBreakdown {
  key: CanonicalKey
  score: number
  reasons: string[]
}

function phraseHit(text: string, phrase: string): 'exact' | 'contains' | null {
  const n = normalizeText(text)
  const p = normalizeText(phrase)
  if (!p || !n) return null
  if (n === p) return 'exact'
  const pTokens = p.split(' ').filter(Boolean)
  if (pTokens.length === 1 && p.length <= 4) {
    const tokens = tokenize(text)
    if (tokens[0] === p) return 'contains'
    return null
  }
  if (containsPhrase(text, phrase)) return 'contains'
  return null
}

function bestHit(text: string, synonyms: string[]): { phrase: string; hit: 'exact' | 'contains' } | null {
  const sorted = [...synonyms].sort((a, b) => normalizeText(b).length - normalizeText(a).length)
  let best: { phrase: string; hit: 'exact' | 'contains' } | null = null
  for (const phrase of sorted) {
    const hit = phraseHit(text, phrase)
    if (!hit) continue
    if (hit === 'exact') return { phrase, hit }
    if (!best) best = { phrase, hit }
  }
  return best
}

export function scoreField(field: DetectedField): ScoreBreakdown[] {
  const label = field.label || ''
  const ident = `${splitIdentifier(field.name)} ${splitIdentifier(field.htmlId)}`
  const type = field.type.toLowerCase()
  const results: ScoreBreakdown[] = []

  for (const key of CANONICAL_FIELDS) {
    const reasons: string[] = []
    let score = 0
    const synonyms = SYNONYMS[key]

    const ac = field.autocomplete.toLowerCase().split(' ').pop() ?? ''
    if (ac && AUTOCOMPLETE_MAP[ac] === key) {
      score += 0.6
      reasons.push(`autocomplete « ${ac} »`)
    }

    const labelHit = bestHit(label, synonyms)
    if (labelHit?.hit === 'exact') {
      score += 0.9
      reasons.push(`libellé exact « ${labelHit.phrase} »`)
    } else if (labelHit?.hit === 'contains') {
      score += normalizeText(labelHit.phrase).split(' ').length > 1 ? 0.72 : 0.48
      reasons.push(`libellé « ${labelHit.phrase} »`)
    }

    const phHit = bestHit(field.placeholder, synonyms)
    if (phHit && !labelHit) {
      score += phHit.hit === 'exact' ? 0.7 : 0.4
      reasons.push(`placeholder « ${phHit.phrase} »`)
    }

    const idHit = bestHit(ident, synonyms)
    if (idHit && score < 0.5) {
      score += idHit.hit === 'exact' ? 0.45 : 0.28
      reasons.push(`nom technique « ${idHit.phrase} »`)
    }

    const typeKeys = TYPE_HINTS[type]
    if (typeKeys?.includes(key) && score > 0) {
      score += typeKeys[0] === key ? 0.08 : 0.03
    }

    for (const hint of OPTION_HINTS) {
      if (hint.key !== key) continue
      if (hint.patterns.test(field.options.join(' '))) {
        score += 0.18
        reasons.push('valeurs du champ cohérentes')
      }
    }

    for (const section of SECTION_HINTS) {
      if (section.pattern.test(field.section) && section.boost.includes(key)) {
        score += 0.08
        reasons.push(`section « ${normalizeText(field.section)} »`)
      }
    }

    const employerCtx = /employeur|employer|societe|company|entreprise|situation professionnelle/i.test(
      `${label} ${field.section} ${ident}`,
    )
    if (key.startsWith('employer') && employerCtx) score += 0.14
    if ((key === 'email' || key === 'phone') && employerCtx) {
      score -= 0.5
      reasons.push('contexte employeur')
    }
    if ((key === 'street' || key === 'addressFull' || key === 'postalCode' || key === 'city') && employerCtx) {
      score -= 0.45
      reasons.push('adresse perso écartée (employeur)')
    }

    if (key === 'fullName' && phraseHit(label, 'prenom') && !bestHit(label, SYNONYMS.fullName.filter((s) => s !== 'name'))) {
      score -= 0.45
    }
    if (key === 'lastName' && phraseHit(label, 'prenom') && !phraseHit(label, 'nom de famille')) {
      score -= 0.5
    }

    score = Math.max(0, Math.min(1, score))
    if (score >= 0.28) results.push({ key, score, reasons })
  }

  return results.sort((a, b) => b.score - a.score)
}

export function confidenceFromScore(score: number) {
  if (score >= 0.75) return 'high' as const
  if (score >= 0.5) return 'medium' as const
  if (score >= 0.38) return 'low' as const
  return 'none' as const
}
