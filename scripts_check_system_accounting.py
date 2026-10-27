#!/usr/bin/env python3
"""Read-only follow-up to the wide accounting audit; Python standard library only.

python scripts_check_system_accounting.py --db /path/to/sql_app.db --json
Exit 0: no findings in covered checks; 1: observations/review candidates;
2: missing schema, invalid data or incomplete scan. Counts overlap and are
never estimates of financial loss. Does not import or start the application.
Requires the existing scripts_check_calculations.py in the same directory.
"""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import sys

from scripts_check_calculations import read_only_connection, money

PURCHASE = 'شراء المركبة/المعدة'
SALE = 'بيع المركبة/المعدة'
EPS = money('0.005')
TABLES = {
    'fleet_vehicles': 'id company purchase_price currency purchase_date sale_price sale_currency sale_date status sale_client_account_id',
    'fleet_accounts': 'id company currency is_active balance account_type account_number bank_name',
    'fleet_transactions': 'id vehicle_id account_id currency amount type category date timestamp balance_after',
    'fleet_damage_records': 'id vehicle_id currency cost',
    'bank_accounts': 'id currency balance customer_id',
    'bank_deposits': 'id bank_account_id currency amount interest_rate',
    'movements': 'id reference_id entity_type entity_id currency amount_in amount_out status timestamp',
    'transactions': 'id type status',
    'customer_account_entries': 'id currency bank_account_id type amount',
    'journal_entries': 'id reference lines',
    'exchange_rates': 'from_currency to_currency sell_rate',
    'shifts': 'id status requested_at start_time vault_id opening_balances',
}


