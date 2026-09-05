'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, DollarSign, Users, Activity, CreditCard, Clock, ShieldCheck, PlayCircle, Lock } from 'lucide-react'
import { api, Transaction, Customer, Vault, Shift, ApprovalRequestDTO } from '@/lib/api-client'
import { ApiError, useAuth } from '@/lib/auth-provider'

const statusLabel: Record<string, { label: string; className: string }> = {
  approved: { label: 'مكتمل', className: 'bg-success/10 text-success' },
  pending: { label: 'قيد المعالجة', className: 'bg-warning/10 text-warning' },
  reversed: { label: 'ملغي', className: 'bg-danger/10 text-danger' },
}

const typeLabel: Record<string, string> = { buy: 'شراء', sell: 'بيع', exchange: 'تبديل', deposit: 'إيداع', withdraw: 'سحب' }

function fmt(n: number) {
  return n.toLocaleString('ar-LY', { maximumFractionDigits: 2 })
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [vaults, setVaults] = useState<Vault[]>([])
  const [shifts, setShifts] = useState<Shift[]>([])
  const [approvals, setApprovals] = useState<ApprovalRequestDTO[]>([])
  const [profit, setProfit] = useState(0)

  const isCashier = hasPermission('تنفيذ بيع عملة') || hasPermission('تنفيذ شراء عملة')
  const canSeeProfit = hasPermission('رؤية الأرباح')
  const canSeeReports = hasPermission('رؤية التقارير')
  const canApprove = hasPermission('الموافقة على التحويلات') || hasPermission('اعتماد الإقفالات') || hasPermission('إنشاء عملية عكسية')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const results = await Promise.allSettled([
          api.get<Transaction[]>('/transactions'),
          api.get<Customer[]>('/customers'),
          api.get<Vault[]>('/vaults'),
          canSeeProfit ? api.get<{ summary: { totalProfit: number } }>('/reports/profit') : Promise.resolve(null),
          api.get<Shift[]>('/shifts'),
          canApprove ? api.get<ApprovalRequestDTO[]>('/approvals') : Promise.resolve([]),
        ])
        if (cancelled) return
        const [txs, custs, vlts, profitData, sh, ap] = results
        if (txs.status === 'fulfilled') setTransactions(txs.value)
        if (custs.status === 'fulfilled') setCustomers(custs.value)
        if (vlts.status === 'fulfilled') setVaults(vlts.value)
        if (profitData.status === 'fulfilled' && profitData.value) setProfit(profitData.value.summary.totalProfit)
        if (sh.status === 'fulfilled') setShifts(sh.value)
        if (ap.status === 'fulfilled') setApprovals(ap.value as ApprovalRequestDTO[])
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'تعذر تحميل بيانات لوحة التحكم')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [canSeeProfit, canApprove])

  const today = new Date().toISOString().slice(0, 10)
  const myVault = vaults.find((v) => v.id === user?.allowedVaultId) || vaults[0]
  const myShift = shifts.find((s) => s.vaultId === myVault?.id && s.status === 'open')
  const myPendingShift = shifts.find((s) => s.vaultId === myVault?.id && s.status === 'pending_open')
  const pendingApprovalsCount = approvals.filter((a) => a.status === 'pending').length

  const todaysTxCount = transactions.filter((t) => t.timestamp?.startsWith(today)).length
  const myTodaysTx = transactions.filter((t) => t.timestamp?.startsWith(today) && t.vaultId === myVault?.id)
  const activeCustomers = customers.filter((c) => c.isActive).length
  const mainVaultLYD = vaults.reduce((sum, v) => sum + (v.balances?.LYD || 0), 0)

  const recent = [...(isCashier && !canSeeReports ? transactions.filter((t) => t.vaultId === myVault?.id) : transactions)]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 6)

  const kpiData = [
    canSeeProfit && { title: 'الأرباح المتوقعة (د.ل)', value: fmt(profit), icon: DollarSign },
    { title: 'العملاء النشطون', value: fmt(activeCustomers), icon: Users },
    { title: isCashier ? 'معاملاتي اليوم' : 'المعاملات اليوم', value: fmt(isCashier ? myTodaysTx.length : todaysTxCount), icon: Activity },
    canSeeReports && { title: 'رصيد الخزنة الرئيسية (د.ل)', value: fmt(mainVaultLYD), icon: CreditCard },
  ].filter(Boolean) as { title: string; value: string; icon: typeof DollarSign }[]

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">جاري التحميل...</div>
  }

  return (
    <div className="space-y-6">
      {error && <p className="rounded-md bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}

      {/* Cashier: shift status — the "start of session" entry point */}
      {isCashier && myVault && (
        <div className={`rounded-xl border p-6 shadow-sm flex items-center justify-between ${
          myShift ? 'border-success/30 bg-success/5' : myPendingShift ? 'border-info/30 bg-info/5' : 'border-warning/30 bg-warning/5'
        }`}>
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
              myShift ? 'bg-success/10 text-success' : myPendingShift ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'
            }`}>
              {myShift ? <Clock className="h-6 w-6" /> : myPendingShift ? <Clock className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {myShift ? `الوردية مفتوحة — ${myVault.name}` : myPendingShift ? `طلب الفتح بانتظار الموافقة — ${myVault.name}` : `لا توجد وردية مفتوحة — ${myVault.name}`}
              </h3>
              <p className="text-sm text-muted-foreground">
                {myShift ? `بدأت الساعة ${myShift.startTime}` : myPendingShift ? `تم إرسال الطلب الساعة ${myPendingShift.requestedAt}` : 'يجب طلب فتح وردية جديدة وموافقة المدير عليها قبل تنفيذ أي عملية'}
              </p>
            </div>
          </div>
          <Link
            href="/transactions"
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              myShift || myPendingShift ? 'border border-border hover:bg-muted' : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {myShift ? <ArrowUpRight className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {myShift ? 'الذهاب للعمليات' : myPendingShift ? 'عرض الحالة' : 'طلب فتح الوردية'}
          </Link>
        </div>
      )}

      {/* Manager/approver: pending approvals */}
      {canApprove && pendingApprovalsCount > 0 && (
        <Link
          href="/treasury"
          className="flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 p-6 shadow-sm hover:bg-warning/10 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">لديك {pendingApprovalsCount} طلب موافقة معلق</h3>
              <p className="text-sm text-muted-foreground">تحويلات، إقفال ورديات، أو عمليات عكسية بانتظار مراجعتك</p>
            </div>
          </div>
          <ArrowUpRight className="h-5 w-5 text-warning" />
        </Link>
      )}

      {/* KPI Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((item, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{item.title}</p>
                <h3 className="mt-2 text-2xl font-bold text-foreground">{item.value}</h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
                <item.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border px-6 py-4 flex justify-between items-center bg-secondary/30">
          <h3 className="text-lg font-semibold text-foreground">{isCashier && !canSeeReports ? 'معاملاتي الأخيرة' : 'أحدث المعاملات'}</h3>
          <a href="/transactions" className="text-sm text-primary hover:underline font-medium">عرض الكل</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-6 py-4 font-medium">رقم المعاملة</th>
                <th className="px-6 py-4 font-medium">النوع</th>
                <th className="px-6 py-4 font-medium">العميل</th>
                <th className="px-6 py-4 font-medium">المبلغ</th>
                <th className="px-6 py-4 font-medium">الحالة</th>
                <th className="px-6 py-4 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">لا توجد معاملات بعد</td></tr>
              ) : recent.map((tx) => {
                const st = statusLabel[tx.status] || statusLabel.approved
                return (
                  <tr key={tx.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{tx.id}</td>
                    <td className="px-6 py-4">{typeLabel[tx.type] || tx.type}</td>
                    <td className="px-6 py-4">{tx.customerName || '—'}</td>
                    <td className="px-6 py-4 font-medium">{fmt(tx.totalAmount)} {tx.toCurrency}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.className}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{tx.timestamp}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
