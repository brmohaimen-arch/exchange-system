"""Amounts written out in Arabic words, for the closing line of a statement
("مئة دينار فقط", "ألف ومئتان وخمسون ديناراً وخمسمئة درهم فقط").

Only what a statement needs: non-negative amounts up to the billions, the
counted noun agreeing with the number (دينار / ديناران / دنانير / ديناراً),
and a fractional sub-unit — the Libyan dinar has 1,000 dirhams, the dollar and
euro have 100 cents.
"""

_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة",
         "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"]
_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"]
_HUNDREDS = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"]

# (singular, dual, plural 3-10, accusative singular 11-99)
_SCALES = [
    None,
    ("ألف", "ألفان", "آلاف", "ألفاً"),
    ("مليون", "مليونان", "ملايين", "مليوناً"),
    ("مليار", "ملياران", "مليارات", "ملياراً"),
    ("تريليون", "تريليونان", "تريليونات", "تريليوناً"),
]

# code -> (main unit forms, sub-unit forms, sub-units per main unit)
_CURRENCIES = {
    "LYD": (("دينار", "ديناران", "دنانير", "ديناراً"), ("درهم", "درهمان", "دراهم", "درهماً"), 1000),
    "USD": (("دولار", "دولاران", "دولارات", "دولاراً"), ("سنت", "سنتان", "سنتات", "سنتاً"), 100),
    "EUR": (("يورو",) * 4, ("سنت", "سنتان", "سنتات", "سنتاً"), 100),
}


def _below_1000(n: int) -> str:
    parts = []
    h, r = divmod(n, 100)
    if h:
        parts.append(_HUNDREDS[h])
    if r:
        if r < 20:
            parts.append(_ONES[r])
        else:
            unit, ten = r % 10, r // 10
            parts.append(f"{_ONES[unit]} و{_TENS[ten]}" if unit else _TENS[ten])
    return " و".join(parts)


def _counted(n: int, forms: tuple[str, str, str, str], number_words: str) -> str:
    """Number + the noun in the grammatical form its count requires."""
    sg, dual, pl, acc = forms
    r = n % 100
    if n == 1:
        return f"{sg} واحد" if sg != dual else sg
    if n == 2:
        return dual
    if 3 <= r <= 10:
        return f"{number_words} {pl}"
    if 11 <= r <= 99:
        return f"{number_words} {acc}"
    return f"{number_words} {sg}"


def int_to_words(n: int) -> str:
    if n == 0:
        return "صفر"
    groups = []
    scale = 0
    while n:
        n, g = divmod(n, 1000)
        groups.append((scale, g))
        scale += 1
    words = []
    for scale, g in reversed(groups):
        if not g:
            continue
        if scale == 0:
            words.append(_below_1000(g))
        elif scale < len(_SCALES):
            sg, dual, pl, acc = _SCALES[scale]
            if g == 1:
                words.append(sg)
            elif g == 2:
                words.append(dual)
            elif g == 200:
                words.append(f"مئتا {sg}")
            elif 3 <= g % 100 <= 10:
                words.append(f"{_below_1000(g)} {pl}")
            elif 11 <= g % 100 <= 99:
                words.append(f"{_below_1000(g)} {acc}")
            else:
                words.append(f"{_below_1000(g)} {sg}")
    return " و".join(words)


def amount_in_words(amount: float, currency: str) -> str:
    """100 LYD -> "مئة دينار فقط"; 1250.5 LYD -> "ألف ومئتان وخمسون ديناراً وخمسمئة درهم فقط"."""
    main_forms, sub_forms, per_unit = _CURRENCIES.get(currency.upper(), ((currency,) * 4, (None,) * 4, 100))
    total_sub = int(round(abs(amount) * per_unit))
    whole, sub = divmod(total_sub, per_unit)
    parts = []
    if whole or not sub:
        parts.append(_counted(whole, main_forms, int_to_words(whole)) if whole else f"صفر {main_forms[0]}")
    if sub and sub_forms[0]:
        parts.append(_counted(sub, sub_forms, int_to_words(sub)))
    return " و".join(parts) + " فقط"


def balance_words(balance: float, currency: str) -> str:
    """Closing-balance phrase: amount in words followed by له (positive — the
    customer is owed / holds it) or عليه (negative — the customer owes it).
    Zero balances carry no side."""
    words = amount_in_words(balance, currency)
    if round(balance, 6) == 0:
        return words
    return f"{words} — {'له' if balance > 0 else 'عليه'}"


def balance_side(balance: float) -> str:
    if round(balance, 6) == 0:
        return ""
    return "له" if balance > 0 else "عليه"
