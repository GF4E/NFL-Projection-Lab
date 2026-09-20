"""Post-forecast reference-line audit. Never imported by projection/fit code.

References are consumed only after predictions exist. No network access or refits.
"""
import csv
import gzip
import hashlib
import io
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = 'work/reference-line-metric-v1'
CLOSE = 'work/market-distribution-v1/schedules-d64cef660c4b14c74f0e33ecee387343675137ed2f1a1fac2b0c70951b8a4c07.csv'
CONFIDENCE = 'Confidence: near-total — these audit rates are arithmetic on verified rows. Move down to high if a source hash, line sign, or projection identity is invalidated.'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(path):
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if path.suffix == '.gz' else raw)


def finite(value):
    try:
        return math.isfinite(float(value))
    except (ValueError, TypeError):
        return False


def interval(wins, n):
    if not n:
        return {'correct': 0, 'games': 0, 'rate': None, 'interval95': None}
    p = wins / n
    z = 1.959963984540054
    denom = 1 + z*z/n
    center = (p + z*z/(2*n))/denom
    radius = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n))/denom
    return {'correct': wins, 'games': n, 'rate': p,
            'interval95': [max(0., center-radius), min(1., center+radius)]}


def normalize(rows, point='point'):
    """Adapt saved game/team/scoring rows without reconstructing missing predictions."""
    grouped = defaultdict(list)
    for row in rows:
        grouped[row['game_id']].append(row)
    result = []
    for gid, rr in sorted(grouped.items()):
        first = rr[0]
        g = {'game_id': gid, 'season': int(first['season']),
             'week': int(first.get('week') or gid.split('_')[1]), 'team_mae': None}
        if 'actual_home' in first:
            if len(rr) != 1:
                raise ValueError('Duplicate forecast game: '+gid)
            for prefix, h, a in [('', first['home'], first['away']),
                                 ('actual_', first['actual_home'], first['actual_away'])]:
                g[prefix+'margin'] = h-a
                g[prefix+'total'] = h+a
            g['team_mae'] = (abs(first['home']-first['actual_home']) + abs(first['away']-first['actual_away']))/2
        else:
            teams = [r for r in rr if r.get('target','team') in ('team','team_points')]
            if len(teams) == 2 and all(finite(r.get(point)) and finite(r.get('actual',r.get('actual_points'))) for r in teams):
                g['team_mae'] = sum(abs(r[point]-r.get('actual',r.get('actual_points'))) for r in teams)/2
                sides = {r['home']: r for r in teams if isinstance(r.get('home'),bool)}
                if len(sides) == 2:
                    h,a = sides[True],sides[False]
                    g.update(margin=h[point]-a[point],total=h[point]+a[point],
                             actual_margin=h.get('actual',h.get('actual_points'))-a.get('actual',a.get('actual_points')),
                             actual_total=h.get('actual',h.get('actual_points'))+a.get('actual',a.get('actual_points')))
            for target in ('margin','total'):
                matches = [r for r in rr if r.get('target') == target]
                if len(matches)>1:
                    raise ValueError('Duplicate target: '+gid+' '+target)
                if matches and finite(matches[0].get(point)):
                    g[target] = matches[0][point]
                    g['actual_'+target] = matches[0]['actual']
            # Elo-only diagnostic contains a margin, no team/total forecasts.
            if len(rr)==1 and point in first and 'outcome' in first:
                g['margin'],g['actual_margin'] = first[point],first['actual']
        result.append(g)
    return result


