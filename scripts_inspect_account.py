#!/usr/bin/env python3
"""READ-ONLY: shows one vault / bank account's movement chain so a "manual adjustment (unrecorded)" line on its
daily ledger can be explained. Standard library only (works on the server's old system python3); opens the
database read-only and never writes.

  python3 scripts_inspect_account.py --find "الداكشي"                 # list the accounts that match
  python3 scripts_inspect_account.py --id ba_cust_xxx --currency LYD    # the whole chain, gaps marked
  python3 scripts_inspect_account.py --id ba_cust_xxx --currency LYD --from 2026-10-01 --to 2026-10-27

Every movement is printed in chain order with its balance before/after. Movements the statements hide
(reversed / belonging to a cancelled operation) are marked [HIDDEN]. Wherever one row's "before" is not the previous
row's "after", a GAP line is printed with the amount, the net of the hidden movements in that stretch and, if the
account's own audit log has entries, what they say. A gap that no hidden movement explains is a balance that was
changed by hand without a movement (for example by editing the account's balance on the banks page).
"""
import argparse
import sqlite3
import sys
from pathlib import Path

EPS = 0.005


def connect(path):
    if not path.is_file():
        raise SystemExit('database not found: {}'.format(path))
    con = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA query_only=ON')
    ok, deny = 0, 1
    allowed = {21, 20, 31, 22, 33}   # SELECT, READ, FUNCTION, TRANSACTION, RECURSIVE (fixed SQLite numbers)

    def authorize(action, arg1, arg2, dbname, trigger):
        return ok if action in allowed or (action == 19 and (arg1 or '').lower() == 'table_info') else deny
    con.set_authorizer(authorize)
    return con


def money(x):
    return '{:,.2f}'.format(x or 0.0)


def find(con, text):
    t = '%' + text.lower() + '%'
    print('Bank accounts:')
    rows = con.execute("SELECT id, bank_name, account_name, account_number, currency, balance, customer_id FROM bank_accounts "
                       "WHERE lower(id||' '||bank_name||' '||account_name||' '||account_number||' '||ifnull(customer_id,'')) LIKE ?", (t,)).fetchall()
    for r in rows:
        print('  {} | {} - {} | no. {} | {} | balance {} | customer {}'.format(r['id'], r['bank_name'], r['account_name'], r['account_number'], r['currency'], money(r['balance']), r['customer_id'] or '-'))
    if not rows:
        print('  (none)')
    print('Vaults:')
    rows = con.execute("SELECT id, name FROM vaults WHERE lower(id||' '||name) LIKE ?", (t,)).fetchall()
    for r in rows:
        print('  {} | {}'.format(r['id'], r['name']))
    if not rows:
        print('  (none)')


def hidden_references(con):
    """The same rule the statements use: a reversed transaction, or a reference whose journal entry was reversed
    (unless it is a live transaction / approved transfer)."""
    rev_tx = {r[0] for r in con.execute("SELECT id FROM transactions WHERE status='reversed'")}
    live = {r[0] for r in con.execute("SELECT id FROM transactions WHERE status!='reversed'")} | {r[0] for r in con.execute("SELECT id FROM transfers WHERE status='approved'")}
    rev_jv = {r[0] for r in con.execute("SELECT reference FROM journal_entries WHERE status='reversed'")} - live
    return rev_tx | rev_jv


def chain_order(rows):
    """Time order; movements of the same minute follow the balance chain (as the statements do)."""
    rows = sorted(rows, key=lambda r: r['timestamp'])
    out, i = [], 0
    while i < len(rows):
        j = i
        while j < len(rows) and rows[j]['timestamp'] == rows[i]['timestamp']:
            j += 1
        group = list(rows[i:j])
        while group:
            anchor = out[-1]['balance_after'] if out else None
            pick = None
            if anchor is not None:
                pick = next((m for m in group if abs(m['balance_before'] - anchor) < EPS), None)
            else:
                pick = next((m for m in group if not any(o is not m and abs(m['balance_before'] - o['balance_after']) < EPS for o in group)), None)
            pick = pick or group[0]
            group.remove(pick)
            out.append(pick)
        i = j
    return out


def explain(gap, new_hidden, open_hidden):
    """Same matching the daily ledger uses: a gap is the amounts of hidden movements that appeared in this stretch
    plus the later reversal (-amount) of hidden ones seen earlier. Returns (opened indexes, closed indexes) or None."""
    items = [(n, 'new', i) for i, n in enumerate(new_hidden)] + [(-n, 'open', i) for i, n in enumerate(open_hidden)]
    if not items or len(items) > 14:
        return None
    best = None
    for mask in range(1, 1 << len(items)):
        total = sum(items[i][0] for i in range(len(items)) if mask >> i & 1)
        if abs(total - gap) < EPS and (best is None or bin(mask).count('1') < best[0]):
            best = (bin(mask).count('1'), mask)
    if best is None:
        return None
    chosen = [items[i] for i in range(len(items)) if best[1] >> i & 1]
    return [i for _, k, i in chosen if k == 'new'], [i for _, k, i in chosen if k == 'open']


