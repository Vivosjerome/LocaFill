import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/lib/storage/db'
import type { AppSettings } from '@/types/form'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadSettings().then((data) => {
      if (!cancelled) {
        setSettings(data)
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(async (next: AppSettings) => {
    setSettings(next)
    await saveSettings(next)
  }, [])

  return { settings, update, ready }
}
