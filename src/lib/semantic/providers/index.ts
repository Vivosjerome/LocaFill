import type { DetectedField, FieldMapping, SemanticProviderId } from '@/types/form'
import type { AppProfile } from '@/types/profile'
import type { AppSettings } from '@/types/form'
import { mapFields } from '../mapper'

export interface SemanticProvider {
  id: SemanticProviderId
  label: string
  description: string
  isAvailable(): boolean
  analyze(
    fields: DetectedField[],
    profile: AppProfile,
    settings: AppSettings,
  ): Promise<FieldMapping[]>
}

export const heuristicProvider: SemanticProvider = {
  id: 'heuristic',
  label: 'Heuristique locale',
  description:
    'Analyse les libellés, le DOM, le type des champs et un dictionnaire sémantique FR/EN. Fonctionne hors ligne.',
  isAvailable: () => true,
  async analyze(fields, profile, settings) {
    return mapFields(fields, profile, settings)
  },
}

export const llmProvider: SemanticProvider = {
  id: 'llm',
  label: 'IA / LLM (prévu)',
  description:
    'Point d’extension pour un modèle de langage. Aucun appel n’est effectué tant qu’un endpoint n’est pas configuré.',
  isAvailable() {
    return false
  },
  async analyze(fields, profile, settings) {
    return mapFields(fields, profile, settings)
  },
}

export function getProvider(id: SemanticProviderId): SemanticProvider {
  return id === 'llm' ? llmProvider : heuristicProvider
}

export const PROVIDERS = [heuristicProvider, llmProvider]
