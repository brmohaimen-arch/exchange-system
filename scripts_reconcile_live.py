#!/usr/bin/env python3
"""Focused READ-ONLY production reconciliation and feature usage census.

Run beside scripts_check_calculations.py:
  python scripts_reconcile_live.py --db /path/to/sql_app.db
  python scripts_reconcile_live.py --json > live-reconciliation.json
  python scripts_reconcile_live.py --summary
  python scripts_reconcile_live.py --all --json > full-reconciliation.json

No app imports, migrations, network calls or financial writes. Exit 0 means
the requested report completed, NOT that all balances are correct. Exit 2
means missing targets/schema, invalid data, or incomplete coverage.
"""
import argparse
from copy import deepcopy
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import re
import sys

from scripts_check_calculations import read_only_connection, money, unpack, ScanError

DEPOSITS = ('cae_deposit_1792696917422_483ff5', 'cae_deposit_1792696974842_9beae3')
ACCOUNTS = ('fleetacc_1791210418203_905c1e', 'fleetacc_1791755514717_625178', 'fleetacc_1791755603343_6bab62')
EPS = Decimal('0.005')
PURCHASE, SALE = 'شراء المركبة/المعدة', 'بيع المركبة/المعدة'
# A data whitelist: no users, credentials, settings, contact fields or audit
# old/new payloads. Dedicated bank-number fields are masked; relevant audit
# descriptions are retained as evidence and may contain business details.
TABLES = {
    'transactions': 'id type customer_id customer_name vault_id from_currency to_currency amount commission payment_method status timestamp',
    'customer_account_entries': 'id type customer_id customer_name currency amount vault_id bank_account_id balance_before balance_after timestamp user',
    'customers': 'id name balances',
    'vaults': 'id name balances',
    'bank_accounts': 'id account_name currency balance customer_id',
    'movements': 'id timestamp entity_type entity_id currency type amount_in amount_out balance_before balance_after reference_id status user',
    'journal_entries': 'id reference date tx_type status user lines',
    'audit_logs': 'id entity_type entity_id action username created_at description',
    'fleet_accounts': 'id company name currency account_type bank_name account_number balance is_active',
    'fleet_transactions': 'id vehicle_id account_id type category currency amount date timestamp balance_after created_by',
    'fleet_vehicles': 'id company name currency purchase_price sale_price sale_currency sale_date sale_client_account_id purchase_bank_details sale_bank_details',
    'fleet_damage_records': 'id vehicle_id currency cost',
    'bank_deposits': 'id currency amount interest_rate accrued_interest status',
    'fixed_assets': 'id currency status purchase_price current_value',
    'depreciation_records': 'asset_id accumulated_depreciation current_book_value',
    'vehicles': 'id', 'real_estates': 'id', 'maintenance_records': 'id',
}


def number(value):
    if value is None:
        raise ScanError('Missing monetary value; cannot infer zero')
    return money(value)


def stamped(row):
    match = re.search(r'_(\d{13})_[0-9a-f]{6}$', str(row['id']))
    return ((row.get('timestamp') or '').replace('T', ' '), int(match.group(1)) if match else 0, str(row['id']))


def ledger_order(row):
    return (row.get('date') or '',) + stamped(row)


def signed(row):
    if row['type'] not in ('income','expense'):
        raise ScanError('Unknown fleet entry type: '+str(row['type']))
    return number(row['amount']) * (1 if row['type'] == 'income' else -1)


def masked(value):
    return '****' + value[-4:] if value else None


def capped(rows, limit):
    return dict(total=len(rows), shown=len(rows if limit is None else rows[:limit]),
                truncated=limit is not None and len(rows) > limit,
                rows=rows if limit is None else rows[:limit])


class Snapshot:
    def __init__(self, con):
        self.con, self.schema, self.cache = con, {}, {}
        for name, in con.execute("SELECT name FROM sqlite_master WHERE type='table'"):
            if name in TABLES:
                self.schema[name] = {r[1] for r in con.execute('PRAGMA table_info("{}")'.format(name))}

    def require(self, **tables):
        missing = [t+'.'+c for t, cols in tables.items() for c in cols.split() if c not in self.schema.get(t, set())]
        if missing:
            raise ScanError('Missing schema: ' + ', '.join(missing))

    def rows(self, table):
        if table not in self.cache:
            fields = [c for c in TABLES[table].split() if c in self.schema.get(table, set())]
            self.cache[table] = [dict(r) for r in self.con.execute('SELECT {} FROM "{}"'.format(','.join('"{}"'.format(c) for c in fields), table))] if fields else []
        return self.cache[table]

    def find(self, table, id, key='id'):
        return next((r for r in self.rows(table) if r.get(key) == id), None)


