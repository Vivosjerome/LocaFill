import { useCallback, useEffect, useState } from 'react'
import { EMPTY_PROFILE, type AppProfile } from '@/types/profile'
import { loadProfile, saveProfile } from '@/lib/storage/db'

export function useProfile() {
  const [profile, setProfile] = useState<AppProfile>(EMPTY_PROFILE())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadProfile().then((data) => {
      if (!cancelled) {
        setProfile(data)
        setReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(async (next: AppProfile) => {
    setProfile(next)
    await saveProfile(next)
  }, [])

  return { profile, update, ready }
}
