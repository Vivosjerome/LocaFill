import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeSource } from '@/lib/analyze'
import { SAMPLE_FORM_HTML } from '@/lib/forms/sampleForm'

type Tab = 'paste' | 'file' | 'sample'

export function AnalyzerPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('paste')
  const [paste, setPaste] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run(
    kind: 'html' | 'pdf' | 'image' | 'text',
    payload: { html?: string; text?: string; file?: File; title?: string },
  ) {
    setBusy(true)
    setError('')
    try {
      const session = await analyzeSource({
        kind,
        ...payload,
        onProgress: setProgress,
      })
      navigate(`/preview?id=${session.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analyse impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Analyse</h1>
        <p className="lede">
          Collez le formulaire tel que vous le voyez, ou son HTML. LocaFill détecte tout seul s’il s’agit de texte, de
          HTML ou d’une URL.
        </p>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ['paste', 'Coller'],
            ['file', 'Fichier'],
            ['sample', 'Exemple'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        {tab === 'paste' && (
          <div className="stack">
            <p className="muted">
              Fonctionne avec : les libellés copiés (Nom, Prénom, salaire…), le code HTML, ou une URL (souvent bloquée
              par CORS — dans ce cas utilisez le bookmarklet dans Réglages).
            </p>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={'Nom / Family name\nPrénom\nE-mail\nTéléphone\nRessources mensuelles\nEmployeur'}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || paste.trim().length < 3}
              onClick={() => void run('html', { html: paste, title: 'Formulaire collé' })}
            >
              Analyser
            </button>
          </div>
        )}

        {tab === 'file' && (
          <div className="stack">
            <p className="muted">HTML, PDF ou photo/scan du formulaire.</p>
            <input
              type="file"
              accept=".html,.htm,application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !file}
              onClick={() => {
                if (!file) return
                const kind =
                  file.type.includes('pdf') || file.name.endsWith('.pdf')
                    ? 'pdf'
                    : file.type.includes('html') || /\.html?$/i.test(file.name)
                      ? 'html'
                      : 'image'
                void run(kind, { file, title: file.name })
              }}
            >
              Analyser le fichier
            </button>
          </div>
        )}

        {tab === 'sample' && (
          <div className="stack">
            <p className="muted">Formulaire mixte FR/EN, volontairement irrégulier.</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void run('html', { html: SAMPLE_FORM_HTML, title: 'Exemple location' })}
            >
              Analyser l’exemple
            </button>
          </div>
        )}

        {busy && <p className="muted">{progress || 'Analyse en cours…'}</p>}
        {error && <p className="warn">{error}</p>}
      </div>
    </>
  )
}
