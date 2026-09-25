'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, LayoutDashboard, ArrowRightLeft, Coins, Landmark, Users,
  Package, Clock, ClipboardList, Building2, FileBarChart, Settings, UserRound, Receipt,
} from 'lucide-react'
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from '@/components/ui/command'
import { api, Customer, Transaction } from '@/lib/api-client'
import { matchesQuery, matchesPersonQuery, normalizeText } from '@/lib/search'

interface PageEntry {
  label: string
  href: string
  icon: typeof LayoutDashboard
  keywords: string
}

const PAGES: PageEntry[] = [
  { label: 'نظرة عامة', href: '/dashboard', icon: LayoutDashboard, keywords: 'الرئيسية لوحة التحكم dashboard home' },
  { label: 'العمليات (بيع وشراء وتبديل)', href: '/transactions', icon: ArrowRightLeft, keywords: 'عملية شراء بيع تبديل transactions buy sell exchange' },
  { label: 'الخزنة وحركة اليوم', href: '/treasury', icon: Landmark, keywords: 'خزنة حركة دخول خروج treasury vault movements' },
  { label: 'الورديات وطلبات الموافقة', href: '/shifts', icon: Clock, keywords: 'وردية موافقة تحويل shifts approvals transfer' },
  { label: 'الجرد والمصاريف', href: '/inventory', icon: ClipboardList, keywords: 'جرد مصروف inventory expenses' },
  { label: 'البنوك والفروع', href: '/banks', icon: Building2, keywords: 'بنك فرع bank branch' },
  { label: 'العملات وأسعار الصرف', href: '/currencies', icon: Coins, keywords: 'عملة سعر صرف currency rates' },
  { label: 'العملاء', href: '/customers', icon: Users, keywords: 'عميل دين مستند customer debt document' },
  { label: 'الأصول الثابتة', href: '/assets', icon: Package, keywords: 'أصل مركبة عقار صيانة إهلاك asset vehicle real estate maintenance depreciation' },
  { label: 'التقارير والإقفال اليومي', href: '/reports', icon: FileBarChart, keywords: 'تقرير أرباح امتثال قيود إقفال reports profit compliance journal closing' },
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

  // cmdk's own fuzzy filter is turned off (shouldFilter={false} below) — it only ever
  // looked at each item's `value` string, so a customer's phone number was never
  // searchable. Matching is done here instead, folding Arabic spelling variants and
  // accepting a phone in any local/international form (0918…, 918…, +218 91-8…).
  const q = normalizeText(query)
  const matchedPages = PAGES.filter((p) => !q || matchesQuery(q, p.label, p.keywords))

  const matchedCustomers = q
    ? customers
        .filter((c) => matchesPersonQuery(q, [c.name, c.id, c.idNumber], c.phone))
        .sort((a, b) => {
          // exact code first, then names that start with what was typed
          const score = (c: Customer) => (normalizeText(c.id) === q ? 2 : 0) + (normalizeText(c.name).startsWith(q) ? 1 : 0)
          return score(b) - score(a)
        })
        .slice(0, 8)
    : []

  const matchedTransactions = q
    ? transactions.filter((t) => matchesQuery(q, t.id, t.customerName)).slice(0, 5)
    : []

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-2 rounded-md border border-border bg-background p-2 text-sm text-muted-foreground hover:border-primary/50 transition-colors sm:w-56 sm:justify-start sm:px-3 sm:py-1.5"
        aria-label="بحث سريع"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden flex-1 text-right sm:inline">بحث سريع...</span>
        <CommandShortcut className="ml-0 hidden sm:inline-flex">Ctrl K</CommandShortcut>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false} title="بحث سريع" description="ابحث في صفحات النظام أو العملاء أو المعاملات">
        <CommandInput placeholder="ابحث باسم العميل أو رقمه أو هاتفه، أو صفحة، أو رقم معاملة..." value={query} onValueChange={setQuery} dir="rtl" />
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
                <CommandItem key={c.id} value={`customer-${c.id}`} onSelect={() => go(`/customers?customer=${encodeURIComponent(c.id)}`)}>
                  <UserRound />
                  <span className="flex flex-1 flex-wrap items-center gap-x-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">#{c.id}</span>
                    {c.phone && <span className="text-xs text-muted-foreground" dir="ltr">{c.phone}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-1" dir="ltr">
                    {Object.entries(c.balances).filter(([, v]) => Math.abs(v) > 0.004).map(([ccy, v]) => (
                      <span key={ccy} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${v < 0 ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
                        {v < 0 ? '-' : ''}{Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} {ccy}
                      </span>
                    ))}
                  </span>
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
