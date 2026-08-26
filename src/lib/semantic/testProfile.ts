import { EMPTY_PROFILE, EMPTY_TENANT } from '@/types/profile'

export const TEST_EMAIL_PRIMARY = 'vivosjerome64@gmail.com'
export const TEST_EMAIL_COTENANT = 'laurine.martin@example.com'
export const TEST_EMAIL_GUARANTOR = 'paul.lys@example.com'

export function testProfile() {
  const profile = EMPTY_PROFILE()
  profile.tenants[0] = {
    ...EMPTY_TENANT('primary'),
    id: profile.tenants[0].id,
    label: 'Jérôme',
    firstName: 'Jerome',
    lastName: 'VIVOS',
    birthName: 'VIVOS',
    birthDate: '1995-10-12',
    birthPlace: 'Bayonne',
    email: TEST_EMAIL_PRIMARY,
    phone: '0627296788',
    street: '25 rue du moulin de sault',
    postalCode: '64600',
    city: 'ANGLET',
    country: 'France',
    maritalStatus: 'Célibataire',
    professionalStatus: 'Salarié',
    occupation: 'Chauffeur Livreur',
    contractType: 'CDI',
    employerName: 'LivronsChezVous',
    employerAddress: "1 rue d'etxezahar 64990 Mouguerre",
    employerEmail: 'rh@livronschezvous.fr',
    netMonthlyIncome: '1750',
    otherIncome: '350',
    housingSince: '2025-11-02',
  }
  profile.tenants.push({
    ...EMPTY_TENANT('cotenant'),
    label: 'Laurine',
    firstName: 'Laurine',
    lastName: 'MARTIN',
    birthDate: '1996-04-03',
    birthPlace: 'Biarritz',
    email: TEST_EMAIL_COTENANT,
    phone: '0611223344',
    maritalStatus: 'Célibataire',
    professionalStatus: 'Salarié',
    occupation: 'Comptable',
    contractType: 'CDI',
    netMonthlyIncome: '2100',
  })
  profile.tenants.push({
    ...EMPTY_TENANT('guarantor'),
    label: 'Garant',
    firstName: 'Paul',
    lastName: 'LYS',
    email: TEST_EMAIL_GUARANTOR,
    occupation: 'Banquier',
    netMonthlyIncome: '1900',
    phone: '0600000000',
  })
  profile.household.peopleCount = '2'
  profile.household.childrenCount = '0'
  return profile
}
