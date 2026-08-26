import { useRef, useState } from 'react'
import { useSettings } from '@/hooks/useSettings'
import { useProfile } from '@/hooks/useProfile'
import { PROVIDERS } from '@/lib/semantic/providers'
import { runSemanticSmoke } from '@/lib/semantic/smoke'
import { clearAllData } from '@/lib/storage/db'
import { makeProfileBackup, parseProfileBackup } from '@/lib/storage/backup'

const BOOKMARKLET = `javascript:(function(){navigator.clipboard.writeText(document.documentElement.outerHTML).then(function(){alert('HTML copié. Collez-le dans LocaFill > Analyser.')}).catch(function(){prompt('Copiez le HTML :', document.documentElement.outerHTML)})})();`

export function SettingsPage() {
  const { settings, update: updateSettings, ready } = useSettings()
  const { profile, update: updateProfile, ready: profileReady } = useProfile()
  const [cleared, setCleared] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [smoke, setSmoke] = useState<ReturnType<typeof runSemanticSmoke> | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  if (!ready) return <p className="muted">Chargement…</p>

  return (
    <>
      <div className="page-head">
        <h1>Réglages</h1>
        <p className="lede">Préférences locales uniquement. Rien n’est synchronisé.</p>
      </div>

      <div className="card stack">
        <h2 className="section-title">Compréhension sémantique</h2>
        <label className="field">
          Moteur
          <select
            value={settings.semanticProvider}
            onChange={(e) =>
              void updateSettings({ ...settings, semanticProvider: e.target.value as typeof settings.semanticProvider })
            }
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={p.id === 'llm'}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          Le moteur heuristique suffit pour des formulaires inconnus. L’option IA/LLM est un point d’extension : aucun
          appel réseau n’est fait tant qu’un endpoint n’est pas branché dans le code.
        </p>
        <label className="field">
          Endpoint LLM (futur)
          <input
            type="url"
            placeholder="https://…"
            value={settings.llmEndpoint}
            onChange={(e) => void updateSettings({ ...settings, llmEndpoint: e.target.value })}
          />
        </label>
        <label className="field">
          Modèle
          <input
            value={settings.llmModel}
            placeholder="ex. gpt-4.1-mini"
            onChange={(e) => void updateSettings({ ...settings, llmModel: e.target.value })}
          />
        </label>
        <button
          type="button"
          className="btn btn-soft"
          disabled={!profileReady}
          onClick={() => setSmoke(runSemanticSmoke(profile, settings))}
        >
          Tester le mapping sémantique
        </button>
        {smoke && (
          <ul className="muted">
            {smoke.map((row) => (
              <li key={row.label}>
                {row.ok ? '✓' : '✗'} {row.label} → {row.got}
                {!row.ok ? ` (attendu ${row.expected})` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card stack">
        <h2 className="section-title">Format</h2>
        <label className="field">
          Dates
          <select
            value={settings.dateFormat}
            onChange={(e) => void updateSettings({ ...settings, dateFormat: e.target.value as 'fr' | 'iso' })}
          >
            <option value="fr">JJ/MM/AAAA</option>
            <option value="iso">AAAA-MM-JJ</option>
          </select>
        </label>
        <label className="field">
          Langue d’analyse
          <select
            value={settings.defaultLanguage}
            onChange={(e) =>
              void updateSettings({ ...settings, defaultLanguage: e.target.value as typeof settings.defaultLanguage })
            }
          >
            <option value="auto">Auto</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>

      <div className="card stack">
        <h2 className="section-title">Capturer une page web</h2>
        <p className="muted">
          Glissez ce lien dans vos favoris, ouvrez le formulaire de location, cliquez le favori, puis collez le HTML dans
          Analyser.
        </p>
        <a className="btn btn-soft" href={BOOKMARKLET}>
          Copier le HTML de la page
        </a>
      </div>

      <div className="card stack">
        <h2 className="section-title">Partager le foyer</h2>
        <p className="muted">
          GitHub Pages n’envoie rien vers un serveur : le profil reste dans le navigateur de chaque téléphone. Pour que
          ta copine n’ait pas tout à retaper, exporte le foyer et envoie-lui le fichier (WhatsApp, mail…). Elle l’importe
          ici, sur son appareil.
        </p>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!profileReady}
            onClick={() => {
              const blob = new Blob([JSON.stringify(makeProfileBackup(profile), null, 2)], {
                type: 'application/json',
              })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `locafill-foyer-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
              setBackupMsg('Fichier téléchargé. Envoie-le à ta copine, puis elle l’importe ici.')
            }}
          >
            Exporter le foyer
          </button>
          <button type="button" className="btn btn-soft" onClick={() => importRef.current?.click()}>
            Importer un foyer
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            void file.text().then(async (text) => {
              try {
                await updateProfile(parseProfileBackup(text))
                setBackupMsg('Foyer importé. Ouvre Profil pour vérifier, puis analyse un dossier.')
              } catch (err) {
                setBackupMsg(err instanceof Error ? err.message : 'Import impossible')
              }
            })
          }}
        />
        {backupMsg && (
          <p className={/import impossible|n’est pas/i.test(backupMsg) ? 'warn' : 'ok'}>{backupMsg}</p>
        )}
      </div>

      <div className="card stack">
        <h2 className="section-title">Données</h2>
        <p className="muted">Supprime profil, documents et analyses de cet appareil.</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            if (!confirm('Tout effacer sur cet appareil ?')) return
            await clearAllData()
            setCleared(true)
          }}
        >
          Effacer toutes les données locales
        </button>
        {cleared && <p className="ok">Données effacées. Rechargez la page.</p>}
      </div>
    </>
  )
}
