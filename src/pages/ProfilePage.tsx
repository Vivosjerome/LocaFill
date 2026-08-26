import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useProfile } from '@/hooks/useProfile'
import { EMPTY_TENANT, type TenantProfile, type TenantRole } from '@/types/profile'

const CIVILITIES = ['', 'M.', 'Mme', 'Mx']
const HOUSING = ['', 'Locataire', 'Propriétaire', 'Hébergé', 'Autre']
const JOB_STATUS = ['', 'Salarié', 'Indépendant', 'Étudiant', 'Sans emploi', 'Retraité', 'Autre']
const CONTRACTS = ['', 'CDI', 'CDD', 'Intérim', 'Freelance', 'Alternance', 'Stage', 'Autre']
const MARITAL = ['', 'Célibataire', 'Concubin(e)', 'Marié(e)', 'Pacsé(e)', 'Divorcé(e)', 'Veuf(ve)']

export function ProfilePage() {
  const { profile, update, ready } = useProfile()
  const [saved, setSaved] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  if (!ready) return <p className="muted">Chargement du profil…</p>

  async function persist(next: typeof profile) {
    await update(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  function patchTenant(id: string, patch: Partial<TenantProfile>) {
    void persist({
      ...profile,
      tenants: profile.tenants.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
  }

  function addTenant(role: TenantRole) {
    const tenant = EMPTY_TENANT(role)
    void persist({ ...profile, tenants: [...profile.tenants, tenant] })
    setOpenId(tenant.id)
  }

  return (
    <>
      <div className="page-head">
        <h1>Profil</h1>
        <p className="lede">
          Ces informations servent de source unique pour tous les formulaires. Elles ne quittent pas cet appareil.
        </p>
      </div>

      <div className="card stack">
        <h2 className="section-title">Foyer</h2>
        <div className="grid-2">
          <label className="field">
            Personnes dans le logement
            <input
              type="number"
              value={profile.household.peopleCount}
              onChange={(e) =>
                void persist({ ...profile, household: { ...profile.household, peopleCount: e.target.value } })
              }
            />
          </label>
          <label className="field">
            Enfants à charge
            <input
              type="number"
              value={profile.household.childrenCount}
              onChange={(e) =>
                void persist({
                  ...profile,
                  household: { ...profile.household, childrenCount: e.target.value },
                })
              }
            />
          </label>
          <label className="field">
            Loyer actuel (€)
            <input
              type="text"
              inputMode="decimal"
              value={profile.household.currentRent}
              onChange={(e) =>
                void persist({ ...profile, household: { ...profile.household, currentRent: e.target.value } })
              }
            />
          </label>
          <label className="field">
            Disponibilité
            <select
              value={
                /^\d{4}-\d{2}-\d{2}$/.test(profile.household.desiredMoveDate)
                  ? 'Immédiatement'
                  : profile.household.desiredMoveDate || 'Immédiatement'
              }
              onChange={(e) =>
                void persist({
                  ...profile,
                  household: { ...profile.household, desiredMoveDate: e.target.value },
                })
              }
            >
              {['Immédiatement', 'Dès que possible', 'Flexible'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span>Pas une date : vous cherchez à emménager tout de suite.</span>
          </label>
          <label className="field">
            Ville / secteur recherché
            <input
              type="text"
              value={profile.household.desiredCity}
              onChange={(e) =>
                void persist({ ...profile, household: { ...profile.household, desiredCity: e.target.value } })
              }
            />
          </label>
        </div>
      </div>

      {profile.tenants.map((tenant, index) => (
        <article key={tenant.id} className="card">
          <header className="switch-row">
            <button type="button" className="btn btn-ghost" onClick={() => setOpenId(openId === tenant.id ? null : tenant.id)}>
              {tenant.label || `Personne ${index + 1}`}
            </button>
            {tenant.role !== 'primary' && (
              <button
                type="button"
                className="btn btn-ghost"
                aria-label="Supprimer"
                onClick={() =>
                  void persist({ ...profile, tenants: profile.tenants.filter((t) => t.id !== tenant.id) })
                }
              >
                <Trash2 size={16} />
              </button>
            )}
          </header>
          {(openId === tenant.id || profile.tenants.length === 1) && (
            <TenantFields tenant={tenant} onChange={(patch) => patchTenant(tenant.id, patch)} />
          )}
        </article>
      ))}

      <div className="row" style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-soft" onClick={() => addTenant('cotenant')}>
          <Plus size={16} /> Co-locataire
        </button>
        <button type="button" className="btn btn-soft" onClick={() => addTenant('guarantor')}>
          <Plus size={16} /> Garant
        </button>
      </div>
      {saved && <div className="toast">Profil enregistré localement</div>}
    </>
  )
}

function TenantFields({
  tenant,
  onChange,
}: {
  tenant: TenantProfile
  onChange: (patch: Partial<TenantProfile>) => void
}) {
  const set = (key: keyof TenantProfile) => (e: { target: { value: string } }) =>
    onChange({ [key]: e.target.value })

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <label className="field">
        Libellé
        <input value={tenant.label} onChange={set('label')} />
      </label>
      <h3 className="section-title">Identité</h3>
      <div className="grid-2">
        <label className="field">
          Civilité
          <select value={tenant.civility} onChange={set('civility')}>
            {CIVILITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Situation familiale
          <select value={tenant.maritalStatus} onChange={set('maritalStatus')}>
            {MARITAL.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Prénom
          <input value={tenant.firstName} onChange={set('firstName')} autoComplete="given-name" />
        </label>
        <label className="field">
          Nom
          <input value={tenant.lastName} onChange={set('lastName')} autoComplete="family-name" />
        </label>
        <label className="field">
          Nom de naissance
          <input value={tenant.birthName} onChange={set('birthName')} />
        </label>
        <label className="field">
          Date de naissance
          <input type="date" value={tenant.birthDate} onChange={set('birthDate')} />
        </label>
        <label className="field">
          Lieu de naissance
          <input value={tenant.birthPlace} onChange={set('birthPlace')} />
        </label>
        <label className="field">
          Nationalité
          <input value={tenant.nationality} onChange={set('nationality')} />
        </label>
      </div>

      <h3 className="section-title">Coordonnées</h3>
      <div className="grid-2">
        <label className="field">
          E-mail
          <input type="email" value={tenant.email} onChange={set('email')} />
        </label>
        <label className="field">
          Téléphone
          <input type="tel" value={tenant.phone} onChange={set('phone')} />
        </label>
        <label className="field">
          Téléphone secondaire
          <input type="tel" value={tenant.phoneSecondary} onChange={set('phoneSecondary')} />
        </label>
      </div>

      <h3 className="section-title">Adresse</h3>
      <div className="grid-2">
        <label className="field">
          Rue
          <input value={tenant.street} onChange={set('street')} />
        </label>
        <label className="field">
          Complément
          <input value={tenant.street2} onChange={set('street2')} />
        </label>
        <label className="field">
          Code postal
          <input value={tenant.postalCode} onChange={set('postalCode')} />
        </label>
        <label className="field">
          Ville
          <input value={tenant.city} onChange={set('city')} />
        </label>
        <label className="field">
          Pays
          <input value={tenant.country} onChange={set('country')} />
        </label>
        <label className="field">
          Situation de logement
          <select value={tenant.housingStatus} onChange={set('housingStatus')}>
            {HOUSING.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Dans ce logement depuis
          <input type="date" value={tenant.housingSince} onChange={set('housingSince')} />
        </label>
      </div>

      <h3 className="section-title">Situation professionnelle</h3>
      <div className="grid-2">
        <label className="field">
          Statut
          <select value={tenant.professionalStatus} onChange={set('professionalStatus')}>
            {JOB_STATUS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Profession
          <input value={tenant.occupation} onChange={set('occupation')} />
        </label>
        <label className="field">
          Type de contrat
          <select value={tenant.contractType} onChange={set('contractType')}>
            {CONTRACTS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Date d’embauche
          <input type="date" value={tenant.jobStartDate} onChange={set('jobStartDate')} />
        </label>
        <label className="field">
          Employeur
          <input value={tenant.employerName} onChange={set('employerName')} />
        </label>
        <label className="field">
          Adresse employeur
          <input value={tenant.employerAddress} onChange={set('employerAddress')} />
        </label>
        <label className="field">
          Tél. employeur
          <input type="tel" value={tenant.employerPhone} onChange={set('employerPhone')} />
        </label>
        <label className="field">
          E-mail employeur
          <input type="email" value={tenant.employerEmail} onChange={set('employerEmail')} />
        </label>
      </div>

      <h3 className="section-title">Revenus</h3>
      <div className="grid-2">
        <label className="field">
          Net mensuel (€)
          <input inputMode="decimal" value={tenant.netMonthlyIncome} onChange={set('netMonthlyIncome')} />
        </label>
        <label className="field">
          Brut mensuel (€)
          <input inputMode="decimal" value={tenant.grossMonthlyIncome} onChange={set('grossMonthlyIncome')} />
        </label>
        <label className="field">
          Annuel (€)
          <input inputMode="decimal" value={tenant.annualIncome} onChange={set('annualIncome')} />
        </label>
        <label className="field">
          Autres revenus (€)
          <span>Panier repas, tickets resto, primes…</span>
          <input
            inputMode="decimal"
            value={tenant.otherIncome}
            onChange={set('otherIncome')}
            placeholder="ex. 150"
          />
        </label>
        <label className="field">
          Précisez
          <span>Ce texte ira dans « Autres ressources » du dossier</span>
          <input
            value={tenant.otherIncomeDescription}
            onChange={set('otherIncomeDescription')}
            placeholder="ex. Panier repas"
          />
        </label>
      </div>

      <h3 className="section-title">Banque</h3>
      <div className="grid-2">
        <label className="field">
          IBAN
          <input value={tenant.iban} onChange={set('iban')} />
        </label>
        <label className="field">
          BIC
          <input value={tenant.bic} onChange={set('bic')} />
        </label>
        <label className="field">
          Banque
          <input value={tenant.bankName} onChange={set('bankName')} />
        </label>
      </div>
      <label className="field">
        Notes
        <textarea value={tenant.notes} onChange={set('notes')} />
      </label>
    </div>
  )
}
