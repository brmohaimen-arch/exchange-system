'use client'

import { useEffect, useRef, useState, Dispatch, SetStateAction } from 'react'

/**
 * Like useState, but the value survives navigating away and back within the
 * same browser tab/session (e.g. an employee filling in a buy-currency form,
 * checking something on the customers page, then coming back). Uses
 * sessionStorage rather than localStorage so a draft never leaks into a
 * different employee's login on a shared terminal.
 */
export function usePersistedState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const storageKey = `draft:${key}`
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.sessionStorage.getItem(storageKey)
      return raw ? { ...(initial as object), ...JSON.parse(raw) } as T : initial
    } catch {
      return initial
    }
  })

  const isFirstRender = useRef(true)
  useEffect(() => {
    // Skip the very first run so re-mounting a component doesn't immediately
    // clobber a value it just read out of storage with its own initial state.
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // sessionStorage unavailable (private mode, quota) — the form still
      // works for this session, it just won't survive navigating away.
    }
  }, [storageKey, state])

  return [state, setState]
}

/** Clears a persisted draft — call after a successful submit so a stale draft
 * doesn't reappear next time the form is opened. */
export function clearPersistedState(key: string) {
  try {
    window.sessionStorage.removeItem(`draft:${key}`)
  } catch {
    // ignore
  }
}
