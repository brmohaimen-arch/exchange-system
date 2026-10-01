import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AuthProvider } from '@/lib/auth-provider'
import { ConfirmProvider } from '@/components/ConfirmProvider'
import { SuccessProvider } from '@/components/SuccessProvider'
import { BrandTitleSync } from '@/components/BrandTitleSync'
import { RtlScrollFix } from '@/components/RtlScrollFix'

export const metadata: Metadata = {
  title: 'شركة واكب | لوحة التحكم',
  description: 'لوحة تحكم نظام الصرافة — شركة واكب',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#7C3AED' },
    { media: '(prefers-color-scheme: dark)', color: '#1E1B4B' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
          <BrandTitleSync />
          <RtlScrollFix />
          <AuthProvider>
            <ConfirmProvider>
              <SuccessProvider>{children}</SuccessProvider>
            </ConfirmProvider>
          </AuthProvider>
      </body>
    </html>
  )
}
