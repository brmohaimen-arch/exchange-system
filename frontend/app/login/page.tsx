'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  LogIn, User, Lock, Eye, EyeOff, ShieldCheck, Clock,
  Building2, FileBarChart, Wallet,
} from 'lucide-react'
import { useAuth, ApiError, MfaRequiredError } from '@/lib/auth-provider'
import { api } from '@/lib/api-client'

interface TrialStatus {
  expired: boolean
  daysRemaining: number
  trialDurationDays: number
}

const FEATURES = [
  { icon: Building2, label: 'إدارة متعددة الفروع والخزائن' },
  { icon: FileBarChart, label: 'تقارير وأرباح فورية ودقيقة' },
  { icon: Wallet, label: 'تتبع كامل لكل عملية صرف' },
]

function BrandPanel() {
  return (
    <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between overflow-hidden bg-[#2743ff] px-12 py-10 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: 'radial-gradient(#1b34c9 1.5px, transparent 1.5px)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="relative flex items-center gap-3">
        <Image src="/logo.png" alt="واكب" width={56} height={56} className="rounded-xl" />
        <span className="font-arabic text-lg font-bold leading-tight">شركة واكب للخدمات المالية</span>
      </div>

      <div className="relative space-y-5">
        <h1 className="font-arabic text-4xl font-bold leading-[1.35] xl:text-[2.75rem]">
          أدر أعمال الصرافة بكل{' '}
          <span className="relative inline-block">
            <span className="absolute inset-x-0 bottom-1 -z-10 h-3 rounded-sm bg-[#ffc95c]/80" />
            ثقة
          </span>
          .
        </h1>
        <p className="max-w-md text-base leading-relaxed text-white/70">
          منصة متكاملة لإدارة الخزائن والفروع والعمليات وتوليد التقارير — كل ما تحتاجه في مكان واحد.
        </p>
      </div>

      <div className="relative space-y-3">
        {FEATURES.map((f) => (
          <div key={f.label} className="flex items-center gap-3 text-sm text-white/85">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <f.icon className="h-4 w-4" />
            </span>
            {f.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { login, completeMfaLogin } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mfaUserId, setMfaUserId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [trial, setTrial] = useState<TrialStatus | null>(null)

  useEffect(() => {
    api.get<TrialStatus>('/setup/trial').then(setTrial).catch(() => {})
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      router.push('/dashboard')
    } catch (err) {
      if (err instanceof MfaRequiredError) {
        setMfaUserId(err.userId)
      } else {
        setError(err instanceof ApiError ? err.message : 'تعذر تسجيل الدخول')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleMfaSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await completeMfaLogin(mfaUserId!, mfaCode.trim())
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر التحقق من الرمز')
    } finally {
      setLoading(false)
    }
  }

  if (trial?.expired) {
    return (
      <div className="flex min-h-screen">
        <BrandPanel />
        <div className="flex flex-1 items-center justify-center bg-white px-4">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444]">
              <Clock className="h-7 w-7" />
            </div>
            <h1 className="font-arabic text-xl font-bold text-[#0d1220]">انتهت الفترة التجريبية</h1>
            <p className="mt-2 text-sm text-[#5b6478]">
              انتهت الفترة التجريبية المجانية ({trial.trialDurationDays} يوماً) لهذا النظام. يرجى التواصل مع مزود الخدمة لتفعيل الاشتراك.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (mfaUserId) {
    return (
      <div className="flex min-h-screen">
        <BrandPanel />
        <div className="flex flex-1 items-center justify-center bg-white px-4">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex flex-col items-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2743ff]/10 text-[#2743ff]">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h1 className="font-arabic text-xl font-bold text-[#0d1220]">التحقق بخطوتين</h1>
              <p className="text-sm text-[#5b6478]">أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة</p>
            </div>
            <form onSubmit={handleMfaSubmit} className="space-y-4 text-right">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                dir="ltr"
                className="w-full rounded-lg border border-[#dfe2ea] bg-white px-3 py-2.5 text-center text-lg tracking-[0.5em] focus:border-[#2743ff] focus:outline-none focus:ring-4 focus:ring-[#2743ff]/15"
              />
              {error && <p className="rounded-lg bg-[#ef4444]/10 px-3 py-2 text-sm text-[#ef4444]">{error}</p>}
              <button
                type="submit"
                disabled={loading || mfaCode.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2743ff] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2743ff]/90 disabled:opacity-60"
              >
                {loading ? 'جاري التحقق...' : 'تأكيد'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaUserId(null); setMfaCode(''); setError('') }}
                className="w-full text-center text-xs text-[#5b6478] transition-colors hover:text-[#0d1220]"
              >
                العودة لتسجيل الدخول
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <BrandPanel />

      <div className="flex flex-1 items-center justify-center bg-white px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-2 text-center lg:hidden">
            <Image src="/logo.png" alt="واكب" width={52} height={52} className="rounded-lg" />
            <span className="font-arabic text-base font-bold text-[#0d1220]">شركة واكب للخدمات المالية</span>
          </div>

          <h2 className="font-arabic text-2xl font-bold text-[#0d1220]">مرحباً بعودتك</h2>
          <p className="mt-1 text-sm text-[#5b6478]">سجّل الدخول للمتابعة إلى نظام الصرافة</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4 text-right">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#0d1220]">اسم المستخدم</label>
              <div className="relative">
                <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6478]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-[#dfe2ea] bg-white py-2.5 ps-9 pe-3 text-sm text-[#0d1220] focus:border-[#2743ff] focus:outline-none focus:ring-4 focus:ring-[#2743ff]/15"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#0d1220]">كلمة المرور</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6478]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#dfe2ea] bg-white py-2.5 pe-9 ps-9 text-sm text-[#0d1220] focus:border-[#2743ff] focus:outline-none focus:ring-4 focus:ring-[#2743ff]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5b6478] hover:text-[#0d1220]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="rounded-lg bg-[#ef4444]/10 px-3 py-2 text-sm text-[#ef4444]">{error}</p>
            )}

            {trial && !trial.expired && trial.daysRemaining <= 5 && (
              <p className="flex items-center gap-1.5 rounded-lg bg-[#f59e0b]/10 px-3 py-2 text-xs text-[#f59e0b]">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                تنتهي الفترة التجريبية بعد {trial.daysRemaining} {trial.daysRemaining === 1 ? 'يوم' : 'أيام'}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2743ff] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2743ff]/90 disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