def load_references(root=ROOT, weekly=False):
    close_path = root/CLOSE
    if weekly:
        feed = root/'outputs/projection-v3/final-feed.json'
        if feed.exists():
            digest = read(feed).get('source_sha256')
            candidate = root/f'outputs/projection-v3/final-sources/{digest}.csv'
            if candidate.exists():
                if sha(candidate) != digest:
                    raise ValueError('Final-source hash mismatch')
                close_path = candidate
    with close_path.open() as handle:
        schedules = {r['game_id']: r for r in csv.DictReader(handle)}
    refs = {'CLOSE': {'spread': {}, 'total': {}}, 'OPEN': {'spread': {}, 'total': {}}}
    metadata = {'CLOSE': {'path':str(close_path.relative_to(root)), 'sha256':sha(close_path),
                           'spread_column':'spread_line', 'total_column':'total_line'}, 'OPEN': {}}
    for gid,r in schedules.items():
        for target,column in [('spread','spread_line'),('total','total_line')]:
            if finite(r.get(column)):
                refs['CLOSE'][target][gid] = float(r[column])
    receipt_path = root/SOURCE_DIR/'open-source-receipts.json'
    runtime_receipts = root/'outputs/in-season-learning-v1/reference-sources/receipts.json'
    if weekly and runtime_receipts.exists():
        receipt_path = runtime_receipts
    receipts = read(receipt_path)
    metadata['receipt_path'] = str(receipt_path.relative_to(root))
    status = root/'outputs/in-season-learning-v1/reference-sources/status.json'
    metadata['refresh_status'] = read(status) if weekly and status.exists() else {'state':'PINNED_HISTORICAL_SNAPSHOT'}
    for target,filename,column,sign in [('spread','historic_projected_spreads.csv','home_line_open',-1),
                                       ('total','nfelo_games.csv','total_line_open',1)]:
        receipt = next(r for r in receipts if r['url'].endswith('/'+filename))
        path = root/receipt['path']
        raw = gzip.decompress(path.read_bytes())
        if sha(path)!=receipt['sha256'] or hashlib.sha256(raw).hexdigest()!=receipt['sha256_uncompressed']:
            raise ValueError('OPEN reference hash mismatch')
        for r in csv.DictReader(io.StringIO(raw.decode())):
            gid = r['game_id']
            if int(gid[:4])<2021 or not finite(r.get(column)):
                continue
            value = sign*float(r[column])
            if gid in refs['OPEN'][target] and value!=refs['OPEN'][target][gid]:
                raise ValueError('Conflicting duplicate OPEN reference: '+gid)
            refs['OPEN'][target][gid] = value
        metadata['OPEN'][target] = {**receipt, 'column':column, 'sign_to_home_margin':sign}
    return refs,metadata


def audit(rows, refs, include_buckets=False):
    ids = [r['game_id'] for r in rows]
    if len(ids)!=len(set(ids)):
        raise ValueError('Audit requires one forecast per game within each lineage')
    def mean_mae(rr):
        values = [r['team_mae'] for r in rr if r.get('team_mae') is not None]
        return sum(values)/len(values) if values else None
    def group(rr, reference, target):
        predkey = 'margin' if target=='spread' else 'total'
        counts = {'population':len(rr),'line_available':0,'missing_forecast':0,'pushes':0,'no_lean':0}
        n=w=0
        for r in rr:
            line = refs[reference][target].get(r['game_id'])
            if line is None: continue
            counts['line_available']+=1
            if not finite(r.get(predkey)) or not finite(r.get('actual_'+predkey)):
                counts['missing_forecast']+=1;continue
            delta = r[predkey]-line
            outcome = r['actual_'+predkey]-line
            if outcome==0: counts['pushes']+=1;continue
            if delta==0: counts['no_lean']+=1;continue
            n+=1;w+=delta*outcome>0
        return {**interval(w,n),**counts,'coverage':counts['line_available']/len(rr) if rr else None,
                'team_mae':mean_mae(rr),'label':'DIAGNOSTIC ONLY','status':'INSUFFICIENT' if reference=='OPEN' and target=='total' or not n else 'DIAGNOSTIC ONLY'}
    result = {'schema':'reference-lines-v1','label':'DIAGNOSTIC ONLY','reporting_only':True,'never_a_gate':True,'never_a_target':True,'never_a_selection_criterion':True,'games':len(rows),
              'team_mae':mean_mae(rows),'references':{}}
    for reference in ('CLOSE','OPEN'):
        result['references'][reference]={}
        for target in ('spread','total'):
            key = 'margin' if target=='spread' else 'total'
            buckets=defaultdict(list)
            for r in rows:
                line=refs[reference][target].get(r['game_id'])
                if include_buckets and line is not None and finite(r.get(key)):
                    buckets[math.floor(abs(r[key]-line))].append(r)
            result['references'][reference][target] = {
                'pooled':group(rows,reference,target),
                'coverage_2021_forward':group([r for r in rows if r['season']>=2021],reference,target),
                'seasons':{str(y):group([r for r in rows if r['season']==y],reference,target) for y in sorted({r['season'] for r in rows})},
                'weeks':{f'{y}-w{w}':group([r for r in rows if r['season']==y and r['week']==w],reference,target) for y,w in sorted({(r['season'],r['week']) for r in rows})},
                'buckets':{str(k):group(rr,reference,target) for k,rr in sorted(buckets.items())}}
    return result


