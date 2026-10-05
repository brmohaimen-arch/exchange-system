'use client'

/**
 * Optional hand-typed wording for a statement's "التفاصيل" column. Left empty,
 * the statement writes that column automatically (e.g. "إيداع نقدي — من ...").
 * Shared by every form that creates or edits an operation.
 */
export function DetailsField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        التفاصيل <span className="text-xs font-normal text-muted-foreground">(اختياري)</span>
      </label>
      <input
        value={value}
        maxLength={300}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'اكتب وصفاً يظهر في كشف الحساب'}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      <p className="mt-1 text-xs text-muted-foreground">إن تُرك فارغاً يُكتب تلقائياً في الكشف.</p>
    </div>
  )
}
