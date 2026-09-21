'use client'

import { useEffect, useRef } from 'react'
import { useConfirm } from '@/components/ConfirmProvider'

// Dashboard-wide safety net against accidental submissions (employees in a
// hurry pressing Enter). Two guards, applied to every <form>:
//   1. Enter inside a single-line field only confirms THAT field — it moves
//      focus to the next one instead of submitting the whole form.
//   2. Submitting a form (clicking its submit button) always ends with a final
//      confirmation step before the real submit handler runs.
// Opt-outs: data-allow-enter (Enter may submit, e.g. a one-field "add" row)
// and data-no-confirm (skip the final confirmation, e.g. filters/OTP codes).
const NON_TEXT_INPUT_TYPES = new Set(['submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'image'])

export function FormGuard() {
  const confirm = useConfirm()
  const confirmRef = useRef(confirm)
  confirmRef.current = confirm

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing) return
      const target = e.target
      if (!(target instanceof HTMLInputElement) || NON_TEXT_INPUT_TYPES.has(target.type)) return
      const form = target.closest('form')
      if (!form || form.hasAttribute('data-allow-enter')) return

      e.preventDefault()
      const fields = Array.from(form.querySelectorAll<HTMLElement>('input, select, textarea'))
        .filter((el) => !(el as HTMLInputElement).disabled && (el as HTMLInputElement).type !== 'hidden' && el.tabIndex !== -1 && el.offsetParent !== null)
      const next = fields[fields.indexOf(target) + 1]
      if (next) next.focus()
    }

    const onSubmit = async (e: SubmitEvent) => {
      const form = e.target
      if (!(form instanceof HTMLFormElement)) return
      if (form.dataset.confirmed === '1' || form.hasAttribute('data-no-confirm')) return

      e.preventDefault()
      e.stopPropagation()
      const submitter = e.submitter instanceof HTMLButtonElement || e.submitter instanceof HTMLInputElement ? e.submitter : null
      const action = (submitter?.textContent || (submitter as HTMLInputElement | null)?.value || '').trim() || 'الحفظ'
      const title = form.closest('.fixed')?.querySelector('h3')?.textContent?.trim()
      const ok = await confirmRef.current(
        `تأكيد نهائي${title ? ` — ${title}` : ''}: هل راجعت جميع البيانات وتريد تنفيذ «${action}»؟ سيتم التنفيذ فور التأكيد.`
      )
      if (!ok) return
      form.dataset.confirmed = '1'
      try {
        if (submitter) form.requestSubmit(submitter)
        else form.requestSubmit()
      } finally {
        delete form.dataset.confirmed
      }
    }

    // Capture phase: run before React's own delegated handlers so a blocked
    // Enter / an unconfirmed submit never reaches the page's handlers.
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [])

  return null
}
