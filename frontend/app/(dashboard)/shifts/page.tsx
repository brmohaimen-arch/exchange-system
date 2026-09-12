'use client'

import { TreasuryShell } from '@/components/treasury/TreasuryShell'

export default function ShiftsPage() {
  return <TreasuryShell visibleTabs={['shifts', 'approvals']} pageTitle="الورديات وطلبات الموافقة" basePath="/shifts" />
}
