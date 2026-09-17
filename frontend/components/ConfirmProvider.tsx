'use client'

import { createContext, useCallback, useContext, useState, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmOptions {
  /** Defaults to true — most calls in this app confirm a delete. Pass false for a neutral action. */
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
  /** For the highest-stakes deletes (customer, vault, bank, user, ...): the
   * confirm button stays disabled until the user types this word (or its
   * Arabic/English delete-word counterpart — see typedWordMatches below).
   * Leave unset for the plain click-to-confirm dialog everything else uses. */
  requireTypedWord?: boolean
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// Accept either "delete" or "حذف" regardless of case/surrounding whitespace —
// whichever the user reaches for shouldn't matter, this app is used in both
// languages depending on the screen.
function typedWordMatches(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === 'delete' || v === 'حذف'
}

/** Replaces window.confirm(), which throws "prompt() is not supported" style
 * errors in this app's runtime (it isn't a real browser window — no native
 * confirm/prompt dialogs are available). Resolves true/false like the native
 * call would, so call sites just add `await` in front of the call. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ message: string; options?: ConfirmOptions; resolve: (v: boolean) => void } | null>(null)
  const [typedValue, setTypedValue] = useState('')

  const confirmFn = useCallback<ConfirmFn>((message, options) => {
    return new Promise((resolve) => setState({ message, options, resolve }))
  }, [])

  const respond = (result: boolean) => {
    state?.resolve(result)
    setState(null)
    setTypedValue('')
  }

  const danger = state?.options?.danger !== false
  const requireTypedWord = !!state?.options?.requireTypedWord
  const canConfirm = !requireTypedWord || typedWordMatches(typedValue)

  return (
    <ConfirmContext.Provider value={confirmFn}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl p-6 text-right">
            <div className="flex items-start gap-3 mb-4">
              {danger && (
                <div className="rounded-full bg-danger/10 p-2 text-danger shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              )}
              <p className="text-sm text-foreground pt-1">{state.message}</p>
            </div>
            {requireTypedWord && (
              <div className="mb-6">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  للتأكيد، اكتب "حذف" أو "delete"
                </label>
                <input
                  type="text"
                  autoFocus
                  value={typedValue}
                  onChange={(e) => setTypedValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) respond(true) }}
                  dir="rtl"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-danger/50"
                  placeholder="حذف"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => respond(false)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                {state.options?.cancelLabel || 'إلغاء'}
              </button>
              <button
                type="button"
                autoFocus={!requireTypedWord}
                disabled={!canConfirm}
                onClick={() => respond(true)}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary/90'}`}
              >
                {state.options?.confirmLabel || 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
