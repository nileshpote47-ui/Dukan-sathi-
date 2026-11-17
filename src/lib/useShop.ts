import { useCallback, useEffect, useState } from 'react'
import { ShopError, parseBackup } from './shop'
import { emptyShopData, type ShopData } from './types'

const STORAGE_KEY = 'dukan-sathi:data'

const load = (): ShopData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? parseBackup(raw) : emptyShopData()
  } catch {
    return emptyShopData()
  }
}

const save = (data: ShopData): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

/**
 * App-wide shop state, persisted to localStorage.
 * `run` applies a pure update; a ShopError becomes a message for the UI instead of a crash.
 */
export const useShop = () => {
  const [data, setData] = useState<ShopData>(load)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Keep other open tabs in step, so one tab never overwrites the other's changes with stale data.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setData(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const run = useCallback(
    (update: (d: ShopData) => ShopData): string | null => {
      let next: ShopData
      try {
        next = update(data)
      } catch (e) {
        if (e instanceof ShopError) return e.message
        throw e
      }
      setData(next)
      setSaveError(
        save(next) ? null : 'Could not save on this device. Storage may be full or blocked — export a backup.',
      )
      return null
    },
    [data],
  )

  return { data, run, saveError }
}

export type ShopRun = ReturnType<typeof useShop>['run']
