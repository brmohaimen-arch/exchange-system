'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Merged into /currencies (tab=rates) as part of the "currencies and prices"
// sidebar section — this route only exists so any stale link/bookmark still lands
// somewhere useful instead of 404ing.
export default function ExchangeRatesRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/currencies?tab=rates') }, [router])
  return <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحويل...</div>
}
