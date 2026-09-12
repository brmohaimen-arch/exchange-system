'use client'

import { TreasuryShell } from '@/components/treasury/TreasuryShell'

export default function TreasuryPage() {
  return <TreasuryShell visibleTabs={['vaults', 'movements']} pageTitle="الخزنة وحركة اليوم" basePath="/treasury" />
}
