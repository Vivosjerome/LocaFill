import Dexie, { type EntityTable } from 'dexie'
import type { AppProfile } from '@/types/profile'
import type { StoredDocument } from '@/types/document'
import type { AnalysisSession, AppSettings } from '@/types/form'
import { EMPTY_PROFILE } from '@/types/profile'

export interface ProfileRow {
  id: string
  data: AppProfile
}

export interface SettingsRow {
  id: string
  data: AppSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultLanguage: 'auto',
  semanticProvider: 'heuristic',
  llmEndpoint: '',
  llmModel: '',
  includeGuarantor: true,
  dateFormat: 'fr',
  installHintDismissed: false,
}

class LocaFillDB extends Dexie {
  profile!: EntityTable<ProfileRow, 'id'>
  documents!: EntityTable<StoredDocument, 'id'>
  sessions!: EntityTable<AnalysisSession, 'id'>
  settings!: EntityTable<SettingsRow, 'id'>

  constructor() {
    super('locafill')
    this.version(1).stores({
      profile: 'id',
      documents: 'id, createdAt, kind',
      sessions: 'id, createdAt',
      settings: 'id',
    })
  }
}

export const db = new LocaFillDB()

export async function loadProfile(): Promise<AppProfile> {
  const row = await db.profile.get('main')
  return row?.data ?? EMPTY_PROFILE()
}

export async function saveProfile(data: AppProfile): Promise<void> {
  await db.profile.put({ id: 'main', data: { ...data, updatedAt: new Date().toISOString() } })
}

export async function loadSettings(): Promise<AppSettings> {
  const row = await db.settings.get('main')
  return { ...DEFAULT_SETTINGS, ...row?.data }
}

export async function saveSettings(data: AppSettings): Promise<void> {
  await db.settings.put({ id: 'main', data })
}

export async function listDocuments(): Promise<StoredDocument[]> {
  return db.documents.orderBy('createdAt').reverse().toArray()
}

export async function addDocument(doc: StoredDocument): Promise<void> {
  await db.documents.put(doc)
}

export async function deleteDocument(id: string): Promise<void> {
  await db.documents.delete(id)
}

export async function saveSession(session: AnalysisSession): Promise<void> {
  await db.sessions.put(session)
}

export async function loadSession(id: string): Promise<AnalysisSession | undefined> {
  return db.sessions.get(id)
}

export async function latestSession(): Promise<AnalysisSession | undefined> {
  return db.sessions.orderBy('createdAt').reverse().first()
}

export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.profile.clear(),
    db.documents.clear(),
    db.sessions.clear(),
    db.settings.clear(),
  ])
}
