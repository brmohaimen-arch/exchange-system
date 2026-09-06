'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, LayoutDashboard, ArrowRightLeft, TrendingUp, Coins, Landmark, Users,
  Package, Lock, FileBarChart, Settings, UserRound, Receipt,
} from 'lucide-react'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from '@/components/ui/command'
import { api, Customer, Transaction } from '@/lib/api-client'

interface PageEntry {
  label: string
  href: string
  icon: typeof LayoutDashboard
  keywords: string
}

const PAGES: PageEntry[] = [
  { label: 'نظرة عامة', href: '/', icon: LayoutDashboard, keywords: 'الرئيسية لوحة التحكم dashboard home' },
  { label: 'العمليات (بيع وشراء وتبديل)', href: '/transactions', icon: ArrowRightLeft, keywords: 'عملية شراء بيع تبديل transactions buy sell exchange' },
  { label: 'أسعار الصرف', href: '/exchange-rates', icon: TrendingUp, keywords: 'سعر صرف rates' },
  { label: 'العملات', href: '/currencies', icon: Coins, keywords: 'عملة currency currencies' },
  { label: 'الخزينة والفروع', href: '/treasury', icon: Landmark, keywords: 'خزنة فرع بنك وردية جرد مصاريف موافقة treasury vault branch bank shift inventory expenses approvals' },
  { label: 'العملاء', href: '/customers', icon: Users, keywords: 'عميل دين مستند customer debt document' },
  { label: 'الأصول الثابتة', href: '/assets', icon: Package, keywords: 'أصل مركبة عقار صيانة إهلاك asset vehicle real estate maintenance depreciation' },
  { label: 'الإقفال اليومي', href: '/closing', icon: Lock, keywords: 'إقفال closing' },
  { label: 'التقارير والإقفال', href: '/reports', icon: FileBarChart, keywords: 'تقرير أرباح امتثال قيود reports profit compliance journal' },
  { label: 'الإعدادات', href: '/settings', icon: Settings, keywords: 'مستخدم دور صلاحية نسخة احتياطية settings users roles backup' },
]

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loadedRecords, setLoadedRecords] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open || loadedRecords) return
    // Fetched lazily on first open, not on every page load — this is a global
    // component mounted in the header, so eager-fetching would mean loading
    // every customer + transaction on every single page render.
    setLoadedRecords(true)
    Promise.allSettled([
      api.get<Customer[]>('/customers'),
      api.get<Transaction[]>('/transactions'),
    ]).then(([custRes, txRes]) => {
      if (custRes.status === 'fulfilled') setCustomers(custRes.value)
      if (txRes.status === 'fulfilled') setTransactions(txRes.value)
    })
  }, [open, loadedRecords])

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  const q = query.trim().toLowerCase()
  const matchedPages = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q) || p.keywords.toLowerCase().includes(q))

  const matchedCustomers = q
    ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.phone?.toLowerCase().includes(q)).slice(0, 5)
    : []

  const matchedTransactions = q
    ? transactions.filter((t) => t.id.toLowerCase().includes(q) || t.customerName?.toLowerCase().includes(q)).slice(0, 5)
    : []

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-primary/50 transition-colors w-56"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-right">بحث سريع...</span>
        <CommandShortcut className="ml-0">Ctrl K</CommandShortcut>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} title="بحث سريع" description="ابحث في صفحات النظام أو العملاء أو المعاملات">
        <CommandInput placeholder="ابحث عن صفحة، عميل، أو رقم معاملة..." value={query} onValueChange={setQuery} dir="rtl" />
        <CommandList dir="rtl">
          <CommandEmpty>لا توجد نتائج</CommandEmpty>

          {matchedPages.length > 0 && (
            <CommandGroup heading="الصفحات">
              {matchedPages.map((p) => (
                <CommandItem key={p.href} value={`page-${p.href}-${p.label}`} onSelect={() => go(p.href)}>
                  <p.icon /> {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {matchedCustomers.length > 0 && (
            <CommandGroup heading="العملاء">
              {matchedCustomers.map((c) => (
                <CommandItem key={c.id} value={`customer-${c.id}-${c.name}`} onSelect={() => go('/customers')}>
                  <UserRound /> {c.name} <span className="text-muted-foreground">({c.id})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {matchedTransactions.length > 0 && (
            <CommandGroup heading="المعاملات">
              {matchedTransactions.map((t) => (
                <CommandItem key={t.id} value={`tx-${t.id}`} onSelect={() => go('/transactions')}>
                  <Receipt /> {t.id} — {t.customerName || '—'} ({t.totalAmount.toLocaleString()} {t.toCurrency})
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
