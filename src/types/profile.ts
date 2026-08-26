export type TenantRole = 'primary' | 'cotenant' | 'guarantor'

export interface TenantProfile {
  id: string
  role: TenantRole
  label: string
  civility: string
  firstName: string
  lastName: string
  birthName: string
  birthDate: string
  birthPlace: string
  nationality: string
  email: string
  phone: string
  phoneSecondary: string
  street: string
  street2: string
  postalCode: string
  city: string
  country: string
  housingStatus: string
  housingSince: string
  professionalStatus: string
  occupation: string
  contractType: string
  jobStartDate: string
  employerName: string
  employerAddress: string
  employerPhone: string
  employerEmail: string
  netMonthlyIncome: string
  grossMonthlyIncome: string
  annualIncome: string
  otherIncome: string
  otherIncomeDescription: string
  peopleCount: string
  childrenCount: string
  maritalStatus: string
  iban: string
  bic: string
  bankName: string
  notes: string
}

export interface Household {
  peopleCount: string
  childrenCount: string
  currentRent: string
  desiredMoveDate: string
  desiredCity: string
}

export interface AppProfile {
  household: Household
  tenants: TenantProfile[]
  updatedAt: string
}

export const EMPTY_TENANT = (role: TenantRole = 'primary'): TenantProfile => ({
  id: crypto.randomUUID(),
  role,
  label:
    role === 'primary'
      ? 'Locataire principal'
      : role === 'cotenant'
        ? 'Co-locataire'
        : 'Garant',
  civility: '',
  firstName: '',
  lastName: '',
  birthName: '',
  birthPlace: '',
  birthDate: '',
  nationality: 'Française',
  email: '',
  phone: '',
  phoneSecondary: '',
  street: '',
  street2: '',
  postalCode: '',
  city: '',
  country: 'France',
  housingStatus: '',
  housingSince: '',
  professionalStatus: '',
  occupation: '',
  contractType: '',
  jobStartDate: '',
  employerName: '',
  employerAddress: '',
  employerPhone: '',
  employerEmail: '',
  netMonthlyIncome: '',
  grossMonthlyIncome: '',
  annualIncome: '',
  otherIncome: '',
  otherIncomeDescription: '',
  peopleCount: '',
  childrenCount: '',
  maritalStatus: '',
  iban: '',
  bic: '',
  bankName: '',
  notes: '',
})

export const EMPTY_HOUSEHOLD = (): Household => ({
  peopleCount: '1',
  childrenCount: '0',
  currentRent: '',
  desiredMoveDate: 'Immédiatement',
  desiredCity: '',
})

export const EMPTY_PROFILE = (): AppProfile => ({
  household: EMPTY_HOUSEHOLD(),
  tenants: [EMPTY_TENANT('primary')],
  updatedAt: new Date().toISOString(),
})
