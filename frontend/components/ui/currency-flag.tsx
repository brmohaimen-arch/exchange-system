'use client'

import { useState } from 'react'

// Windows doesn't ship a color flag-emoji font on most browsers, so the
// Unicode flag characters stored in Currency.flag render as blank boxes on
// many laptops (they still work fine on phones). We render a real flag
// image instead, keyed off the currency code, and only fall back to the
// stored emoji/text if the code isn't one we ship an image for.
const CODE_TO_COUNTRY: Record<string, string> = {
  LYD: 'ly',
  USD: 'us',
  EUR: 'eu',
  TRY: 'tr',
  GBP: 'gb',
  EGP: 'eg',
  TND: 'tn',
}

export function CurrencyFlag({ code, flag, className = '' }: { code: string; flag?: string; className?: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const country = CODE_TO_COUNTRY[code?.toUpperCase()]

  if (country && !imgFailed) {
    return (
      <img
        src={`/flags/${country}.svg`}
        alt={code}
        className={`inline-block h-[1em] w-[1.33em] rounded-[2px] object-cover align-middle ${className}`}
        onError={() => setImgFailed(true)}
      />
    )
  }

  return <span className={className}>{flag || code}</span>
}