def section(fn):
    try:
        return dict(coverage='covered', data=fn())
    except (ScanError, KeyError, TypeError, ValueError) as exc:
        return dict(coverage='unavailable', error=str(exc))


def audits(db, pairs, limit):
    if not {'entity_type','entity_id','created_at','action','description'}.issubset(db.schema.get('audit_logs', set())):
        return dict(coverage='unavailable', reason='Audit schema is absent/incomplete')
    rows = [a for a in db.rows('audit_logs') if (a['entity_type'], a['entity_id']) in pairs]
    rows.sort(key=lambda a: (a['created_at'] or '', str(a.get('id'))), reverse=True)
    return dict(coverage='covered', **capped(rows, limit))


def movement_view(row):
    fields = 'id timestamp reference_id type status user amount_in amount_out balance_before balance_after'.split()
    view = {k:row.get(k) for k in fields}
    for k in ('amount_in','amount_out','balance_before','balance_after'):
        view[k] = number(row[k])
    return view


def live_balance(db, entity_type, id, currency):
    table = {'customer':'customers', 'vault':'vaults', 'bank_account':'bank_accounts'}.get(entity_type)
    if table is None:
        raise ScanError('Unsupported entity: ' + str(entity_type))
    db.require(**{table:'id balance currency' if entity_type=='bank_account' else 'id balances'})
    row = db.find(table, id)
    if row is None:
        raise ScanError('Missing entity: {} {}'.format(entity_type, id))
    value = number(row['balance']) if entity_type=='bank_account' else number(unpack(row,'balances',dict).get(currency,0))
    return value, row.get('name') or row.get('account_name') or id, row.get('currency')


def chain(db, ref, group, limit):
    kind, id, currency = group
    rows = sorted([r for r in db.rows('movements') if (r['entity_type'],r['entity_id'],r['currency'])==group], key=stamped)
    indices = [i for i,r in enumerate(rows) if r['reference_id']==ref]
    own = [rows[i] for i in indices]
    net = sum((number(r['amount_in'])-number(r['amount_out']) for r in own), Decimal(0))
    live, label, account_currency = live_balance(db,kind,id,currency)
    wanted = set(j for i in indices for j in range(max(0,i-1),min(len(rows),i+2)))
    near = [movement_view(r) for i,r in enumerate(rows) if i in wanted]
    matches, arithmetic = [], []
    for i,r in enumerate(rows):
        if abs(number(r['balance_after'])-number(r['balance_before'])-number(r['amount_in'])+number(r['amount_out']))>EPS:
            arithmetic.append(r['id'])
        if i and i>min(indices):
            jump=number(r['balance_before'])-number(rows[i-1]['balance_after'])
            if abs(net)>EPS and abs(jump+net)<=EPS:
                matches.append(dict(previous=rows[i-1]['id'], next=r['id'], jump=jump))
    tail_delta=live-number(rows[-1]['balance_after'])
    time_counts=Counter(r.get('timestamp') for r in rows)
    ambiguous=any(time_counts[r.get('timestamp')]>1 and not re.search(r'_\d{13}_[0-9a-f]{6}$',str(r['id'])) for r in rows)
    has_counter=any((r.get('type') or '').startswith('عكس') or r['id'].startswith('m_rev_') for r in own)
    legacy_hint=abs(net)>EPS and (matches or abs(tail_delta+net)<=EPS)
    return dict(entity_type=kind,entity_id=id,label=label,currency=currency,live_balance=live,
                current_bank_currency=account_currency,reference_net=net,counter_movement_present=has_counter,
                last_snapshot_to_live_delta=tail_delta,matching_undo_gap_candidates=capped(matches,limit),
                arithmetic_error_ids=capped(arithmetic,limit),legacy_same_minute_order_ambiguous=ambiguous,
                neighbouring_movements=capped(near,limit),
                interpretation=('Recorded effects net to zero' if abs(net)<=EPS else
                    'Balance discontinuity is consistent with an unrecorded undo; not proof' if legacy_hint else
                    'No conclusive recorded undo; inspect audit history and independent balance evidence'))


