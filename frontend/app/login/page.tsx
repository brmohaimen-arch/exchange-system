'use client'

import { useState, useEffect, FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { LogIn, ShieldCheck, Clock, Zap } from 'lucide-react'
import { useAuth, ApiError, MfaRequiredError } from '@/lib/auth-provider'
import { api } from '@/lib/api-client'

function LoginBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      <Image src="/login-bg.jpg" alt="" fill priority className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/60" />
      <div className="relative z-10 w-full flex flex-col items-center">{children}</div>
    </div>
  )
}

interface TrialStatus {
  expired: boolean
  daysRemaining: number
  trialDurationDays: number
}

export default function LoginPage() {
  const { login, completeMfaLogin } = useAuth()
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
      router.push('/')
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
      router.push('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر التحقق من الرمز')
    } finally {
      setLoading(false)
    }
  }

  if (trial?.expired) {
    return (
      <LoginBackdrop>
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/95 backdrop-blur p-8 shadow-2xl text-center">
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
              <Clock className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-foreground">انتهت الفترة التجريبية</h1>
            <p className="text-sm text-muted-foreground">
              انتهت الفترة التجريبية المجانية ({trial.trialDurationDays} يوماً) لهذا النظام. يرجى التواصل مع مزود الخدمة لتفعيل الاشتراك.
            </p>
          </div>
        </div>
      </LoginBackdrop>
    )
  }

  if (mfaUserId) {
    return (
      <LoginBackdrop>
        <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/95 backdrop-blur p-8 shadow-2xl">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-foreground">التحقق بخطوتين</h1>
            <p className="text-sm text-muted-foreground">أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة</p>
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-center text-lg tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {error && <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {loading ? 'جاري التحقق...' : 'تأكيد'}
            </button>
            <button
              type="button"
              onClick={() => { setMfaUserId(null); setMfaCode(''); setError('') }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              العودة لتسجيل الدخول
            </button>
          </form>
        </div>
      </LoginBackdrop>
    )
  }

  return (
    <LoginBackdrop>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card/95 backdrop-blur p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image src="/logo.png" alt="شركة واكب" width={200} height={140} priority className="w-40 h-auto" />
          <p className="text-sm text-muted-foreground">تسجيل الدخول إلى نظام الصرافة</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-right">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">اسم المستخدم</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {error && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {trial && !trial.expired && trial.daysRemaining <= 5 && (
            <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              تنتهي الفترة التجريبية بعد {trial.daysRemaining} {trial.daysRemaining === 1 ? 'يوم' : 'أيام'}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            <LogIn className="h-4 w-4" />
            {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-full bg-black/30 backdrop-blur px-4 py-2 text-xs text-white/80">
        <Image src="/fvg-badge.png" alt="" width={20} height={20} className="rounded-md" />
        <span className="flex items-center gap-1">
          <Zap className="h-3 w-3 text-warning" /> سريع
        </span>
        <span className="text-white/30">·</span>
        <span>آمن</span>
        <span className="text-white/30">·</span>
        <span>عالمي</span>
      </div>
    </LoginBackdrop>
  )
}
