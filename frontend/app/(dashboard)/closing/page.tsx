'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Merged into /reports (tab=closing) as part of the "reports and daily closing"
// sidebar section — this route only exists so any stale link/bookmark still lands
// somewhere useful instead of 404ing.
export default function ClosingRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/reports?tab=closing') }, [router])
  return <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحويل...</div>
}