def inspect(con, entity_id, currency, date_from, date_to):
    acct = con.execute('SELECT * FROM bank_accounts WHERE id=?', (entity_id,)).fetchone()
    kind = 'bank_account'
    if acct:
        name = '{} - {} (no. {})'.format(acct['bank_name'], acct['account_name'], acct['account_number'])
        currency = currency or acct['currency']
        current = acct['balance']
    else:
        v = con.execute('SELECT * FROM vaults WHERE id=?', (entity_id,)).fetchone()
        if not v:
            raise SystemExit('no bank account or vault with id {}'.format(entity_id))
        kind, name = 'vault', v['name']
        import json
        current = json.loads(v['balances'] or '{}').get(currency or 'LYD', 0.0)
        currency = currency or 'LYD'
    print('{}: {} | {} | current balance {} {}'.format(kind, name, entity_id, money(current), currency))

    hidden_refs = hidden_references(con)
    rows = con.execute("SELECT * FROM movements WHERE entity_type=? AND entity_id=? AND currency=?", (kind, entity_id, currency)).fetchall()
    rows = chain_order(rows)

    def is_hidden(m):
        return m['status'] == 'reversed' or m['reference_id'] in hidden_refs

    logs = con.execute("SELECT created_at, action, description FROM audit_logs WHERE entity_id=? ORDER BY id", (entity_id,)).fetchall()
    print('audit log entries for this account: {}'.format(len(logs)))
    for l in logs[-15:]:
        print('   {} | {} | {}'.format(l['created_at'], l['action'], l['description']))
    print('')
    print('chain (H = hidden from the statements, GAP = recorded balances do not join up):')

    prev_after, total_gap, unexplained = None, 0.0, 0.0
    stretch = []        # hidden movements since the last shown row (net amounts)
    open_hidden = []    # hidden movements whose amount is still inside the recorded balances
    for m in rows:
        ts = m['timestamp']
        in_range = (not date_from or ts[:10] >= date_from) and (not date_to or ts[:10] <= date_to)
        if not is_hidden(m):
            if prev_after is None and stretch and abs(m['balance_before']) > EPS:
                # the first shown row starts at a balance that cancelled movements before it still contain
                found = explain(m['balance_before'], stretch, [])
                if found:
                    open_hidden = [stretch[i] for i in found[0]]
                    if in_range:
                        print('   ***** OPENING {:>14} at {} | EXPLAINED by hidden movement(s) before the first row ({}) - the real opening is 0'.format(
                            money(m['balance_before']), ts, ', '.join(money(n) for n in open_hidden)))
                else:
                    if in_range:
                        print('   ***** OPENING {:>14} at {} | first row starts from a balance no hidden movement explains (an opening balance)'.format(money(m['balance_before']), ts))
            if prev_after is not None and abs(m['balance_before'] - prev_after) > EPS:
                gap = m['balance_before'] - prev_after
                total_gap += gap
                found = explain(gap, stretch, open_hidden)
                if found:
                    opened, closed = found
                    parts = []
                    if opened:
                        parts.append('the hidden movement(s) of this stretch ({})'.format(', '.join(money(stretch[i]) for i in opened)))
                    if closed:
                        parts.append("the later reversal of earlier hidden movement(s) ({})".format(', '.join(money(open_hidden[i]) for i in closed)))
                    note = 'EXPLAINED by ' + ' and '.join(parts)
                    open_hidden = [n for i, n in enumerate(open_hidden) if i not in closed] + [stretch[i] for i in opened]
                else:
                    unexplained += gap
                    note = 'NOT EXPLAINED by any hidden movement: a balance changed without a movement (e.g. the balance edited on the banks page)'
                if in_range:
                    print('   ***** GAP {:>16} before {} | {}'.format(money(gap), ts, note))
            stretch = []
            prev_after = m['balance_after']
        else:
            stretch.append((m['amount_in'] or 0.0) - (m['amount_out'] or 0.0))
        if in_range:
            print('   {} {} | {:<34} | in {:>14} out {:>14} | before {:>14} after {:>14} | {} | ref {} | {}'.format(
                'H' if is_hidden(m) else ' ', ts, (m['type'] or '')[:34], money(m['amount_in']), money(m['amount_out']),
                money(m['balance_before']), money(m['balance_after']), m['status'], m['reference_id'], m['user'] or ''))
    print('')
    print('movements: {} | sum of gaps: {} | of which NOT explained by hidden movements: {} | last recorded balance: {} | account balance now: {}'.format(
        len(rows), money(total_gap), money(unexplained), money(rows[-1]['balance_after']) if rows else '-', money(current)))
    if rows and abs(rows[-1]['balance_after'] - current) > EPS:
        print('NOTE: the account balance now differs from the last recorded movement balance by {} - a change after the last movement.'.format(money(current - rows[-1]['balance_after'])))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--db', type=Path, default=Path(__file__).resolve().parent / 'sql_app.db')
    p.add_argument('--find', help='text to search in account/vault names, numbers and ids')
    p.add_argument('--id', help='bank account id or vault id')
    p.add_argument('--currency', default='')
    p.add_argument('--from', dest='date_from', default='')
    p.add_argument('--to', dest='date_to', default='')
    a = p.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    con = connect(a.db.expanduser().resolve())
    try:
        if a.find:
            find(con, a.find)
        elif a.id:
            inspect(con, a.id, a.currency, a.date_from, a.date_to)
        else:
            p.error('give --find TEXT or --id ID')
    finally:
        con.close()


if __name__ == '__main__':
    main()