def deposit_case(db, id, limit):
    db.require(transactions='id type status customer_id amount from_currency timestamp',
               customer_account_entries='id customer_id currency amount balance_before balance_after',
               movements='id timestamp reference_id entity_type entity_id currency type status amount_in amount_out balance_before balance_after',
               journal_entries='id reference status date tx_type lines')
    tx, entry = db.find('transactions',id), db.find('customer_account_entries',id)
    if tx is None and entry is None:
        raise ScanError('Target deposit not found: '+id)
    for row in (tx,entry):
        if row:
            number(row['amount'])
    movements=[m for m in db.rows('movements') if m['reference_id']==id]
    groups=sorted({(m['entity_type'],m['entity_id'],m['currency']) for m in movements})
    journals=[dict(j,lines=unpack(j,'lines',list)) for j in db.rows('journal_entries') if j['reference']==id]
    pairs={(t,id) for t in ('Transaction','CustomerAccountEntry','Movement')}
    pairs.update(('JournalEntry',j['id']) for j in journals)
    return dict(reference=id,transaction=tx,customer_entry=entry,
                recorded_movement_count=len(movements),legs=[chain(db,id,g,limit) for g in groups],journals=journals,
                audit_history=audits(db,pairs,limit),
                limitations=['Movement status hides rows from statements but does not establish whether cash was returned.',
                             'Matching balance gaps suggest a legacy undo; direct edits or other missing events can resemble it.',
                             'No proposed automatic balance correction.'])


def bank_hint(details):
    bank=re.search(r'(?:^|—)\s*البنك\s*:\s*(.*?)(?:—|$)',details or '')
    number_match=re.search(r'(?:^|—)\s*رقم الحساب\s*:\s*(.*?)(?:—|$)',details or '')
    if not bank:
        return None
    return (' '.join(bank.group(1).split()).casefold(),number_match.group(1).strip() if number_match else '')


def fleet_case(db, id, limit):
    db.require(fleet_accounts='id company name currency account_type bank_name account_number balance',
               fleet_transactions='id vehicle_id account_id type category currency amount date timestamp balance_after',
               fleet_vehicles='id company name currency sale_currency sale_price sale_client_account_id')
    a=db.find('fleet_accounts',id)
    if a is None:
        raise ScanError('Target fleet account not found: '+id)
    rows=sorted([t for t in db.rows('fleet_transactions') if t['account_id']==id],key=ledger_order)
    vehicles={v['id']:v for v in db.rows('fleet_vehicles')}
    valid=[t for t in rows if t['currency']==a['currency'] and vehicles.get(t['vehicle_id'],{}).get('company')==a['company']]
    net=sum((signed(t) for t in valid),Decimal(0))
    draws=[v for v in vehicles.values() if v['sale_client_account_id']==id and v['sale_price'] is not None]
    valid_draws=[v for v in draws if (v['sale_currency'] or v['currency'])==a['currency'] and v['company']==a['company']]
    draw_total=sum((number(v['sale_price']) for v in valid_draws),Decimal(0))
    live=number(a['balance'])
    opening=live-net+draw_total
    running=live-net
    output,hints=[],defaultdict(list)
    pairs={('FleetAccount',id)}
    for t in valid:
        running+=signed(t)
        v=vehicles[t['vehicle_id']]
        view=dict(t,amount=number(t['amount']),vehicle_name=v['name'],vehicle_company=v['company'],
                  displayed_balance_after=None if a['account_type']=='client' else running)
        output.append(view)
        pairs.update({('FleetTransaction',t['id']),('FleetVehicle',v['id'])})
        field='purchase_bank_details' if t['category']==PURCHASE else 'sale_bank_details' if t['category']==SALE else None
        hint=bank_hint(v.get(field)) if field else None
        if hint:
            hints[hint].append(t['id'])
    latest=max(rows,key=stamped) if rows else None
    label=a['name']
    if a['account_number'] and len(a['account_number'])>4:
        label=label.replace(a['account_number'],masked(a['account_number']))
    exposed=dict(a,name=label,account_number=masked(a['account_number']),balance=live)
    snapshots_delta=live-number(latest['balance_after']) if latest and latest['balance_after'] is not None else None
    return dict(account=exposed,surviving_transaction_count=len(rows),valid_primary_net=net,
                implicit_client_sale_drawdowns=draw_total,implicit_drawdown_count=len(draws),
                live_minus_surviving_net_including_drawdowns=opening,
                internally_matches_zero_opening=abs(opening)<=EPS,
                stored_latest_transaction=latest['id'] if latest else None,stored_latest_to_live_delta=snapshots_delta,
                invalid_company_or_currency_links=[t['id'] for t in rows if t not in valid]+[v['id'] for v in draws if v not in valid_draws],
                recent_ledger=capped(list(reversed(output)),limit),
                current_vehicle_bank_hints=[dict(bank_name=b,account_suffix=masked(n),transactions=ids) for (b,n),ids in sorted(hints.items())],
                multiple_current_bank_identities_in_legacy_tracker=len(hints)>1,
                audit_history=audits(db,pairs,limit),
                limitations=['The implied opening is arithmetic, not an independently verified bank balance.',
                             'Stored snapshots remain untouched. Client cash-style balances stay hidden.',
                             'Vehicle bank hints describe current metadata, not immutable historical identity.',
                             'Hard-deleted ledger rows may have lost their account association.'])


