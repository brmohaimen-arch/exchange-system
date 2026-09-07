'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft, PlayCircle, CheckCircle2, Zap, ShieldCheck,
  Building2, TrendingUp, Users, FileBarChart, Wallet, Landmark,
  MessageCircle, Send, Menu, X,
} from 'lucide-react'

const NAV_LINKS = [
  { href: '#features', label: 'المميزات' },
  { href: '#how', label: 'كيف يعمل' },
  { href: '#contact', label: 'تواصل معنا' },
]

const TRUST_ITEMS = ['بيانات مشفّرة بالكامل', 'دعم عربي كامل', 'يدعم عدة فروع وخزائن']

const FEATURES = [
  { icon: Landmark, title: 'خزائن وفروع متعددة', desc: 'تابع كل فرع وخزنة على حدة، حوّل بينها، واعتمد الإقفال اليومي لكل فرع ثم للشركة ككل.' },
  { icon: TrendingUp, title: 'أسعار صرف لحظية', desc: 'حدّث أسعار الشراء والبيع لكل عملة، مع حدود دنيا وقصوى تمنع أي تنفيذ خاطئ.' },
  { icon: FileBarChart, title: 'تقارير جاهزة للتصدير', desc: 'أرباح، ديون، امتثال، وقيود محاسبية — بضغطة واحدة، بصيغة Excel أو PDF بالعربية.' },
  { icon: Users, title: 'إدارة عملاء وديون', desc: 'سجل كامل لكل عميل: عملياته، أرصدته، ديونه المفتوحة، ومستنداته في مكان واحد.' },
  { icon: MessageCircle, title: 'تنبيهات واتساب وتيليجرام', desc: 'ملخص نهاية اليوم وتنبيهات العمليات الحساسة تصل مباشرة لمدير المكتب.' },
  { icon: ShieldCheck, title: 'صلاحيات وتدقيق كامل', desc: 'أدوار دقيقة لكل موظف، وسجل تدقيق يوثّق كل عملية وتعديل في النظام.' },
]