def render(report, title='DIAGNOSTIC ONLY', weekly=False):
    """Exactly two compact lines; annual counts expand without a diagnostic section."""
    from html import escape
    def rate(g):
        if not g or not g.get('games'):
            return '0 scored; insufficient data'
        lo,hi=g['interval95']
        return f"{g['correct']}/{g['games']} ({100*g['rate']:.2f}%; 95% {100*lo:.2f}–{100*hi:.2f}%)"
    items=list(report.get('series',{}).items())
    if weekly:
        items=[(k,v) for k,v in items if k.startswith('AS_ISSUED')]
    else:
        live=[(k,v) for k,v in items if 'CURRENT HFA' in v.get('identity','')]
        if live:items=live
    lines=[]
    for ref in ('CLOSE','OPEN'):
        pooled=[];annual=[]
        for name,item in items:
            if not item.get('audit'):continue
            data=item['audit']['references'][ref]
            label=name if weekly else 'current HFA' if 'CURRENT HFA' in item.get('identity','') else name
            coverage=data['spread'].get('coverage_2021_forward',data['spread']['pooled'])
            cover=f"; spread coverage {coverage['line_available']}/{coverage['population']}" if ref=='OPEN' else ''
            pooled.append(label+': ATS '+rate(data['spread']['pooled'])+('; total '+rate(data['total']['pooled']) if ref=='CLOSE' else cover))
            for year,g in data['spread']['seasons'].items():
                annual.append(label+' '+year+': ATS '+rate(g)+('; total '+rate(data['total']['seasons'][year]) if ref=='CLOSE' else '')+f"; spread coverage {g['line_available']}/{g['population']}")
        summary='DIAGNOSTIC ONLY — '+ref+' — '+(' | '.join(pooled) or 'no graded as-issued forecasts')
        if ref=='OPEN':summary+='; totals INSUFFICIENT (34.3% historical coverage)'
        sources=report.get('sources',{})
        source='nflverse spread_line / total_line' if ref=='CLOSE' else 'nfelo historic_projected_spreads.csv home_line_open; totals source nfelo_games.csv total_line_open, unblended'
        detail='By season: '+(' | '.join(annual) or 'no eligible games')+'. Source: '+source+'. Counts exclude actual pushes and exact forecast-on-line cases. Never a target, gate, ranking, selection criterion or justification for a model change.'
        lines.append('<details><summary>'+escape(summary)+'</summary>'+escape(detail)+'</details>')
    return '\n'.join(lines)+'\n'


def weekly_report(cards, root=ROOT):
    refs,sources=load_references(root,weekly=True)
    batches=defaultdict(list)
    for c in cards:
        grade=(c.get('grades') or {}).get('PROJECTION')
        if not grade or not c.get('projection'): continue
        evidence=c.get('evidence','UNKNOWN')
        if evidence=='AS_ISSUED' and not c.get('freeze_time'):
            evidence='UNVERIFIED_LOCK'
        label=evidence+' / '+c.get('version','UNKNOWN_VERSION')
        p=c['projection'];a=grade['actual']
        batches[label].append({'game_id':c['game_id'],'season':c['season'],'week':c['week'],
                              'home':p['home_points'],'away':p['away_points'],
                              'actual_home':a['home_points'],'actual_away':a['away_points']})
    return {'schema':'reference-lines-report-v1','sources':sources,'series':{
        k:{'identity':k+'; original projection and first grade; human edits excluded',
           'audit':audit(normalize(v),refs)} for k,v in sorted(batches.items())}}
