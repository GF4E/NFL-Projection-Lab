"""Executed slips: identical locked-line settlement and explicit close reference.

No T80 quote reads, no provider calls. Missing as-placed fair probability is never
invented: close-based price CLV is relative to the executed price's break-even.
"""
import csv
import fcntl
import io
import json
from pathlib import Path
from engine.pick_store import put,sha,read_pinned
from engine.pricing import price_edge,decimal_odds,timestamp
from engine.market_distribution import MarketDistribution
from engine.t75_grade import grade
from engine.t75_report import final_feed
from engine.slip_ingest import ROOT,DEFAULT_LOG


def read(path):
    with Path(path).open(newline='') as f:
        fcntl.flock(f,fcntl.LOCK_SH)
        return list(csv.DictReader(f))

def write_csv(path,rows,fields):
    stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader();writer.writerows({k:json.dumps(v,sort_keys=True) if isinstance(v,(dict,list)) else v for k,v in r.items()} for r in rows)
    put(path,stream.getvalue().encode(),raw=True)


def settle(pick,result,shape):
    if not result:return {'status':'PENDING'}
    p={'market':pick['market'],'side':pick['side'],'line':float(pick['line_at_approval']),
       'price':float(pick['book_price']),'fair_probability':1/decimal_odds(pick['book_price']),'home_team':pick['home_team']}
    # W/L/P and unit return use the same T75 arithmetic; no model probability at
    # placement is asserted. Moneyline is a zero spread for two-way settlement.
    if p['market']=='moneyline':p['market']='spreads';p['line']=0
    result_grade=grade(p,result,shape)
    if result_grade['status']!='SCORED':return result_grade
    closing=MarketDistribution(shape,-result['spread_line'],result['total_line'])
    fair=(closing.totals(float(pick['line_at_approval']),pick['side']=='Over') if pick['market']=='totals' else
          closing.spread(float(pick['line_at_approval']),pick['side']==pick['home_team']))['conditional_win']
    result_grade.update(clv_cents=price_edge(fair,pick['book_price']) if fair is not None and 0<fair<1 else None,
        clv_probability=fair-1/decimal_odds(pick['book_price']) if fair is not None else None,
        clv_status='SLIP_NFLVERSE_CLOSE_PRICED',clv_reference='nflverse_close_vs_executed_price',
        clv_probability_basis='closing_fair_minus_executed_break_even; not as-placed model movement',
        stake=float(pick['stake']) if pick['stake'] else None,stake_currency=pick['stake_currency'],profit=float(pick['stake'])*result_grade['units'] if pick['stake'] else None,source='jaret')
    if not pick['placed_at']:
        result_grade.update(clv_cents=None,clv_probability=None,clv_status='UNKNOWN_PLACEMENT_TIME')
    elif timestamp(pick['placed_at'])>=timestamp(pick['commence_time']):
        result_grade.update(clv_cents=None,clv_probability=None,clv_status='INAPPLICABLE_PLACED_AFTER_PREGAME_CLOSE')
    return result_grade


def run(log=DEFAULT_LOG,output=ROOT/'outputs/jaret',results_path=None,*,include_model=True):
    from engine.scorecard import scorecard
    output=Path(output);picks=read(log) if Path(log).exists() else []
    config=json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text());shape=read_pinned(config['distribution'])
    refs=sorted((ROOT/'outputs/model-pick-v1/daily').glob('*/results-ref.json'),reverse=True)
    results={}
    if results_path:
        raw=Path(results_path).read_bytes();results=final_feed(raw,sha(raw))
    elif refs:
        ref=json.loads(refs[0].read_text());raw=Path(ref['path']).read_bytes()
        if sha(raw)!=ref['sha256']:raise ValueError('Final source hash mismatch')
        results=final_feed(raw,ref['sha256'])
    grades=[];outcomes=[]
    for pick in picks:
        game_id=pick['game_id'];result=results.get(game_id)
        dest=output/'grades'/(pick['slip_id']+'.json')
        if dest.exists():g=json.loads(dest.read_text())
        else:
            value=settle(pick,result,shape)
            if value['status']!='SCORED':continue
            g={**pick,**value,'settled_result':result,'distribution_hash':config['distribution']['sha256']};put(dest,g)
        frozen=g['settled_result']
        outcomes.append({'event_id':pick['event_id'],'home_score':frozen['home_score'],'away_score':frozen['away_score'],'status':'final','season':pick['season'],'week':pick['week']})
        grades.append(g)
    # Content-addressed exports support the existing joint scorecard reader.
    identity=sha(json.dumps({'export_schema':'slip-grade-v2','picks':picks,'grades':grades,'outcomes':outcomes},sort_keys=True).encode())
    report=output/'reports'/identity
    outcomes=list({r['event_id']:r for r in outcomes}.values())
    write_csv(report/'results.csv',outcomes,['event_id','home_score','away_score','status','season','week'])
    fields=sorted({k for g in grades for k in g}) or ['pick_id','clv_cents','clv_status']
    export=[{**g,'clv_cents':g['clv_cents'] if g['clv_cents'] is not None else ''} for g in grades]
    write_csv(report/'grades.csv',export,fields)
    if Path(log).exists():
        # Report files are create-only: replay never rewrites existing reports.
        if not (report/'scorecard.csv').exists():scorecard([log],report/'results.csv',[report/'grades.csv'],report/'scorecard.csv')
    from engine.t75_report import run as model_report
    combined=[]
    if include_model:
        model=model_report()
        model_csv=Path(model['report'])/'scorecard.csv'
        for r in read(model_csv):
            combined.append({**r,'source':'engine' if not r['subset'].startswith('WIND-') else 'paper_rule'})
    if (report/'scorecard.csv').exists():
        for r in read(report/'scorecard.csv'):
            if r['source']=='jaret' or not picks and r['source']=='ALL':combined.append({**r,'source':'jaret','version':'executed-slip-v1'})
    fields=list(dict.fromkeys(k for r in combined for k in r)) or ['source','version','market','week']
    source_id=sha(json.dumps(combined,sort_keys=True).encode())
    source_report=output/'source-reports'/source_id/'scorecard.csv'
    write_csv(source_report,combined,fields)
    result={'report':str(report),'pick_count':len(picks),'graded':len(grades),'pending':len(picks)-len(grades),'credits_spent':0}
    put(report/'experiment.json',result)
    return {**result,'source_scorecard':str(source_report)}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--scorecard',action='store_true',required=True);p.add_argument('--log',default=str(DEFAULT_LOG));p.add_argument('--output',default=str(ROOT/'outputs/jaret'));p.add_argument('--results');a=p.parse_args()
    print(json.dumps(run(a.log,a.output,a.results),indent=2))
