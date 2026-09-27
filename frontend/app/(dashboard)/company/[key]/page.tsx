'use client'

import { useParams } from 'next/navigation'
import FleetCompanyPage from '@/components/fleet/FleetCompanyPage'

// One route for every company created from the sidebar ("+ إضافة شركة") —
// unlike بيان الدولية/الامتياز/اتقن المحركات, which each get their own fixed
// page file, a dynamic company is identified purely by its id in the URL.
export default function DynamicCompanyPage() {
  const params = useParams<{ key: string }>()
  return <FleetCompanyPage company={params.key} />
}