def scan(con):
    """A consistent SQLite snapshot, with per-check coverage and explicit limits."""
    schema = {}
    for name, in con.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        if name in TABLES:
            schema[name] = {r[1] for r in con.execute('PRAGMA table_info("{}")'.format(name))}
    rows = {}
    for table, fields in TABLES.items():
        fields = [f for f in fields.split() if f in schema.get(table, set())]
        rows[table] = [dict(r) for r in con.execute('SELECT {} FROM "{}"'.format(','.join('"{}"'.format(f) for f in fields), table))] if fields else []
    checks = []

    def check(key, required, limitation, run):
        missing = [t+'.'+c for t, cols in required.items() for c in cols.split() if c not in schema.get(t, set())]
        item = dict(id=key, coverage='unavailable' if missing else 'covered', missing_schema=missing, limitation=limitation, findings=[])
        if not missing:
            run(item['findings'])
        item['count'] = len(item['findings'])
        checks.append(item)

    def add(out, id, reason, certainty='observed', **evidence):
        out.append(dict(id=id, reason=reason, certainty=certainty, evidence=evidence))

    vehicles = {r['id']: r for r in rows['fleet_vehicles']}
    accounts = {r['id']: r for r in rows['fleet_accounts']}
    banks = {r['id']: r for r in rows['bank_accounts']}
    by_vehicle, by_account = defaultdict(list), defaultdict(list)
    for t in rows['fleet_transactions']:
        by_vehicle[t['vehicle_id']].append(t)
        by_account[t.get('account_id')].append(t)

    def fleet_links(out):
        for t in rows['fleet_transactions']:
            v, a = vehicles.get(t['vehicle_id']), accounts.get(t['account_id'])
            if not v or (t['account_id'] and not a):
                add(out, t['id'], 'Missing referenced vehicle/account')
            elif a and a['company'] != v['company']:
                add(out, t['id'], 'Posting crosses company boundary', vehicle_company=v['company'], account_company=a['company'])
        for v in vehicles.values():
            a = accounts.get(v['sale_client_account_id'])
            if v['sale_client_account_id'] and (not a or a['company'] != v['company']):
                add(out, v['id'], 'Sale client account missing or belongs to another company')
    check('F1/F2.company_links', {'fleet_vehicles':'id company sale_client_account_id', 'fleet_accounts':'id company', 'fleet_transactions':'id vehicle_id account_id'}, 'Cross-company API reads leave no necessary database trace. Current account inactive status does not establish it was inactive at posting time.', fleet_links)

    def legacy_manual_identity(out):
        for a in accounts.values():
            if a['account_type'] == 'manual' and a['bank_name'] is None and by_account[a['id']]:
                add(out, a['id'], 'Legacy manual tracker has no separate bank identity', 'review')
    check('F12.manual_identity', {'fleet_accounts':'id account_type bank_name', 'fleet_transactions':'account_id'}, 'Exposure only: a legacy tracker may contain one bank or several. New identified trackers do not transfer or rewrite legacy balances.', legacy_manual_identity)

    def generated(out):
        for v in vehicles.values():
            for cat, amount, currency, date, kind in ((PURCHASE, v['purchase_price'], v['currency'], v['purchase_date'], 'expense'), (SALE, v['sale_price'], v['sale_currency'] or v['currency'], v['sale_date'], 'income')):
                ts = [t for t in by_vehicle[v['id']] if t['category'] == cat]
                expected = amount is not None and (cat == SALE or money(amount) > 0)
                if len(ts) != int(expected):
                    add(out, v['id'], 'Generated entry count disagrees with vehicle fields', category=cat, actual_count=len(ts), expected_count=int(expected))
                elif expected:
                    t = ts[0]
                    if money(t['amount']) != money(amount) or t['currency'] != currency or t['type'] != kind or (date and t['date'] != date):
                        add(out, v['id'], 'Generated purchase/sale metadata or amount mismatch', transaction=t['id'], category=cat)
    check('F3/F4/F7/F8/F10.generated', {'fleet_vehicles':'id purchase_price currency purchase_date sale_price sale_currency sale_date', 'fleet_transactions':'id vehicle_id category amount currency type date'}, 'Missing, duplicated and mismatched entries are observed inconsistencies; deleted history cannot establish who caused them. Reserved-category manual entries may resemble generated ones.', generated)

    def negative(out):
        for table, cols in [('fleet_vehicles',['purchase_price','sale_price']), ('fleet_transactions',['amount']), ('fleet_damage_records',['cost'])]:
            for r in rows[table]:
                for col in cols:
                    if r[col] is not None and money(r[col]) < 0:
                        add(out, r['id'], 'Negative amount', table=table, field=col, value=r[col])
    check('F9.negative', {'fleet_vehicles':'id purchase_price sale_price', 'fleet_transactions':'id amount', 'fleet_damage_records':'id cost'}, 'Does not infer whether negative legacy amounts were intentional corrections.', negative)

    def destinations(out):
        for t in rows['fleet_transactions']:
            a = accounts.get(t['account_id'])
            if not t['account_id']:
                add(out, t['id'], 'No tracked cash/bank destination', 'review')
            elif a and a['currency'] != t['currency']:
                add(out, t['id'], 'Account and transaction currencies differ')
    check('F5.destinations', {'fleet_transactions':'id account_id currency', 'fleet_accounts':'id currency'}, 'Legacy entries may intentionally have no tracked account. Presence of a record does not establish that money moved.', destinations)

    def balances(out):
        for aid, ts in by_account.items():
            a = accounts.get(aid)
            if not a or not ts:
                continue
            latest = max(ts, key=lambda t: (t['timestamp'] or '', t['id']))
            if latest['balance_after'] is not None and abs(money(latest['balance_after']) - money(a['balance'])) > EPS:
                add(out, aid, 'Last recorded balance differs from live account', 'review', last_transaction=latest['id'], recorded=latest['balance_after'], live=a['balance'])
    check('F6.balance_tail', {'fleet_accounts':'id balance', 'fleet_transactions':'id account_id timestamp balance_after'}, 'Stored snapshot review only: the application reconstructs displayed cash balances read-only. Same-minute legacy ordering may be ambiguous. Client accounts also have sale drawdowns without their own FleetTransaction; differences are review candidates, not proven losses.', balances)

    def bank_ccy(out):
        for m in rows['movements']:
            a = banks.get(m['entity_id']) if m['entity_type'] == 'bank_account' else None
            if a and a['currency'] != m['currency']:
                add(out, m['id'], 'Bank movement currency differs from account', reference=m['reference_id'])
        for e in rows['customer_account_entries']:
            a = banks.get(e['bank_account_id'])
            if a and a['currency'] != e['currency']:
                add(out, e['id'], 'Customer bank-funded entry currency differs from account')
    check('M2.bank_currency', {'bank_accounts':'id currency', 'movements':'id entity_type entity_id currency reference_id', 'customer_account_entries':'id bank_account_id currency'}, 'Direct bank operations that discarded the submitted currency cannot be detected after the original request is lost. Account currency may have been edited later.', bank_ccy)

    def reversed_deposits(out):
        for t in rows['transactions']:
            if t['type'] not in ('deposit','withdraw') or t['status'] != 'reversed':
                continue
            ms = [m for m in rows['movements'] if m['reference_id'] == t['id'] and m['entity_type'] == 'customer']
            per_ccy = defaultdict(lambda: money(0))
            for m in ms:
                per_ccy[(m['entity_id'],m['currency'])] += money(m['amount_in']) - money(m['amount_out'])
            if any(abs(n) > EPS for n in per_ccy.values()):
                add(out, t['id'], 'Reversed deposit/withdraw has unmatched customer movement', 'review')
    check('M1.customer_reversal', {'transactions':'id type status', 'movements':'id reference_id entity_type entity_id currency amount_in amount_out'}, 'Older dedicated reversals may lack counter-movements despite restoring balances. Review evidence; do not automatically debit customers.', reversed_deposits)

    def interest(out):
        for d in rows['bank_deposits']:
            prefix, once = 'int_'+d['id']+'_', 'int_once_'+d['id']
            ms = [m for m in rows['movements'] if m['entity_type']=='bank_account' and ((m['reference_id'] or '').startswith(prefix) or m['reference_id']==once)]
            paid = sum((money(m['amount_in']) - money(m['amount_out']) for m in ms), money(0))
            expected = money(d['amount']) * money(d['interest_rate']) / 100
            if paid > expected + EPS:
                add(out, d['id'], 'Recorded net interest exceeds current one-time contract', 'review', paid=str(paid), expected=str(expected), currency=d['currency'])
    check('M4.interest_repeat', {'bank_deposits':'id amount interest_rate currency', 'movements':'reference_id entity_type amount_in amount_out'}, 'Compares with current contract terms; past term edits/reversals require review. Counts do not measure recoverable cash.', interest)

    def missing_rates(out):
        rates = {r['from_currency'] for r in rows['exchange_rates'] if r['to_currency']=='LYD' and money(r['sell_rate']) > 0}
        used = set()
        for table, cols in [('fleet_vehicles',['currency','sale_currency']), ('fleet_transactions',['currency']), ('fleet_damage_records',['currency'])]:
            for r in rows[table]:
                used.update(r[c] for c in cols if r[c])
        for c in sorted(used - rates - {'LYD'}):
            add(out, c, 'No positive direct sell rate to LYD; fleet totals may use a 1:1 fallback')
    check('F11.missing_rate', {'exchange_rates':'from_currency to_currency sell_rate', 'fleet_vehicles':'currency sale_currency', 'fleet_transactions':'currency', 'fleet_damage_records':'currency'}, 'Checks current configuration, not the historical FX rate used at booking.', missing_rates)

    def shift_snapshots(out):
        for s in rows['shifts']:
            if s['status'] not in ('open','closed','approved'):
                continue
            start, requested = (s['start_time'] or '').replace('T',' '), (s['requested_at'] or '').replace('T',' ')
            if not start or not requested or start <= requested:
                continue
            ids = [m['id'] for m in rows['movements'] if m['entity_type']=='vault' and m['entity_id']==s['vault_id'] and requested < (m['timestamp'] or '').replace('T',' ') < start]
            if ids:
                add(out, s['id'], 'Vault activity while shift opening awaited approval', 'review', movement_count=len(ids))
    check('M5.shift_open', {'shifts':'id status requested_at start_time vault_id', 'movements':'id entity_type entity_id timestamp'}, 'Exposure only: no saved approval-time balance proves an overwrite. Minute-resolution timestamps miss activity within boundary minutes.', shift_snapshots)
    return checks


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',default=str(Path(__file__).resolve().parent/'sql_app.db'))
    parser.add_argument('--json',action='store_true')
    parser.add_argument('--all',action='store_true')
    args=parser.parse_args(argv)
    con=None
    try:
        con=read_only_connection(Path(args.db).resolve())
        checks=scan(con)
        code=2 if any(c['coverage']!='covered' for c in checks) else int(any(c['count'] for c in checks))
        report=dict(database=str(Path(args.db).resolve()),read_only=True,exit_code=code,checks=checks,
                    limits=['No production clearance from a zero count.', 'Cross-company reads, discarded request currencies and original account ownership may leave no detectable trace.', 'Direct balance edits, debt/commission policy and historical FX valuation remain separate reviews.'])
    except Exception as exc:
        report=dict(read_only=True,exit_code=2,error=str(exc)); code=2
    finally:
        if con is not None:
            con.close()
    if args.json:
        print(json.dumps(report,ensure_ascii=False,indent=2))
    elif 'error' in report:
        print('INCOMPLETE: '+report['error'])
    else:
        print('READ-ONLY accounting impact scan: '+report['database'])
        for c in checks:
            print('[{}] {}: {}'.format(c['coverage'],c['id'],c['count']))
            print('  LIMIT: '+c['limitation'])
            for finding in (c['findings'] if args.all else c['findings'][:10]):
                print('  '+json.dumps(finding,ensure_ascii=False))
            if c['missing_schema']:
                print('  MISSING: '+', '.join(c['missing_schema']))
        print('Exit {}. No records changed; findings overlap and require review.'.format(code))
    return code


if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
