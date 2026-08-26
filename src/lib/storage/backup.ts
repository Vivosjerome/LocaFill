import type { AppProfile, TenantProfile } from '@/types/profile'
import { EMPTY_HOUSEHOLD, EMPTY_TENANT } from '@/types/profile'

const KIND = 'locafill-profile'
const VERSION = 1

export interface ProfileBackup {
  kind: typeof KIND
  version: number
  exportedAt: string
  profile: AppProfile
}

export function isProfileBackup(data: unknown): data is ProfileBackup {
  if (!data || typeof data !== 'object') return false
  const row = data as ProfileBackup
  return row.kind === KIND && Boolean(row.profile) && Array.isArray(row.profile.tenants)
}

export function makeProfileBackup(profile: AppProfile): ProfileBackup {
  return {
    kind: KIND,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    profile,
  }
}

export function parseProfileBackup(text: string): AppProfile {
  const data = JSON.parse(text) as unknown
  if (!isProfileBackup(data)) throw new Error('Ce fichier n’est pas un export LocaFill.')
  return sanitizeProfile(data.profile)
}

function sanitizeProfile(raw: AppProfile): AppProfile {
  const blank = EMPTY_TENANT('primary')
  const tenants = (raw.tenants ?? []).map((t) => {
    const role = t.role === 'cotenant' || t.role === 'guarantor' ? t.role : 'primary'
    return { ...blank, ...pickTenant(t), role } satisfies TenantProfile
  })
  return {
    household: { ...EMPTY_HOUSEHOLD(), ...raw.household },
    tenants: tenants.length ? tenants : [EMPTY_TENANT('primary')],
    updatedAt: new Date().toISOString(),
  }
}

function pickTenant(t: TenantProfile): Partial<TenantProfile> {
  const keys = Object.keys(EMPTY_TENANT('primary')) as (keyof TenantProfile)[]
  const out: Partial<TenantProfile> = { id: t.id || crypto.randomUUID() }
  for (const key of keys) {
    if (key === 'id' || key === 'role') continue
    const value = t[key]
    if (typeof value === 'string') (out as Record<string, string>)[key] = value
  }
  return out
}
