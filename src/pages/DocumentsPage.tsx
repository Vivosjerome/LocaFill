import { useRef, useState } from 'react'
import { FilePlus2, FileText, Trash2 } from 'lucide-react'
import { useDocuments } from '@/hooks/useDocuments'
import { useProfile } from '@/hooks/useProfile'
import { classifyDocument, extractFromOcr, ocrBlob } from '@/lib/ocr'
import { assembleToPdf } from '@/lib/pdf/assemble'
import { renderPdfPages } from '@/lib/forms/parsePdf'
import type { DocumentKind, StoredDocument } from '@/types/document'
import type { TenantProfile } from '@/types/profile'

const KIND_LABEL: Record<DocumentKind, string> = {
  id_card: 'Pièce d’identité',
  passport: 'Passeport',
  driver_license: 'Permis',
  payslip: 'Bulletin de paie',
  tax_notice: 'Avis d’impôt',
  employment_contract: 'Contrat de travail',
  proof_of_address: 'Justificatif de domicile',
  bank_statement: 'Relevé bancaire',
  rib: 'RIB',
  tax_return: 'Déclaration fiscale',
  other: 'Autre',
}

export function DocumentsPage() {
  const { documents, add, remove, ready } = useDocuments()
  const { profile, update } = useProfile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function ingest(files: FileList | File[]) {
    for (const file of [...files]) {
      setStatus(`Import de ${file.name}…`)
      let ocrText = ''
      try {
        if (file.type.startsWith('image/')) {
          ocrText = await ocrBlob(file, (s, p) => setStatus(`OCR ${file.name} — ${s} ${Math.round(p * 100)}%`))
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          const pages = await renderPdfPages(await file.arrayBuffer(), 3)
          const chunks: string[] = []
          for (const page of pages) {
            chunks.push(await ocrBlob(page, (s, p) => setStatus(`OCR PDF — ${s} ${Math.round(p * 100)}%`)))
          }
          ocrText = chunks.join('\n')
        }
      } catch {
        ocrText = ''
      }
      const { kind, confidence } = classifyDocument(ocrText || file.name, file.name)
      const extracted = extractFromOcr(kind, ocrText)
      const doc: StoredDocument = {
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind,
        kindConfidence: confidence,
        createdAt: new Date().toISOString(),
        ocrText,
        extracted,
        blob: file,
      }
      await add(doc)
    }
    setStatus('Documents enregistrés localement')
    window.setTimeout(() => setStatus(''), 1800)
  }

  async function assembleSelected() {
    const files = documents.filter((d) => selected.has(d.id)).map((d) => d.blob)
    if (!files.length) return
    setStatus('Assemblage PDF…')
    const pdf = await assembleToPdf(files)
    const assembled: StoredDocument = {
      id: crypto.randomUUID(),
      name: `dossier-${new Date().toISOString().slice(0, 10)}.pdf`,
      mimeType: 'application/pdf',
      size: pdf.size,
      kind: 'other',
      kindConfidence: 1,
      createdAt: new Date().toISOString(),
      ocrText: '',
      extracted: [],
      blob: pdf,
    }
    await add(assembled)
    downloadBlob(pdf, assembled.name)
    setStatus('PDF assemblé')
  }

  async function applyExtracted(doc: StoredDocument) {
    const tenant = profile.tenants[0]
    if (!tenant) return
    const patch: Partial<TenantProfile> = {}
    for (const field of doc.extracted) {
      if (field.key === 'fullName') {
        const parts = field.value.trim().split(/\s+/)
        if (parts.length >= 2) {
          if (!tenant.firstName) patch.firstName = parts[0]
          if (!tenant.lastName) patch.lastName = parts.slice(1).join(' ')
        }
        continue
      }
      if (field.key in tenant && field.value) {
        const current = tenant[field.key as keyof TenantProfile]
        if (!current) {
          ;(patch as Record<string, string>)[field.key] = field.value
        }
      }
    }
    await update({
      ...profile,
      tenants: profile.tenants.map((t, i) => (i === 0 ? { ...t, ...patch } : t)),
    })
    setStatus('Valeurs copiées dans le profil (champs encore vides)')
  }

  return (
    <>
      <div className="page-head">
        <h1>Documents</h1>
        <p className="lede">
          Importez scans, photos ou PDF. LocaFill tente d’identifier le type (CNI, paie, impôt…) et d’en extraire des
          valeurs, sans quitter l’appareil.
        </p>
      </div>

      <div
        className="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files)
        }}
      >
        <FilePlus2 />
        <strong>Déposer un fichier ou parcourir</strong>
        <p className="muted">PDF, JPEG, PNG, WebP — OCR français / anglais</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple
        accept="application/pdf,image/*"
        onChange={(e) => e.target.files && void ingest(e.target.files)}
      />

      {status && <p className="muted" style={{ marginTop: 12 }}>{status}</p>}

      <div className="row" style={{ margin: '16px 0' }}>
        <button type="button" className="btn btn-soft" disabled={!selected.size} onClick={() => void assembleSelected()}>
          Assembler en PDF
        </button>
      </div>

      {!ready && <p className="muted">Chargement…</p>}
      {ready && !documents.length && (
        <div className="empty">Aucun document pour l’instant. Ajoutez une pièce d’identité ou une fiche de paie.</div>
      )}

      <div className="stack">
        {documents.map((doc) => (
          <article key={doc.id} className="card doc-card">
            <div className="doc-thumb">
              <FileText size={22} />
            </div>
            <div>
              <strong>{doc.name}</strong>
              <p className="muted">
                {KIND_LABEL[doc.kind]} · {Math.round(doc.kindConfidence * 100)}% · {formatSize(doc.size)}
              </p>
              {doc.extracted.slice(0, 3).map((f) => (
                <p key={f.key} className="muted">
                  {f.label} : {f.value}
                </p>
              ))}
            </div>
            <div className="stack">
              <label className="muted">
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(doc.id)
                    else next.delete(doc.id)
                    setSelected(next)
                  }}
                />{' '}
                PDF
              </label>
              <button type="button" className="btn btn-ghost" onClick={() => downloadBlob(doc.blob, doc.name)}>
                Télécharger
              </button>
              {doc.extracted.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => void applyExtracted(doc)}>
                  Vers le profil
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => void remove(doc.id)} aria-label="Supprimer">
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
