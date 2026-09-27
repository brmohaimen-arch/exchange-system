'use client'

import { useEffect } from 'react'
import { useBranding } from '@/lib/branding'

/** Root layout's <title> is static (Next.js metadata is compiled, not
 * runtime), so a renamed office wouldn't show in the browser tab without
 * this — a tiny client-side effect that overwrites it once branding loads. */
export function BrandTitleSync() {
  const { name, loading } = useBranding()
  useEffect(() => {
    if (!loading) document.title = `${name} | لوحة التحكم`
  }, [name, loading])
  return null
}
