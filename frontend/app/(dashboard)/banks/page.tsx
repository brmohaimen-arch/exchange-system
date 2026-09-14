'use client'

import { TreasuryShell } from '@/components/treasury/TreasuryShell'

export default function BanksPage() {
  return <TreasuryShell visibleTabs={['banks', 'bank_movements', 'customer_bank_accounts', 'customer_bank_movements', 'branches']} pageTitle="البنوك والفروع" basePath="/banks" />
}