export default function LandingPage() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="bg-white text-[#0f172a]" dir="rtl">
      {/* Sticky nav */}
      <header className="sticky top-0 z-50 border-b border-[#0f172a0f] bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image src="/icon.png" alt="واكب" width={30} height={30} className="rounded-lg shrink-0" />
            <span className="font-arabic text-base font-bold lg:hidden">واكب</span>
            <span className="font-arabic hidden text-base font-bold lg:inline">شركة واكب للخدمات المالية</span>
          </div>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-[13.5px] font-medium text-[#64748b] transition-colors hover:text-[#0f172a]">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <Link href="/login" className="text-[13.5px] font-medium text-[#64748b] transition-colors hover:text-[#0f172a]">
              تسجيل الدخول
            </Link>
            <Link href="/login" className="rounded-full bg-[#0f172a] px-4 py-[9px] text-[13.5px] font-semibold text-white transition-colors hover:bg-[#0f172a]/90">
              الدخول للنظام
            </Link>
          </div>

          <button onClick={() => setMobileNavOpen((v) => !v)} className="p-1.5 text-[#0f172a] md:hidden" aria-label="القائمة">
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileNavOpen && (
          <div className="border-t border-[#0f172a0f] bg-white px-5 py-4 md:hidden">
            <nav className="flex flex-col gap-3">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setMobileNavOpen(false)} className="text-sm font-medium text-[#334155]">
                  {l.label}
                </a>
              ))}
              <Link href="/login" className="mt-2 rounded-full bg-[#0f172a] px-4 py-2.5 text-center text-sm font-semibold text-white">
                الدخول للنظام
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#0f172a0f]">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] opacity-80 lg:block"
          style={{
            background: 'linear-gradient(to left, #eff4ff, rgba(239,244,255,0.35), transparent)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52%] lg:block"
          style={{
            backgroundImage: 'radial-gradient(#2743ff29 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
            maskImage: 'linear-gradient(to left, #000 24%, transparent)',
            WebkitMaskImage: 'linear-gradient(to left, #000 24%, transparent)',
          }}
        />

        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28">
          {/* Copy */}
          <div className="max-w-[520px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#0f172a12] bg-[#eff4ff] px-3 py-[5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2743ff]" />
              <span className="font-arabic text-[11px] font-semibold tracking-[0.08em] text-[#2743ff]">الآن مع تنبيهات واتساب وتيليجرام</span>
            </div>

            <h1 className="font-arabic mt-5 text-[34px] font-extrabold leading-[1.3] sm:text-[44px]">
              نظام واحد لإدارة
              <br />
              مكتب الصرافة من{' '}
              <span className="relative inline-block">
                <span className="absolute inset-x-0 bottom-1.5 -z-10 h-3 rounded-sm bg-[#ffc95c]/70" />
                الألف إلى الياء
              </span>
              .
            </h1>
            <p className="font-arabic mt-5 max-w-[440px] text-base leading-relaxed text-[#64748b]">
              عمليات الصرف، الخزائن والفروع، الديون، التقارير، والامتثال — كل ما يحتاجه مكتب صرافة ليبي في نظام عربي واحد، بدل جداول متفرقة.
            </p>

            <div className="mt-8 flex flex-col gap-3.5 sm:flex-row">
              <Link href="/login" className="flex items-center justify-center gap-2 rounded-full bg-[#2743ff] px-7 py-[15px] text-[15px] font-semibold text-white transition-colors hover:bg-[#2743ff]/90">
                الدخول للنظام
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <a href="#contact" className="flex items-center justify-center gap-2 rounded-full border border-[#0f172a1a] bg-white px-7 py-[15px] text-[15px] font-medium text-[#334155] transition-colors hover:bg-[#f8fafc]">
                <PlayCircle className="h-4 w-4" />
                اطلب عرضاً توضيحياً
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-[#64748b]">
              {TRUST_ITEMS.map((t, i) => (
                <span key={t} className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#2743ff]" />
                    {t}
                  </span>
                  {i < TRUST_ITEMS.length - 1 && <span className="h-3 w-px bg-[#e2e8f0]" />}
                </span>
              ))}
            </div>
          </div>

          {/* Product mock */}
          <div className="relative">
            <div className="overflow-hidden rounded-[20px] border border-[#0f172a12] bg-white shadow-[0_40px_80px_-36px_rgba(15,23,42,0.30)]">
              <div className="flex items-center gap-2 border-b border-[#0f172a0f] bg-[#f8fafc]/70 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2743ff]/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#e2e8f0]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#e2e8f0]" />
                <span className="font-arabic mr-2 rounded-md bg-white px-3 py-1 text-[11px] text-[#94a3b8] border border-[#0f172a0d]">لوحة التحكم — نظرة عامة</span>
              </div>
              <div className="space-y-4 bg-[#f8fafc]/40 px-5 py-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-[#0f172a0f] bg-white p-3.5">
                    <p className="font-arabic text-[11px] text-[#94a3b8]">رصيد الخزنة الرئيسية</p>
                    <p className="mt-1 text-lg font-bold">956,865 د.ل</p>
                  </div>
                  <div className="rounded-xl border-2 border-[#2743ff]/40 bg-[#eff4ff] p-3.5">
                    <p className="font-arabic text-[11px] text-[#2743ff]">معاملات اليوم</p>
                    <p className="mt-1 text-lg font-bold text-[#2743ff]">27</p>
                  </div>
                </div>
                <div className="rounded-xl border border-[#0f172a0f] bg-white p-4">
                  <p className="font-arabic mb-3 text-[11px] font-semibold text-[#94a3b8]">أسعار الصرف</p>
                  <div className="space-y-2.5">
                    {[{ c: 'USD', v: '5.42', up: true }, { c: 'EUR', v: '5.86', up: false }, { c: 'TRY', v: '0.16', up: true }].map((r) => (
                      <div key={r.c} className="flex items-center justify-between text-sm">
                        <span className="font-medium">{r.c} / د.ل</span>
                        <span className={`flex items-center gap-1 font-mono ${r.up ? 'text-[#059669]' : 'text-[#dc2626]'}`}>
                          {r.v}
                          <TrendingUp className={`h-3 w-3 ${r.up ? '' : 'rotate-90'}`} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-[#2743ff] px-4 py-3 text-white">
                  <span className="font-arabic text-sm font-medium">إقفال يومية الفروع</span>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="absolute -bottom-4 -right-3 hidden items-center gap-2 rounded-2xl border border-[#0f172a0f] bg-white px-4 py-3 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.35)] sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff4ff] text-[#2743ff]">
                <Zap className="h-4 w-4" />
              </span>
              <div>
                <p className="font-arabic text-xs font-semibold">إقفال آمن خلال ثوانٍ</p>
                <p className="font-arabic text-[11px] text-[#94a3b8]">لقطة فورية لكل الخزائن</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-arabic text-[28px] font-extrabold sm:text-[34px]">كل ما يحتاجه مكتبك، في مكان واحد</h2>
          <p className="font-arabic mt-3 text-[#64748b]">مبني خصيصاً لطريقة عمل مكاتب الصرافة الليبية — لا حلول عامة، ولا جداول Excel متناثرة.</p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-[#0f172a0f] p-6 transition-shadow hover:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.25)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eff4ff] text-[#2743ff]">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="font-arabic mt-4 text-base font-bold">{f.title}</h3>
              <p className="font-arabic mt-2 text-sm leading-relaxed text-[#64748b]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works / contact CTA */}
      <section id="how" className="border-y border-[#0f172a0f] bg-[#f8fafc]">
        <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-3">
            {[
              { n: '١', t: 'نتعرف على مكتبك', d: 'عدد الفروع، الخزائن، والعملات التي تتعامل بها — نجهّز النظام على مقاسك.' },
              { n: '٢', t: 'ننقل بياناتك', d: 'العملاء، الأرصدة، والديون المفتوحة تُدخل قبل أول يوم تشغيل فعلي.' },
              { n: '٣', t: 'تبدأ العمل فوراً', d: 'فريقك يسجّل الدخول بأدواره وصلاحياته، وتبدأ متابعة كل عملية من أول يوم.' },
            ].map((s) => (
              <div key={s.n}>
                <span className="font-arabic flex h-10 w-10 items-center justify-center rounded-full bg-[#2743ff] text-base font-bold text-white">{s.n}</span>
                <h3 className="font-arabic mt-4 text-lg font-bold">{s.t}</h3>
                <p className="font-arabic mt-2 text-sm leading-relaxed text-[#64748b]">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-[1200px] px-5 py-20 text-center sm:px-8 sm:py-24">
        <h2 className="font-arabic text-[26px] font-extrabold sm:text-[32px]">مهتم بتجربة واكب في مكتبك؟</h2>
        <p className="font-arabic mx-auto mt-3 max-w-md text-[#64748b]">تواصل معنا وسنرتب لك عرضاً توضيحياً على بياناتك الفعلية.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
          <a href="mailto:info@wakeb.com.ly" className="flex items-center gap-2 rounded-full bg-[#2743ff] px-7 py-[15px] text-[15px] font-semibold text-white transition-colors hover:bg-[#2743ff]/90">
            <Send className="h-4 w-4" />
            راسلنا الآن
          </a>
          <Link href="/login" className="flex items-center gap-2 rounded-full border border-[#0f172a1a] px-7 py-[15px] text-[15px] font-medium text-[#334155] transition-colors hover:bg-[#f8fafc]">
            لديك حساب؟ سجّل الدخول
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#020617] text-white">
        <div className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5">
                <Image src="/icon.png" alt="واكب" width={28} height={28} className="rounded-lg shrink-0" />
                <span className="font-arabic text-base font-bold">شركة واكب للخدمات المالية</span>
              </div>
              <p className="font-arabic mt-3 max-w-xs text-[13.5px] leading-relaxed text-[#94a3b8]">
                نظام إدارة متكامل لمكاتب الصرافة الليبية — الخزائن، الفروع، العمليات، والتقارير في مكان واحد.
              </p>
            </div>
            <div>
              <h4 className="font-arabic text-[11px] font-semibold tracking-[0.1em] text-[#64748b]">المنتج</h4>
              <div className="mt-4 flex flex-col gap-2.5 text-[13.5px] text-[#cbd5e1]">
                <a href="#features" className="font-arabic hover:text-white transition-colors">المميزات</a>
                <a href="#how" className="font-arabic hover:text-white transition-colors">كيف يعمل</a>
                <Link href="/login" className="font-arabic hover:text-white transition-colors">تسجيل الدخول</Link>
              </div>
            </div>
            <div>
              <h4 className="font-arabic text-[11px] font-semibold tracking-[0.1em] text-[#64748b]">تواصل</h4>
              <div className="mt-4 flex flex-col gap-2.5 text-[13.5px] text-[#cbd5e1]">
                <a href="mailto:info@wakeb.com.ly" className="hover:text-white transition-colors" dir="ltr">info@wakeb.com.ly</a>
                <a href="#contact" className="font-arabic hover:text-white transition-colors">اطلب عرضاً توضيحياً</a>
              </div>
            </div>
          </div>
          <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
            <p className="font-arabic text-xs text-[#64748b]">© {new Date().getFullYear()} شركة واكب للخدمات المالية. جميع الحقوق محفوظة.</p>
            <span className="font-arabic flex items-center gap-1.5 text-xs text-[#64748b]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              جميع الأنظمة تعمل بشكل طبيعي
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