def grouped(rows, fields):
    counts=Counter(tuple(r.get(f) for f in fields) for r in rows)
    return [dict(zip(fields,keys),count=n) for keys,n in sorted(counts.items(),key=lambda x:str(x[0]))]


def interest_usage(db):
    db.require(bank_deposits='id currency amount interest_rate accrued_interest status',
               journal_entries='id tx_type reference status lines',movements='id reference_id entity_type type amount_in amount_out currency')
    deposits=db.rows('bank_deposits')
    journals=[j for j in db.rows('journal_entries') if j['tx_type']=='فائدة بنكية']
    movements=[m for m in db.rows('movements') if m['entity_type']=='bank_account' and 'فائدة' in (m['type'] or '')]
    foreign_moves=[m for m in movements if m['currency']!='LYD' and (number(m['amount_in']) or number(m['amount_out']))]
    foreign=[]
    for j in journals:
        lines=unpack(j,'lines',list)
        if any(not isinstance(line,dict) for line in lines):
            raise ScanError('Interest journal contains a non-object line: '+j['id'])
        if any(line.get('currency') not in (None,'','LYD') for line in lines):
            foreign.append(j['id'])
    principals=defaultdict(lambda:Decimal(0))
    for d in deposits:
        principals[d['currency']]+=number(d['amount'])
    return dict(deposit_records=len(deposits),deposits_by_currency_status=grouped(deposits,['currency','status']),
                principal_by_currency=dict(principals),foreign_deposit_records=sum(d['currency']!='LYD' for d in deposits),
                interest_journal_records=len(journals),journals_by_status=grouped(journals,['status']),
                foreign_interest_journal_ids=foreign,interest_movement_rows=len(movements),
                foreign_interest_movement_rows=len(foreign_moves),
                movement_rows_by_currency=grouped(movements,['currency']),
                priority=('REVIEW_FOREIGN_INTEREST' if foreign or foreign_moves else 'FOREIGN_DEPOSITS_PRESENT_CHECK_BEFORE_CREDIT' if any(d['currency']!='LYD' for d in deposits) else 'RECORDED_LOCAL_CURRENCY_ACTIVITY' if deposits or journals or movements else 'NO_RECORDED_WORKFLOW_USAGE'),
                limitation='These are stored application-workflow records, not proof of the bank paying interest. Manual journals with unrelated labels may be missed.')


def fleet_usage(db, limit):
    db.require(fleet_vehicles='id company currency purchase_price sale_price sale_currency',
               fleet_transactions='id vehicle_id currency amount type category',fleet_damage_records='id vehicle_id currency cost')
    vehicles=db.rows('fleet_vehicles')
    sold=[v for v in vehicles if v['sale_price'] is not None]
    extra=defaultdict(set)
    for t in db.rows('fleet_transactions'):
        if number(t['amount'])!=0:
            extra[t['vehicle_id']].add(t['currency'])
    for d in db.rows('fleet_damage_records'):
        if number(d['cost'])!=0:
            extra[d['vehicle_id']].add(d['currency'])
    exposed=[]
    for v in sold:
        currencies=set(extra[v['id']])
        if number(v['purchase_price'])!=0:
            currencies.add(v['currency'])
        if number(v['sale_price'])!=0:
            currencies.add(v['sale_currency'] or v['currency'])
        if currencies-{'LYD'}:
            exposed.append(dict(id=v['id'],company=v['company'],purchase_currency=v['currency'],sale_currency=v['sale_currency'] or v['currency'],involved_currencies=sorted(currencies)))
    return dict(vehicle_records=len(vehicles),sold_records=len(sold),vehicles_by_company=grouped(vehicles,['company']),
                sold_by_company_currency=grouped([dict(v,sale_currency=v['sale_currency'] or v['currency']) for v in sold],['company','currency','sale_currency']),
                cross_currency_sale_records=sum((v['sale_currency'] or v['currency'])!=v['currency'] for v in sold),
                sold_with_foreign_amounts=capped(exposed,limit),
                priority='REVIEW_HISTORICAL_FX_POLICY' if exposed else 'FLEET_USED_NO_FOREIGN_SOLD_EXPOSURE_FOUND' if vehicles else 'NO_RECORDED_WORKFLOW_USAGE',
                limitation='Recorded sales/FX exposure do not prove which reports the client relies on. No historical rate is inferred.')


