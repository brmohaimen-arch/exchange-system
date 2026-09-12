'use client'

import { TreasuryShell } from '@/components/treasury/TreasuryShell'

export default function BanksPage() {
  return <TreasuryShell visibleTabs={['banks', 'branches']} pageTitle="البنوك والفروع" basePath="/banks" />
}
