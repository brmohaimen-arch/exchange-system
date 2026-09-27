'use client'

import { useEffect, useState } from 'react'
import { API_BASE } from './api-client'

export interface Branding {
  name: string
  phone: string
  logoUrl: string
  loading: boolean
}

const DEFAULT_NAME = 'شركة واكب'
let cache: { name: string; phone: string; logoVersion: string } | null = null
const listeners = new Set<(v: typeof cache) => void>()

async function fetchBranding() {
  try {
    const res = await fetch(`${API_BASE}/branding`)
    const body = await res.json()
    if (body?.success && body.data) {
      cache = { name: body.data.name || DEFAULT_NAME, phone: body.data.phone || '', logoVersion: String(body.data.logoVersion || '0') }
      listeners.forEach((l) => l(cache))
    }
  } catch {
    // Public/pre-login pages must never break because branding failed to load — fall back silently.
  }
}

/** Site name + logo, shared by the sidebar, login page, landing page, and the
 * browser tab title. Fetched once (module-level cache) and pushed to every
 * mounted consumer — a logo/name change in Settings shows up everywhere on
 * next page load without each component re-fetching separately. */
export function useBranding(): Branding {
  const [state, setState] = useState(cache)

  useEffect(() => {
    listeners.add(setState)
    if (!cache) fetchBranding()
    return () => { listeners.delete(setState) }
  }, [])

  const version = state?.logoVersion ?? '0'
  return {
    name: state?.name || DEFAULT_NAME,
    phone: state?.phone || '',
    logoUrl: `${API_BASE}/branding/logo?v=${version}`,
    loading: !state,
  }
}

/** Call after uploading/removing a logo or renaming the office in Settings so
 * every open tab picks up the change immediately instead of waiting for a reload. */
export function refreshBranding() {
  fetchBranding()
}
