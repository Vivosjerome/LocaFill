import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, HelpCircle, X } from 'lucide-react'
import { latestSession, loadSession, saveSession } from '@/lib/storage/db'
import { disableSubmit, fillDocument } from '@/lib/forms/fill'
import { isDocumentChecklist, isNoisePdfLabel, isSectionHeading } from '@/lib/forms/pdfLabels'
import { renderPdfPages } from '@/lib/forms/parsePdf'
import { fillPdfForm } from '@/lib/pdf/fillPdf'
import { CANONICAL_META, type CanonicalKey } from '@/lib/semantic/canonical'
import type { AnalysisSession, ConfidenceLevel, FieldMapping } from '@/types/form'

const CONF_LABEL: Record<ConfidenceLevel, string> = {
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Faible',
  none: 'Aucune',
}

type FillMark = 'ok' | 'unsure' | 'empty'

function fillMark(mapping: FieldMapping): FillMark {
  const value = (mapping.overrideValue ?? mapping.displayValue ?? '').trim()
  if (mapping.skipped || !value) return 'empty'
  if (mapping.overrideValue?.trim() || mapping.confidence === 'high') return 'ok'
  return 'unsure'
}

export function PreviewPage() {
  const [params] = useSearchParams()
  const [session, setSession] = useState<AnalysisSession | null>(null)
  const [message, setMessage] = useState('')
  const [filled, setFilled] = useState(false)
  const [filters, setFilters] = useState<Set<FillMark>>(() => new Set(['ok', 'unsure', 'empty']))
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const [pdfBusy, setPdfBusy] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pageUrls = useRef<string[]>([])

  useEffect(() => {
    const id = params.get('id')
    void (id ? loadSession(id) : latestSession()).then((s) => setSession(s ?? null))
  }, [params])

  const mappings = session?.mappings ?? []
  const fieldById = useMemo(
    () => new Map((session?.fields ?? []).map((f) => [f.id, f])),
    [session],
  )

  const reviewable = mappings.filter((mapping) => {
    const field = fieldById.get(mapping.fieldId)
    if (!field) return false
    if (isNoisePdfLabel(field.label) || isSectionHeading(field.label) || isDocumentChecklist(field.label)) return false
    if (/personne absente du profil/i.test(mapping.rationale)) return false
    if ((field.type === 'checkbox' || field.type === 'radio') && mapping.skipped && !mapping.displayValue) {
      return false
    }
    return Boolean(field.label)
  })

  const stats = useMemo(() => {
    const marks = reviewable.map(fillMark)
    return {
      ok: marks.filter((m) => m === 'ok').length,
      unsure: marks.filter((m) => m === 'unsure').length,
      empty: marks.filter((m) => m === 'empty').length,
    }
  }, [reviewable])

  const visible = reviewable.filter((mapping) => filters.has(fillMark(mapping)))

  function toggleFilter(kind: FillMark) {
    setFilters((prev) => {
      if (prev.size === 3) return new Set([kind])
      const next = new Set(prev)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next.size === 0 ? new Set<FillMark>(['ok', 'unsure', 'empty']) : next
    })
  }

  useEffect(() => {
    if (!session?.originalPdf) {
      setPdfPages([])
      return
    }
    let cancelled = false
    setPdfBusy(true)
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const blob = await fillPdfForm(session.originalPdf!, session.fields, session.mappings)
          const pages = await renderPdfPages(await blob.arrayBuffer(), 12)
          if (cancelled) return
          pageUrls.current.forEach((u) => URL.revokeObjectURL(u))
          const urls = pages.map((p) => URL.createObjectURL(p))
          pageUrls.current = urls
          setPdfPages(urls)
        } catch {
          if (!cancelled) setPdfPages([])
        } finally {
          if (!cancelled) setPdfBusy(false)
        }
      })()
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [session])

  useEffect(() => {
    return () => pageUrls.current.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  function patchMapping(fieldId: string, patch: Partial<FieldMapping>) {
    if (!session) return
    const next: AnalysisSession = {
      ...session,
      mappings: session.mappings.map((m) => (m.fieldId === fieldId ? { ...m, ...patch } : m)),
    }
    setSession(next)
    void saveSession(next)
  }

  async function fillForm() {
    if (!session) return
    if (session.originalPdf) {
      try {
        const blob = await fillPdfForm(session.originalPdf, session.fields, session.mappings)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = session.fileName?.replace(/\.pdf$/i, '-rempli.pdf') || 'dossier-rempli.pdf'
        a.click()
        URL.revokeObjectURL(url)
        setFilled(true)
        setMessage('PDF rempli téléchargé. Rien n’a été envoyé.')
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Impossible de remplir le PDF')
      }
      return
    }
    const doc = iframeRef.current?.contentDocument
    if (!doc || !session.originalHtml) {
      setMessage('Remplissage possible uniquement pour un formulaire HTML prévisualisé.')
      return
    }
    disableSubmit(doc)
    const result = fillDocument(doc, session.fields, session.mappings)
    setFilled(true)
    setMessage(`${result.filled} champ(s) remplis · ${result.skipped} ignorés · ${result.missing} introuvables. Le formulaire n’a pas été envoyé.`)
  }

  if (!session) {
    return (
      <div className="empty">
        Aucune analyse en attente. <Link to="/analyzer">Importer un formulaire</Link>
      </div>
    )
  }

  return (
    <>
      <div className="page-head">
        <h1>Prévisualisation</h1>
        <p className="lede">
          Cliquez sur une pastille pour n’afficher que ces champs. Recliquez pour tout réafficher, ou ajoutez-en une
          autre.
        </p>
        <div className="fill-legend" role="group" aria-label="Filtrer les champs">
          <button
            type="button"
            className={`fill-stat ${filters.has('ok') ? 'active' : ''}`}
            aria-pressed={filters.has('ok')}
            onClick={() => toggleFilter('ok')}
          >
            <Mark kind="ok" /> {stats.ok} validé{stats.ok > 1 ? 's' : ''}
          </button>
          <button
            type="button"
            className={`fill-stat ${filters.has('unsure') ? 'active' : ''}`}
            aria-pressed={filters.has('unsure')}
            onClick={() => toggleFilter('unsure')}
          >
            <Mark kind="unsure" /> {stats.unsure} à vérifier
          </button>
          <button
            type="button"
            className={`fill-stat ${filters.has('empty') ? 'active' : ''}`}
            aria-pressed={filters.has('empty')}
            onClick={() => toggleFilter('empty')}
          >
            <Mark kind="empty" /> {stats.empty} non rempli{stats.empty > 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {session.originalPdf && (
        <div className="card pdf-preview">
          <h2 className="section-title">Dossier rempli</h2>
          {pdfBusy && pdfPages.length === 0 && <p className="muted">Génération de l’aperçu…</p>}
          {!pdfBusy && pdfPages.length === 0 && (
            <p className="muted">Aperçu indisponible. Vous pouvez quand même télécharger le PDF.</p>
          )}
          <div className="pdf-pages">
            {pdfPages.map((src, i) => (
              <figure key={src}>
                <img src={src} alt={`Page ${i + 1} du dossier rempli`} />
                <figcaption>Page {i + 1}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {session.originalHtml && !session.originalPdf && (
        <div className="iframe-wrap" style={{ marginBottom: 18 }}>
          <iframe
            ref={iframeRef}
            title="Aperçu du formulaire"
            srcDoc={session.originalHtml}
            sandbox="allow-same-origin allow-forms"
            onLoad={() => {
              const doc = iframeRef.current?.contentDocument
              if (!doc || !session) return
              disableSubmit(doc)
              fillDocument(doc, session.fields, session.mappings)
            }}
          />
        </div>
      )}

      <div className="card">
        {visible.length === 0 && (
          <p className="muted">
            Aucun champ dans ce filtre. Cliquez sur une autre pastille, ou recliquez pour tout afficher.
          </p>
        )}
        {visible.map((mapping) => {
          const field = fieldById.get(mapping.fieldId)
          if (!field) return null
          const mark = fillMark(mapping)
          return (
            <div className={`mapping mapping-${mark}`} key={mapping.fieldId}>
              <header>
                <div className="mapping-title">
                  <Mark kind={mark} />
                  <div>
                    <div className="label">{field.label || field.name || field.placeholder || 'Champ sans libellé'}</div>
                    <div className="meta">
                      {mapping.canonicalKey
                        ? CANONICAL_META[mapping.canonicalKey as CanonicalKey]?.labelFr
                        : 'Non mappé'}{' '}
                      · {mapping.source}
                      {mapping.rationale ? ` · ${mapping.rationale}` : ''}
                    </div>
                  </div>
                </div>
                <span className={`badge badge-${mapping.confidence}`}>{CONF_LABEL[mapping.confidence]}</span>
              </header>
              <label className="field">
                Valeur qui sera utilisée
                <input
                  value={mapping.overrideValue ?? mapping.displayValue}
                  onChange={(e) =>
                    patchMapping(mapping.fieldId, {
                      overrideValue: e.target.value,
                      displayValue: e.target.value,
                      value: e.target.value,
                      skipped: false,
                      confidence: e.target.value.trim() ? 'high' : 'none',
                    })
                  }
                />
              </label>
              <label className="muted">
                <input
                  type="checkbox"
                  checked={mapping.skipped}
                  onChange={(e) => patchMapping(mapping.fieldId, { skipped: e.target.checked })}
                />{' '}
                Ne pas remplir ce champ
              </label>
            </div>
          )
        })}
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-accent" onClick={() => void fillForm()}>
          {session.originalPdf ? 'Télécharger le PDF rempli' : 'Remplir le formulaire'}
        </button>
        <Link to="/analyzer" className="btn btn-ghost">
          Nouvelle analyse
        </Link>
      </div>
      {filled && (
        <p className="ok" style={{ marginTop: 12 }}>
          {session.originalPdf ? 'PDF généré localement — non envoyé.' : 'Formulaire rempli dans l’aperçu — non envoyé.'}
        </p>
      )}
      {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
    </>
  )
}

function Mark({ kind }: { kind: FillMark }) {
  if (kind === 'ok') {
    return (
      <span className="fill-mark fill-ok" title="Bien rempli">
        <Check size={16} strokeWidth={3} aria-hidden />
        <span className="sr-only">Validé</span>
      </span>
    )
  }
  if (kind === 'unsure') {
    return (
      <span className="fill-mark fill-unsure" title="À vérifier">
        <HelpCircle size={16} strokeWidth={2.4} aria-hidden />
        <span className="sr-only">À vérifier</span>
      </span>
    )
  }
  return (
    <span className="fill-mark fill-empty" title="Non rempli">
      <X size={16} strokeWidth={3} aria-hidden />
      <span className="sr-only">Non rempli</span>
    </span>
  )
}
