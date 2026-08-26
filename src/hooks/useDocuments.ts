import { useCallback, useEffect, useState } from 'react'
import type { StoredDocument } from '@/types/document'
import { addDocument, deleteDocument, listDocuments } from '@/lib/storage/db'

export function useDocuments() {
  const [documents, setDocuments] = useState<StoredDocument[]>([])
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const rows = await listDocuments()
    setDocuments(rows)
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const add = useCallback(
    async (doc: StoredDocument) => {
      await addDocument(doc)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      await deleteDocument(id)
      await refresh()
    },
    [refresh],
  )

  return { documents, add, remove, refresh, ready }
}