def asset_usage(db):
    db.require(fixed_assets='id currency status purchase_price current_value',depreciation_records='asset_id accumulated_depreciation current_book_value',
               vehicles='id',real_estates='id',maintenance_records='id',journal_entries='id reference status')
    assets=db.rows('fixed_assets'); ids={a['id'] for a in assets}
    depreciation=db.rows('depreciation_records')
    sales=[a for a in assets if a['status']=='تم البيع']
    direct=[j for j in db.rows('journal_entries') if j['reference'] in ids]
    historical=None
    if {'entity_type','action'}.issubset(db.schema.get('audit_logs',set())):
        historical=sum(a['entity_type'] in ('FixedAsset','Vehicle','RealEstate','DepreciationRecord') for a in db.rows('audit_logs'))
    registries={t:len(db.rows(t)) for t in ('vehicles','real_estates','maintenance_records')}
    return dict(fixed_asset_records=len(assets),assets_by_currency_status=grouped(assets,['currency','status']),
                recorded_sold_assets=len(sales),depreciation_records=len(depreciation),
                depreciation_with_nonzero_accumulated=sum(number(d['accumulated_depreciation'])!=0 for d in depreciation),
                other_registry_counts=registries,asset_audit_events=historical,
                journal_records_with_direct_asset_reference=len(direct),
                priority='ASSET_ACTIVITY_PRESENT_REVIEW_POSTING_REQUIREMENTS' if assets or depreciation or any(registries.values()) or historical else 'NO_RECORDED_WORKFLOW_USAGE',
                limitation='Default depreciation placeholders do not prove posted depreciation. Direct-ID journal matches are only a linkage hint; unlinked manual postings and sale amounts stored in notes are not inferred. Deleted assets may survive only in audit records.')


def trade_usage(db):
    db.require(transactions='id type payment_method commission status')
    trades=[t for t in db.rows('transactions') if t['type'] in ('buy','sell','exchange')]
    return dict(trade_records=len(trades),by_type_status_method=grouped(trades,['type','status','payment_method']),
                debt_method_records=sum(t['payment_method']=='debt' for t in trades),
                customer_account_method_records=sum(t['payment_method']=='customer_account' for t in trades),
                nonzero_commission_records=sum(number(t['commission'])!=0 for t in trades),
                limitation='Customer-account payment may use an existing positive wallet balance; it is not automatically debt. Manual debts, advances and other fee types are outside this POS census.')


def build_report(con, deposit_ids=DEPOSITS, account_ids=ACCOUNTS, limit=12):
    db=Snapshot(con)
    report=dict(read_only=True,generated_at=datetime.now(timezone.utc).isoformat(),
                deposits=[dict(id=id,**section(lambda id=id:deposit_case(db,id,limit))) for id in deposit_ids],
                fleet_accounts=[dict(id=id,**section(lambda id=id:fleet_case(db,id,limit))) for id in account_ids],
                usage={'interest':section(lambda:interest_usage(db)), 'fleet_fx':section(lambda:fleet_usage(db,limit)),
                       'assets':section(lambda:asset_usage(db)), 'pos_credit_commissions':section(lambda:trade_usage(db))},
                limitations=['No balance changes, proposed loss totals or historical reposting.',
                             'Unknown/missing schema is reported as unavailable, never as zero usage.',
                             'Counts describe stored data; zero records do not prove a feature was never used and deleted.',
                             'Truncation affects displayed evidence only, not counts or arithmetic.'])
    sections=report['deposits']+report['fleet_accounts']+list(report['usage'].values())
    report['complete']=all(s['coverage']=='covered' for s in sections)
    return report


