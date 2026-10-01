'use client'

import { createContext, useCallback, useContext, useState, ReactNode } from 'react'
import { CheckCircle2, X } from 'lucide-react'

interface SuccessOptions {
  /** Shown as a second button alongside "متابعة" when provided — picking it
   * calls this (the caller resets its own form state / reopens the create
   * modal) instead of just dismissing. Omit it for an action with no natural
   * "do it again" step (an edit, a delete, an approval, a reversal...),
   * which then shows a single acknowledgement button instead of a choice. */
  onCreateAnother?: () => void
  createAnotherLabel?: string
  proceedLabel?: string
}

type SuccessFn = (message: string, options?: SuccessOptions) => void

const SuccessContext = createContext<SuccessFn | null>(null)

/** A shared "تمت العملية بنجاح" popup for every successful operation across
 * the app, offering "متابعة" (just dismiss) or, where the action is
 * something a user plausibly repeats right away (a new transaction, a new
 * deposit, a new record), "إنشاء عملية أخرى" to go straight into another one. */
export function useSuccess(): SuccessFn {
  const ctx = useContext(SuccessContext)
  if (!ctx) throw new Error('useSuccess must be used within SuccessProvider')
  return ctx
}

export function SuccessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ message: string; options?: SuccessOptions } | null>(null)

  const successFn = useCallback<SuccessFn>((message, options) => {
    setState({ message, options })
  }, [])

  const dismiss = () => setState(null)
  const createAnother = () => {
    state?.options?.onCreateAnother?.()
    setState(null)
  }

  return (
    <SuccessContext.Provider value={successFn}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl p-6 text-right">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-success/10 p-2 text-success shrink-0">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="text-sm text-foreground pt-1">{state.message}</p>
              </div>
              <button type="button" onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2">
              {state.options?.onCreateAnother && (
                <button
                  type="button"
                  onClick={createAnother}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  {state.options?.createAnotherLabel || 'إنشاء عملية أخرى'}
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={dismiss}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {state.options?.proceedLabel || 'متابعة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SuccessContext.Provider>
  )
}
