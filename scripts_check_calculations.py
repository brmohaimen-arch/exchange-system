#!/usr/bin/env python3
"""Read-only accounting preflight. Python standard library only; never imports the app.

Usage (from the application directory):
  python scripts_check_calculations.py
  python scripts_check_calculations.py --db /path/to/sql_app.db --all
  python scripts_check_calculations.py --db /path/to/sql_app.db --json > calculation-check.json

Exit: 0=no observations/review candidates in covered checks; 1=findings;
2=incomplete coverage, invalid data, or failed scan. A zero is NOT an accounting certification.
No historical records are modified. Counts overlap across checks; never add them as losses.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import sqlite3
import sys

EPS = Decimal('0.005')
ZERO = Decimal(0)
TRADE_TYPES = {'buy', 'sell', 'exchange'}

class ScanError(Exception):
    pass

def money(value):
    try:
        result = Decimal(str(value if value is not None else 0))
    except (InvalidOperation, ValueError):
        raise ScanError('Invalid numeric value: {!r}'.format(value))
    if not result.is_finite():
        raise ScanError('Non-finite numeric value: {!r}'.format(value))
    return result

def unpack(row, column, kind):
    value = row.get(column)
    if value is None or value == '':
        return kind()
    try:
        parsed = json.loads(value, parse_float=Decimal) if isinstance(value, str) else value
    except (ValueError, TypeError):
        raise ScanError('Invalid JSON: record {} column {}'.format(row.get('id'), column))
    if not isinstance(parsed, kind):
        raise ScanError('Unexpected JSON type: record {} column {}'.format(row.get('id'), column))
    return parsed

def normalize_ts(value):
    return (value or '').replace('T', ' ').strip()

def live(row):
    return row.get('status') not in ('reversed', 'cancelled', 'rejected')

def is_reverse(m):
    return (m.get('type') or '').startswith(('عكس عملية', 'عكس قيد', 'إلغاء'))

def settlement(t):
    a, rate, fee = (money(t.get(k)) for k in ('amount', 'rate', 'commission'))
    if t['type'] == 'sell':
        return t['from_currency'], a * rate + fee, 'in'
    return t['to_currency'], a * rate - (fee if t['type'] == 'buy' else ZERO), 'out'

def read_only_connection(path):
    if not path.is_file():
        raise ScanError('Database does not exist: {}'.format(path))
    # as_uri escapes spaces, # and ? in paths. mode=ro never creates the DB.
    con = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA query_only=ON')
    allowed = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION,
               sqlite3.SQLITE_TRANSACTION, sqlite3.SQLITE_RECURSIVE}
    pragmas = {'table_info', 'foreign_key_check', 'quick_check'}
    def authorize(action, arg1, arg2, dbname, trigger):
        if action in allowed:
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_PRAGMA and (arg1 or '').lower() in pragmas:
            return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY
    con.set_authorizer(authorize)
    con.execute('BEGIN')  # one consistent read snapshot, including WAL; no immutable=1
    return con

class Audit:
    def __init__(self, con):
        self.con = con
        self.schema = {}
        for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            name = r[0]
            if name in TABLES:
                self.schema[name] = {x[1] for x in con.execute('PRAGMA table_info("{}")'.format(name))}
        self.rows = {}
        self.checks = []

    def table(self, name):
        if name not in self.rows:
            columns = [c for c in TABLES[name] if c in self.schema.get(name, set())]
            if name not in self.schema or not columns:
                self.rows[name] = []
            else:
                sql = 'SELECT {} FROM "{}"'.format(','.join('"{}"'.format(c) for c in columns), name)
                if name == 'audit_logs' and 'entity_type' in columns:
                    sql += " WHERE entity_type = 'InventoryCount'"
                self.rows[name] = [dict(r) for r in self.con.execute(sql)]
        return self.rows[name]

    def check(self, key, title, unit, requirements, limitation=''):
        missing = []
        for table, columns in requirements.items():
            if table not in self.schema:
                missing.append('table:' + table)
            else:
                missing.extend(table + '.' + c for c in columns if c not in self.schema[table])
        check = dict(id=key, title=title, unit=unit, coverage='unavailable' if missing else 'covered',
                     missing_schema=missing, limitation=limitation, scanned=0, findings={})
        self.checks.append(check)
        return check

    @staticmethod
    def add(check, record_id, certainty, reason, evidence, status=None):
        key = str(record_id)
        if key not in check['findings']:
            check['findings'][key] = dict(id=key, certainty=certainty, status=status, reasons=[], evidence=[])
        item = check['findings'][key]
        if certainty == 'observed':
            item['certainty'] = 'observed'
        item['reasons'].append(reason)
        item['evidence'].append(evidence)

    def run(self):
        txs = self.table('transactions')
        tx_by_id = {t['id']:t for t in txs}
        movements = self.table('movements')
        mv_by_ref = defaultdict(list)
        for m in movements:
            mv_by_ref[m.get('reference_id')].append(m)
        journals = self.table('journal_entries')
        jv_by_ref = defaultdict(list)
        for j in journals:
            jv_by_ref[j.get('reference')].append(j)
        banks = {b['id']:b for b in self.table('bank_accounts')}
        debts = self.table('debts')
        customers = {c['id']:c for c in self.table('customers')}
        trades = [t for t in txs if t.get('type') in TRADE_TYPES]
        trade_req = {'transactions':['id','type','amount','rate','commission','payment_method','status','timestamp','from_currency','to_currency']}
        mv_req = ['id','reference_id','entity_type','entity_id','currency','amount_in','amount_out','timestamp','type','status']

        # #6: DB records do not retain the original bankAccountId request payload.
        c = self.check('6', 'Bank-paid trade with no recorded bank leg', 'transaction',
                       dict(trade_req, movements=mv_req),
                       'Missing leg is observable; original missing request ID versus deleted/changed history cannot be distinguished.')
        if c['coverage'] == 'covered':
            for t in trades:
                if t['payment_method'] != 'bank_account': continue
                c['scanned'] += 1
                legs = [m for m in mv_by_ref[t['id']] if m['entity_type']=='bank_account']
                if not legs:
                    self.add(c,t['id'],'observed','No bank movement recorded for bank settlement',
                             {'timestamp':t['timestamp'],'settlement':settlement(t)},t['status'])

        c = self.check('8', 'Purchase commission produces a negative payout', 'transaction', trade_req,
                       'Only current transaction versions survive edits; prior negative journal/movement amounts are checked separately.')
        if c['coverage'] == 'covered':
            for t in trades:
                if t['type']!='buy': continue
                c['scanned'] += 1
                payout = settlement(t)[1]
                if payout < 0:
                    self.add(c,t['id'],'observed','Commission exceeds amount times rate',
                             {'payout':payout,'currency':t['to_currency'],'commission':money(t['commission'])},t['status'])

        bank_req = dict(trade_req, movements=mv_req, journal_entries=['id','reference'])
        c4 = self.check('4','Bank movement currency differs from trade settlement','transaction',bank_req,
                        'Edited versions sharing a reference/minute are review candidates; no historical account currency is inferred from its current value.')
        c5 = self.check('5','Exchange bank leg has wrong direction or amount','transaction',bank_req,
                        'Current-version selection is conservative; ambiguous edited histories require review.')
        if c4['coverage']==c5['coverage']=='covered':
            for t in trades:
                if t['payment_method']!='bank_account': continue
                c4['scanned'] += 1
                if t['type']=='exchange': c5['scanned'] += 1
                legs=[m for m in mv_by_ref[t['id']] if m['entity_type']=='bank_account' and not is_reverse(m) and live(m)]
                same=[m for m in legs if normalize_ts(m['timestamp'])==normalize_ts(t['timestamp'])]
                ambiguous=len(same)!=1
                candidates=same if same else legs
                currency, amount, direction = settlement(t)
                # An edit can retain a minute timestamp; even one leg may be an old version.
                edited=any((j.get('id') or '').startswith('JV-EDIT-') for j in jv_by_ref[t['id']]) or any(is_reverse(m) for m in mv_by_ref[t['id']])
                certainty='review' if ambiguous or edited else 'observed'
                for m in candidates:
                    ev={'movement_id':m['id'],'movement_currency':m['currency'],'expected_currency':currency,
                        'recorded_in':money(m['amount_in']),'recorded_out':money(m['amount_out']),
                        'expected_direction':direction,'expected_amount':amount,'version_ambiguous':ambiguous or edited}
                    if m['currency'] != currency:
                        self.add(c4,t['id'],certainty,'Bank leg uses a different currency',ev,t['status'])
                    expected_net=amount if direction=='in' else -amount
                    if t['type']=='exchange' and abs(money(m['amount_in'])-money(m['amount_out'])-expected_net)>EPS:
                        self.add(c5,t['id'],certainty,'Exchange bank leg differs from required settlement',ev,t['status'])

        dreq={'debts':['id','transaction_id','customer_id','currency','amount','remaining_amount','paid_amount','status'],
              'transactions':['id','type','payment_method','status'], 'customers':['id','balances']}
        c1=self.check('1','Open POS debt also represented in customer wallet: double-count candidates','debt',dreq,
                       'Wallet aggregates do not retain provenance. A linked debt is a candidate, not proof that its debit remains in the wallet.')
        c2=self.check('2','Purchase on credit represented as a customer debt','transaction',dreq,
                       'Payable/receivable policy remains undecided. This flags the purchase-on-credit population for review.')
        c3=self.check('3','POS debt with repayments requiring wallet/settlement reconciliation','debt',dreq,
                       'Debt payment records do not select a receiving cash/bank account. Current negative wallet alone cannot prove an uncleared historical payment.')
        if all(c['coverage']=='covered' for c in (c1,c2,c3)):
            for d in debts:
                t=tx_by_id.get(d['transaction_id'])
                if not t or t.get('payment_method')!='debt' or t.get('type') not in TRADE_TYPES: continue
                owner=customers.get(d['customer_id'])
                bal=money(unpack(owner,'balances',dict).get(d['currency'],0)) if owner else None
                ev={'transaction_id':t['id'],'transaction_status':t['status'],'currency':d['currency'],
                    'remaining':money(d['remaining_amount']),'paid':money(d['paid_amount']),'wallet_now':bal}
                for c in (c1,c2,c3): c['scanned'] += 1
                if live(t) and live(d) and d['status']!='paid' and money(d['remaining_amount'])>EPS:
                    self.add(c1,d['id'],'review','Outstanding POS-linked debt can be deducted again by customer reports',ev,d['status'])
                if t['type']=='buy':
                    self.add(c2,t['id'],'review','Business received currency and deferred its payment to customer',ev,t['status'])
                if money(d['paid_amount'])>EPS:
                    self.add(c3,d['id'],'review','POS-linked debt has repayments; reconcile wallet and receipt destination',ev,d['status'])

        c7=self.check('7','Journal base-currency imbalance','journal',{'journal_entries':['id','reference','status','lines']},
                       'Uses stored equivalentLYD for each debit/credit side. Does not add unlike currencies or interpret imbalance as cash loss. Missing/ambiguous valuations are review items.')
        tree_lines=0; no_account=0
        if c7['coverage']=='covered':
            for j in journals:
                c7['scanned'] += 1; delta=ZERO; incomplete=False; raw=defaultdict(lambda:{'debit':ZERO,'credit':ZERO})
                for l in unpack(j,'lines',list):
                    if not isinstance(l,dict): raise ScanError('Non-object journal line: '+j['id'])
                    tree_lines += 1
                    if not any(l.get(k) for k in ('accountId','account_id','accountCode','account_code')): no_account += 1
                    dr,cr=money(l.get('debit')),money(l.get('credit'))
                    ccy=l.get('currency') or '(unknown)'
                    raw[ccy]['debit'] += dr; raw[ccy]['credit'] += cr
                    if dr<0 or cr<0 or (dr and cr):
                        incomplete=True; continue
                    if not dr and not cr: continue
                    if 'equivalentLYD' not in l or l['equivalentLYD'] is None:
                        incomplete=True; continue
                    equivalent=money(l['equivalentLYD'])
                    if equivalent<=0:
                        incomplete=True; continue
                    delta += equivalent if dr else -equivalent
                if incomplete:
                    self.add(c7,j['id'],'review','Cannot fully evaluate base-currency balance',
                             {'reference':j['reference'],'per_currency_raw':dict(raw),'partial_delta_LYD':delta},j['status'])
                elif abs(delta)>EPS:
                    self.add(c7,j['id'],'observed','Stored LYD debits and credits do not balance',
                             {'reference':j['reference'],'debit_minus_credit_LYD':delta,'per_currency_raw':dict(raw)},j['status'])

        c9=self.check('9','Exchange transactions carrying commission: collection review','transaction',trade_req,
                       'The fee currency/collection policy is undecided. Fee-bearing exchange count is a review population, not confirmed missing cash.')
        c10=self.check('10','Fee-bearing trade with zero reported expected profit','transaction',dict(trade_req, transactions=trade_req['transactions']+['expected_profit']),
                        'A zero can also result from a spread loss offsetting a fee. Historical standing rates and collection evidence are required.')
        for c in (c9,c10):
            if c['coverage']!='covered': continue
            for t in trades:
                if money(t['commission'])<=0: continue
                c['scanned'] += 1
                if c is c9 and t['type']=='exchange':
                    self.add(c,t['id'],'review','Exchange has recorded commission',{'commission':money(t['commission']),'fee_currency':'not recorded in transaction schema'},t['status'])
                if c is c10 and t['type'] in ('buy','sell') and abs(money(t['expected_profit']))<=EPS:
                    self.add(c,t['id'],'review','Positive fee but zero expected profit',{'commission':money(t['commission']),'expected_profit':money(t['expected_profit'])},t['status'])

        c11=self.check('11','Nested reversals or inconsistent active trade journal versions','transaction',
                       {'transactions':['id','type','status'],'journal_entries':['id','reference','status']},
                       'Database cannot recover which unordered SELECT ran. Flags observable states; nested inverse entries can also be deliberate and need review.')
        if c11['coverage']=='covered':
            for t in trades:
                c11['scanned'] += 1; js=jv_by_ref[t['id']]
                originals=[j['id'] for j in js if not j['id'].startswith('REV-') and j['status']=='approved']
                nested=[j['id'] for j in js if j['id'].startswith('REV-REV-')]
                if nested or len(originals)>1 or (t['status']=='reversed' and originals):
                    self.add(c11,t['id'],'review','Journal version/reversal history requires reconciliation',
                             {'nested_reversal_ids':nested,'approved_original_ids':originals},t['status'])

        ireq={'inventory_counts':['id','vault_id','currency','timestamp','status','system_balance','actual_balance','difference'],
              'audit_logs':['entity_id','entity_type','description','created_at'], 'movements':mv_req,
              'journal_entries':['reference','id']}
        c12=self.check('12','Approved inventory discrepancies, repeated approvals and intervening movements','inventory_count',ireq,
                       'Approved nonzero counts are exposure candidates. Missing close-time snapshots or minute timestamps prevent quantifying overwritten cash. Repeated approval logs prove repeated calls, not loss.')
        c12http=self.check('12.http500','Inventory submission HTTP 500 failures','request',{},
                           'Not measurable from the business database: failed submissions usually leave no row. Count HTTP requests from server logs separately; do not equate requests with distinct operations.')
        c12http['coverage']='not_measurable'
        if c12['coverage']=='covered':
            approvals=defaultdict(list)
            for a in self.table('audit_logs'):
                if 'اعتماد' in (a.get('description') or ''):
                    approvals[a.get('entity_id')].append(a)
            by_entity=defaultdict(list)
            for m in movements: by_entity[m.get('entity_id')].append(m)
            for i in self.table('inventory_counts'):
                if i['status']!='approved': continue
                c12['scanned'] += 1
                al=approvals[i['id']]; after_count=[]
                approved_ts=sorted(normalize_ts(a.get('created_at')) for a in al if a.get('created_at'))
                for m in by_entity[i['vault_id']]:
                    ts=normalize_ts(m.get('timestamp'))
                    if m['currency']==i['currency'] and ts>normalize_ts(i['timestamp']) and approved_ts and ts<approved_ts[0][:16]:
                        after_count.append(m['id'])
                ev={'currency':i['currency'],'system':money(i['system_balance']),'actual':money(i['actual_balance']),
                    'recorded_difference':money(i['difference']),'approval_log_count':len(al),
                    'movements_strictly_between_count_and_first_approval':after_count,
                    'direct_movement_reference_found':bool(mv_by_ref[i['id']]),'direct_journal_reference_found':bool(jv_by_ref[i['id']])}
                if abs(money(i['difference']))>EPS or len(al)>1 or after_count:
                    self.add(c12,i['id'],'review','Inventory approval could replace a live balance or was repeated',ev,i['status'])
                if abs(money(i['actual_balance'])-money(i['system_balance'])-money(i['difference']))>EPS:
                    self.add(c12,i['id'],'observed','Recorded inventory difference fails its own equation',ev,i['status'])

        c13=self.check('13','Closed shift currencies absent from recorded differences','shift',
                       {'shifts':['id','status','expected_balances','actual_balances','differences']},
                       'Close used a live vault balance, not necessarily stored expected_balances. Extra/missing currencies are candidates unless a close-time snapshot exists.')
        if c13['coverage']=='covered':
            for s in self.table('shifts'):
                if s['status'] not in ('closed','approved'): continue
                c13['scanned'] += 1
                expected=unpack(s,'expected_balances',dict); actual=unpack(s,'actual_balances',dict); diffs=unpack(s,'differences',dict)
                omitted={ccy:{'expected_snapshot':money(expected.get(ccy)),'actual':money(actual.get(ccy))}
                         for ccy in set(expected)|set(actual) if ccy not in diffs and abs(money(actual.get(ccy))-money(expected.get(ccy)))>EPS}
                if omitted:
                    self.add(c13,s['id'],'review','Nonzero union-currency difference not recorded',omitted,s['status'])

        c14=self.check('14','Fleet records lacking a current direct LYD valuation rate','fleet_record',
                       {'exchange_rates':['from_currency','to_currency'],'fleet_transactions':['id','currency','amount'],
                        'fleet_vehicles':['id','currency','purchase_price','sale_currency','sale_price'],
                        'fleet_damage_records':['id','currency','cost']},
                       'Current rate availability only; historical missing rates and exact valuation loss cannot be reconstructed.')
        if c14['coverage']=='covered':
            known={'LYD'}|{r['from_currency'] for r in self.table('exchange_rates') if r['to_currency']=='LYD'}
            for table,fields in [('fleet_transactions',[('currency','amount')]),('fleet_damage_records',[('currency','cost')]),('fleet_vehicles',[('currency','purchase_price'),('sale_currency','sale_price')])]:
                for r in self.table(table):
                    c14['scanned'] += 1
                    for ccy_col,amt_col in fields:
                        ccy=r.get(ccy_col) or r.get('currency')
                        if money(r.get(amt_col)) and ccy not in known:
                            self.add(c14,table+':'+str(r['id']),'review','Currency has no direct current LYD rate',{'currency':ccy,'amount':money(r.get(amt_col)),'field':amt_col})

        mix=self.check('G.mixed_debt','Open foreign-currency debt used in raw debt totals/limits','debt',
                        {'debts':['id','currency','remaining_amount','status']},
                        'Counts foreign-currency records; totals are grouped per currency, never converted with invented rates. Does not prove a historical limit was breached.')
        if mix['coverage']=='covered':
            for d in debts:
                if live(d) and d['status']!='paid' and money(d['remaining_amount'])>EPS:
                    mix['scanned'] += 1
                    if d['currency']!='LYD': self.add(mix,d['id'],'review','Foreign-currency open debt in mixed-currency aggregate population',{'currency':d['currency'],'remaining':money(d['remaining_amount'])},d['status'])

        tree=self.check('G.tree','Journal lines without stable account identifiers','journal',{'journal_entries':['id','lines']},
                         'Measures stored line linkage; does not prescribe or migrate a chart of accounts.')
        if tree['coverage']=='covered':
            for j in journals:
                tree['scanned'] += 1
                ls=unpack(j,'lines',list)
                count=sum(not any(l.get(k) for k in ('accountId','account_id','accountCode','account_code')) for l in ls if isinstance(l,dict))
                if count: self.add(tree,j['id'],'observed','Journal contains account names without stable identifiers',{'lines_without_account_id':count},j.get('status'))

        integrity=self.check('G.integrity','Broken SQLite foreign-key references','foreign_key_violation',{})
        violations=list(self.con.execute('PRAGMA foreign_key_check'))
        integrity['scanned']=self.con.execute("SELECT count(*) FROM sqlite_master WHERE type='table'").fetchone()[0]
        for table,rowid,parent,fkid in violations:
            self.add(integrity,'{}:{}:{}'.format(table,rowid,fkid),'observed','Missing referenced parent',{'table':table,'rowid':rowid,'parent_table':parent,'foreign_key_index':fkid})
        quick=[r[0] for r in self.con.execute('PRAGMA quick_check')]
        if quick!=['ok']: raise ScanError('SQLite quick_check: '+repr(quick))
        results=[]
        for c in self.checks:
            items=sorted(c.pop('findings').values(),key=lambda x:x['id'])
            c['counts']={'observed':sum(x['certainty']=='observed' for x in items),'review':sum(x['certainty']=='review' for x in items),'unique_records':len(items)}
            c['by_status']=dict(Counter(x.get('status') or '(unspecified)' for x in items))
            c['findings']=items; results.append(c)
        return results,dict(quick_check=quick,stored_journal_lines=tree_lines,lines_without_account_ids=no_account)

# Whitelisted names/columns only. No settings, passwords, tokens, phone numbers or notes loaded.
TABLES={
 'transactions':'id type amount rate commission total_amount payment_method status timestamp from_currency to_currency customer_id expected_profit'.split(),
 'movements':'id reference_id entity_type entity_id currency amount_in amount_out timestamp type status balance_before balance_after'.split(),
 'journal_entries':'id reference status date lines'.split(),
 'bank_accounts':'id currency balance customer_id'.split(),
 'debts':'id transaction_id customer_id currency amount remaining_amount paid_amount status'.split(),
 'customers':'id balances'.split(),
 'inventory_counts':'id vault_id currency timestamp status system_balance actual_balance difference'.split(),
 'audit_logs':'id entity_id entity_type description created_at'.split(),
 'shifts':'id status expected_balances actual_balances differences'.split(),
 'exchange_rates':'from_currency to_currency'.split(),
 'fleet_transactions':'id currency amount'.split(),
 'fleet_vehicles':'id currency purchase_price sale_currency sale_price'.split(),
 'fleet_damage_records':'id currency cost'.split(),
}

def serialize(value):
    if isinstance(value,Decimal): return format(value,'f')
    raise TypeError(type(value).__name__)

def build_report(path):
    con=read_only_connection(path)
    try:
        audit=Audit(con); checks,metadata=audit.run()
        unavailable=[c['id'] for c in checks if c['coverage']=='unavailable']
        total=sum(c['counts']['unique_records'] for c in checks)
        return dict(version=1,database=str(path),generated_utc=datetime.now(timezone.utc).isoformat(),
                    read_only=True,metadata=metadata,
                    count_warning='Counts overlap across checks; observations are not proven losses. Review candidates need source records. Current transaction rows cannot recover deleted or superseded versions.',
                    unavailable_checks=unavailable,checks=checks,exit_code=2 if unavailable else 1 if total else 0)
    finally:
        con.rollback(); con.close()

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--db',type=Path,default=Path(__file__).resolve().parent/'sql_app.db')
    parser.add_argument('--json',action='store_true',help='Machine-readable full report to stdout; no file written by this script')
    parser.add_argument('--all',action='store_true',help='Show all record details in text mode')
    parser.add_argument('--limit',type=int,default=10,help='Details per check; counts always include all scanned records')
    args=parser.parse_args(argv)
    if args.limit<0: parser.error('--limit must be zero or greater')
    try:
        report=build_report(args.db.expanduser().resolve())
    except (ScanError,sqlite3.Error,OSError,ValueError,TypeError,KeyError) as exc:
        error={'exit_code':2,'read_only':True,'scan_complete':False,'error':str(exc)}
        print(json.dumps(error,ensure_ascii=False) if args.json else 'INCOMPLETE SCAN: '+str(exc))
        return 2
    if args.json:
        print(json.dumps(report,ensure_ascii=False,indent=2,default=serialize))
    else:
        print('READ-ONLY calculation preflight: '+report['database'])
        print('observed = persisted inconsistency / review = candidate, NOT proven loss')
        print('Counts overlap; currencies are never added together as a loss estimate.\n')
        for c in report['checks']:
            counts=c['counts']
            print('[{}] #{} {} | scanned={} {} | observed={} review={}'.format(c['coverage'],c['id'],c['title'],c['scanned'],c['unit'],counts['observed'],counts['review']))
            if c['missing_schema']: print('  MISSING: '+', '.join(c['missing_schema']))
            if c['limitation']: print('  LIMIT: '+c['limitation'])
            if c['by_status']: print('  STATUS: '+json.dumps(c['by_status'],ensure_ascii=False,sort_keys=True))
            items=c['findings'] if args.all else c['findings'][:args.limit]
            for item in items:
                print('  '+json.dumps(item,ensure_ascii=False,default=serialize,sort_keys=True))
            remaining=counts['unique_records']-len(items)
            if remaining: print('  ... {} more; use --all or --json'.format(remaining))
        print('\nExit {}. Database unchanged. HTTP 500 failures require server logs. No accounting clearance is implied.'.format(report['exit_code']))
    return report['exit_code']

if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
