'use client'

import { useEffect } from 'react'

// Every horizontally-scrollable strip in this app gets that scroll either from
// the `overflow-x-auto` utility class (tables) or from the tab-bar rule in
// globals.css (`main div.flex.border-b:has(> button)`, no utility class at
// all) — both need normalizing, so both selectors are scanned for here.
const SCROLLABLE_SELECTOR = '.overflow-x-auto, main div.flex.border-b'

/**
 * Every wide table/tab-bar in this RTL app sits inside one of the containers
 * matched above, and some of them open scrolled to the wrong end — showing
 * the last columns/tabs (status/date/actions, or the last tab) with the
 * first one cut off mid-content, not the first ones, which looks broken
 * ("the table is cut off") even though the data and the scroll strip are
 * both fine. Exactly which raw `scrollLeft` sign/value means "start" turns
 * out to vary per element in practice, so rather than guessing a sign, this
 * measures the gap between the container's own edge and its first real
 * cell/tab's edge (via getBoundingClientRect, direction-aware) and nudges
 * scrollLeft by exactly that — correct regardless of sign convention, and
 * touching only scrollLeft so it can never trigger a vertical page scroll
 * the way Element.scrollIntoView's "nearest" can for anything below the
 * fold.
 *
 * This normalizes every such container to open at that true start the
 * moment it first overflows, re-checking whenever its size changes (data
 * finishes loading, a tab switches content in) — but only until the user
 * scrolls it themselves, so their own position is never fought. Mounted
 * once at the root; it does not matter which page or how many strips are on
 * it, this is global.
 */
export function RtlScrollFix() {
  useEffect(() => {
    const userScrolled = new WeakSet<Element>()
    const seen = new WeakSet<Element>()

    const normalize = (el: HTMLElement) => {
      if (userScrolled.has(el)) return
      if (el.scrollWidth <= el.clientWidth) return
      const firstCell = (el.querySelector(':scope thead th:first-child, :scope tbody tr:first-child > *:first-child') || el.firstElementChild) as HTMLElement | null
      if (!firstCell) return
      const containerRect = el.getBoundingClientRect()
      const cellRect = firstCell.getBoundingClientRect()
      const isRtl = getComputedStyle(el).direction === 'rtl'
      const delta = isRtl ? cellRect.right - containerRect.right : cellRect.left - containerRect.left
      if (Math.abs(delta) > 1) el.scrollLeft += delta
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) normalize(entry.target as HTMLElement)
    })

    const watch = (el: HTMLElement) => {
      if (seen.has(el)) return
      seen.add(el)
      normalize(el)
      el.addEventListener('scroll', () => userScrolled.add(el), { passive: true })
      ro.observe(el)
    }

    const scan = () => document.querySelectorAll<HTMLElement>(SCROLLABLE_SELECTOR).forEach(watch)
    scan()

    const mo = new MutationObserver(() => scan())
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      ro.disconnect()
    }
  }, [])

  return null
}
