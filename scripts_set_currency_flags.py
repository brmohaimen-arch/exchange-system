"""
Run this ON THE SERVER, in the same directory as the production sql_app.db,
to set correct flags/names for the core currencies (creating any that don't
exist yet, updating the flag/name on any that do). Safe to re-run.

Usage:
    cd /path/to/app
    python3 scripts_set_currency_flags.py
"""
import sqlite3
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding="utf-8")

DB_PATH = "sql_app.db"

CURRENCIES = [
    # code, name_ar,          name_en,          symbol,  country,             flag, decimals
    ("LYD", "دينار ليبي",     "Libyan Dinar",    "د.ل",  "ليبيا",              "🇱🇾", 3),
    ("USD", "دولار أمريكي",   "US Dollar",       "$",    "الولايات المتحدة",   "🇺🇸", 2),
    ("EUR", "يورو",           "Euro",            "€",    "الاتحاد الأوروبي",   "🇪🇺", 2),
    ("TRY", "ليرة تركية",     "Turkish Lira",    "₺",    "تركيا",              "🇹🇷", 2),
    ("GBP", "جنيه إسترليني",  "British Pound",   "£",    "المملكة المتحدة",    "🇬🇧", 2),
    ("EGP", "جنيه مصري",      "Egyptian Pound",  "ج.م",  "مصر",                "🇪🇬", 2),
    ("TND", "دينار تونسي",    "Tunisian Dinar",  "د.ت",  "تونس",               "🇹🇳", 3),
]


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M")

    cur.execute("SELECT code FROM currencies")
    existing = {row[0] for row in cur.fetchall()}

    for code, name_ar, name_en, symbol, country, flag, decimals in CURRENCIES:
        if code in existing:
            cur.execute(
                "UPDATE currencies SET name_ar=?, name_en=?, symbol=?, country=?, flag=?, last_updated=? WHERE code=?",
                (name_ar, name_en, symbol, country, flag, now, code),
            )
            print(f"updated {code} -> {flag}")
        else:
            cur.execute(
                "INSERT INTO currencies (code, name_ar, name_en, symbol, country, flag, decimal_places, is_active, last_updated) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
                (code, name_ar, name_en, symbol, country, flag, decimals, now),
            )
            print(f"created {code} -> {flag}")

    conn.commit()
    conn.close()
    print("done")


if __name__ == "__main__":
    main()
