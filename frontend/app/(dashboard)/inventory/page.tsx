'use client'

import { TreasuryShell } from '@/components/treasury/TreasuryShell'

export default function InventoryPage() {
  return <TreasuryShell visibleTabs={['inventory', 'expenses']} pageTitle="الجرد والمصاريف" basePath="/inventory" />
}
