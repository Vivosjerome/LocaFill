import type { CanonicalKey } from './canonical'
import type { AppProfile, TenantProfile } from '@/types/profile'

const HOUSEHOLD_KEYS = new Set<CanonicalKey>([
  'peopleCount',
  'childrenCount',
  'currentRent',
  'desiredMoveDate',
  'desiredCity',
])

export function tenantLabel(tenant: TenantProfile, index: number): string {
  return tenant.label || `Locataire ${index + 1}`
}

export function readProfileValue(
  profile: AppProfile,
  key: CanonicalKey,
  tenantIndex: number,
): { value: string; source: string } {
  const tenant = profile.tenants[tenantIndex] ?? profile.tenants[0]
  if (!tenant) return { value: '', source: 'Profil vide' }

  if (HOUSEHOLD_KEYS.has(key)) {
    const value = profile.household[key as keyof typeof profile.household] ?? ''
    return { value, source: 'Profil — foyer' }
  }

  if (key === 'fullName') {
    const value = [tenant.firstName, tenant.lastName].filter(Boolean).join(' ')
    return { value, source: `Profil — ${tenantLabel(tenant, tenantIndex)}` }
  }

  if (key === 'addressFull') {
    const locality = `${tenant.postalCode} ${tenant.city}`.trim()
    const parts = [tenant.street, tenant.street2, locality].filter(Boolean)
    if (!parts.length) return { value: '', source: `Profil — ${tenantLabel(tenant, tenantIndex)}` }
    if (tenant.country) parts.push(tenant.country)
    return { value: parts.join(', '), source: `Profil — ${tenantLabel(tenant, tenantIndex)}` }
  }

  const value = (tenant[key as keyof TenantProfile] as string | undefined) ?? ''
  return { value, source: `Profil — ${tenantLabel(tenant, tenantIndex)}` }
}

export function formatForField(
  key: CanonicalKey,
  value: string,
  options: string[],
  type: string,
  placeholder: string,
  dateFormat: 'fr' | 'iso',
): string {
  if (!value) return ''

  if (options.length) {
    const match = matchOption(value, options)
    if (match) return match
  }

  if (key === 'birthDate' || key === 'jobStartDate' || key === 'housingSince') {
    return formatDate(value, type, placeholder, dateFormat)
  }

  if (key === 'desiredMoveDate') {
    return formatAvailability(value, options, type, placeholder, dateFormat)
  }

  if (
    key === 'netMonthlyIncome' ||
    key === 'grossMonthlyIncome' ||
    key === 'annualIncome' ||
    key === 'otherIncome' ||
    key === 'currentRent'
  ) {
    return formatAmount(value, placeholder)
  }

  if (key === 'civility') {
    return formatCivility(value, options)
  }

  return value
}

function matchOption(value: string, options: string[]): string | null {
  const n = normalizeLoose(value)
  for (const option of options) {
    if (normalizeLoose(option) === n) return option
  }
  for (const option of options) {
    if (normalizeLoose(option).includes(n) || n.includes(normalizeLoose(option))) return option
  }
  const aliases: Record<string, string[]> = {
    m: ['m', 'm.', 'mr', 'monsieur', 'male', 'homme'],
    mme: ['mme', 'mrs', 'madame', 'ms', 'femme'],
    cdi: ['cdi', 'permanent', 'indefinite'],
    cdd: ['cdd', 'fixed term', 'contract'],
    locataire: ['locataire', 'tenant', 'renter'],
    proprietaire: ['proprietaire', 'owner'],
    immediatement: ['immediat', 'immediatement', 'asap', 'now', 'tout de suite', 'des que possible', 'immediate'],
  }
  for (const option of options) {
    const on = normalizeLoose(option)
    for (const group of Object.values(aliases)) {
      if (group.includes(n) && group.some((g) => on.includes(g))) return option
    }
  }
  return null
}

function formatAvailability(
  value: string,
  options: string[],
  type: string,
  placeholder: string,
  dateFormat: 'fr' | 'iso',
): string {
  const immediate = /immediat|tout de suite|asap|now|des que possible|dès que possible/i.test(value)
  if (type === 'date' || /^\d{4}-\d{2}-\d{2}$/.test(placeholder) || /jj\/mm|aaaa|yyyy/i.test(placeholder)) {
    return formatDate(new Date().toISOString().slice(0, 10), type, placeholder, dateFormat)
  }
  if (options.length) {
    const fromOptions =
      options.find((o) => /immediat|asap|now|tout de suite|des que possible|available/i.test(o)) ??
      matchOption(value, options)
    if (fromOptions) return fromOptions
  }
  return immediate || !value ? 'Immédiatement' : value
}

function formatDate(value: string, type: string, placeholder: string, dateFormat: 'fr' | 'iso'): string {
  const iso = toIsoDate(value)
  if (!iso) return value
  if (type === 'date' || dateFormat === 'iso') return iso
  if (/aaaa|yyyy|jj\/mm/i.test(placeholder) || dateFormat === 'fr') {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function toIsoDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const fr = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (fr) {
    const d = fr[1].padStart(2, '0')
    const m = fr[2].padStart(2, '0')
    return `${fr[3]}-${m}-${d}`
  }
  const t = Date.parse(value)
  if (!Number.isNaN(t)) {
    const dt = new Date(t)
    const m = String(dt.getMonth() + 1).padStart(2, '0')
    const d = String(dt.getDate()).padStart(2, '0')
    return `${dt.getFullYear()}-${m}-${d}`
  }
  return null
}

function formatAmount(value: string, placeholder: string): string {
  const num = value.replace(/[^\d,.-]/g, '').replace(',', '.')
  const n = Number.parseFloat(num)
  if (Number.isNaN(n)) return value
  if (/€|eur/i.test(placeholder)) return `${Math.round(n)}`
  return String(Math.round(n))
}

function formatCivility(value: string, options: string[]): string {
  if (options.length) return matchOption(value, options) ?? value
  return value
}

function normalizeLoose(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