def compact_report(report):
    """Small output for terminal sharing; preserve calculations and errors.

    The full report remains available with --json/--all. Never mutate its
    evidence or recompute any financial value while preparing the summary.
    """
    result=deepcopy(report)
    result['output']='summary; detailed evidence omitted, calculations unchanged'
    for case in result.get('deposits',[])+result.get('fleet_accounts',[]):
        data=case.get('data')
        if data is None:
            continue
        history=data.get('audit_history',{})
        if 'rows' in history:
            rows=history['rows'][:4]
            for row in rows:
                description=row.get('description') or ''
                row['description']=description[:240]
                row['description_truncated']=len(description)>240
            history['rows']=rows
            history['shown']=len(rows)
            history['truncated']=history.get('total',0)>len(rows)
        ledger=data.pop('recent_ledger',None)
        if ledger is not None:
            data['ledger_rows_total']=ledger['total']
        hints=data.pop('current_vehicle_bank_hints',None)
        if hints is not None:
            data['current_bank_identity_hint_count']=len(hints)
            data['current_bank_identity_hint_samples']=[dict(bank_name=h['bank_name'],account_suffix=h['account_suffix'],transaction_count=len(h['transactions'])) for h in hints[:5]]
        for leg in data.get('legs',[]):
            neighbours=leg.pop('neighbouring_movements',None)
            if neighbours is not None:
                leg['neighbouring_rows_total']=neighbours['total']
            gaps=leg.get('matching_undo_gap_candidates')
            if gaps is not None:
                gaps['rows']=gaps['rows'][:3]
                gaps['shown']=len(gaps['rows'])
                gaps['truncated']=gaps['total']>len(gaps['rows'])
            errors=leg.get('arithmetic_error_ids')
            if errors is not None:
                errors['rows']=errors['rows'][:3]
                errors['shown']=len(errors['rows'])
                errors['truncated']=errors['total']>len(errors['rows'])
        if 'journals' in data:
            data['journals']=[{k:j.get(k) for k in ('id','reference','date','status','tx_type','user')} for j in data['journals']]
    for item in result.get('usage',{}).values():
        data=item.get('data',{})
        ids=data.get('foreign_interest_journal_ids')
        if ids is not None:
            data['foreign_interest_journal_count']=len(ids)
            data['foreign_interest_journal_ids']=ids[:3]
        exposure=data.get('sold_with_foreign_amounts')
        if exposure is not None:
            exposure['rows']=exposure['rows'][:3]
            exposure['shown']=len(exposure['rows'])
            exposure['truncated']=exposure['total']>len(exposure['rows'])
    return result


def render(report):
    print('READ-ONLY live reconciliation | complete={}'.format(report.get('complete',False)))
    for key,value in report.get('usage',{}).items():
        print('\nUSAGE {}: {}'.format(key,json.dumps(value,ensure_ascii=False,default=serialize)))
    for case in report.get('deposits',[]):
        print('\nDEPOSIT {} [{}]'.format(case['id'],case['coverage']))
        if case['coverage']!='covered':
            print(case['error']); continue
        print(json.dumps(case['data'],ensure_ascii=False,default=serialize))
    for case in report.get('fleet_accounts',[]):
        print('\nFLEET {} [{}]'.format(case['id'],case['coverage']))
        if case['coverage']!='covered':
            print(case['error']); continue
        print(json.dumps(case['data'],ensure_ascii=False,default=serialize))
    print('\nNothing changed. Review candidates are not proven losses or permission to adjust balances.')


def serialize(value):
    if isinstance(value,Decimal):
        return str(value)
    raise TypeError('Unsupported report value: '+type(value).__name__)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',default=str(Path(__file__).resolve().parent/'sql_app.db'))
    parser.add_argument('--json',action='store_true')
    parser.add_argument('--summary',action='store_true',help='compact JSON; omit detailed ledgers and long evidence lists')
    parser.add_argument('--all',action='store_true')
    parser.add_argument('--deposit',action='append',help='override default deposit IDs; repeat as needed')
    parser.add_argument('--fleet-account',action='append',help='override default fleet IDs; repeat as needed')
    args=parser.parse_args(argv)
    con=None
    try:
        con=read_only_connection(Path(args.db).resolve())
        report=build_report(con,args.deposit or DEPOSITS,args.fleet_account or ACCOUNTS,None if args.all else 12)
        report['database']=str(Path(args.db).resolve())
    except Exception as exc:
        report=dict(read_only=True,complete=False,error=str(exc))
    finally:
        if con is not None:
            con.close()
    if args.summary:
        report=compact_report(report)
    if args.json or args.summary:
        print(json.dumps(report,ensure_ascii=False,indent=2,default=serialize,allow_nan=False))
    else:
        render(report)
        if 'error' in report:
            print('ERROR: '+report['error'])
    return 0 if report.get('complete') else 2


if __name__=='__main__':
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
