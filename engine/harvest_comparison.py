"""Two executable Elo candidates, reconstructed ANY/A inputs, and explicit totals companion."""
import argparse,hashlib,json,statistics
from collections import Counter,defaultdict,deque
from pathlib import Path
from engine.elo import Elo
from engine.harvest import ROOT,BASE,read,digest,canonical,crps
from engine.market_distribution import Distribution,integer
from engine.qb_history import put,encoded
RUN=ROOT/'work/harvest-elo-v2'

def shift(shape,center,total=False):
    counts=Counter()
    for residual,n in shape.items():
        x=integer(center)+residual;counts[max(0,x) if total else x]+=n
    return Distribution(counts).pmf

def compare(rows,candidate,reference,target,season=None):
    subset=[r for r in rows if season is None or r['season']==season]
    pairs=[r for r in subset if r[candidate+'_crps']!='' and r[reference+'_crps']!='']
    a=statistics.mean(r[candidate+'_crps'] for r in pairs) if pairs else None
    b=statistics.mean(r[reference+'_crps'] for r in pairs) if pairs else None
    return {'candidate':candidate,'reference':reference,'target':target,'season':season or 'ALL','paired_n':len(pairs),'candidate_crps':a,'reference_crps':b,'delta_candidate_minus_reference':a-b if pairs else None,'cutoff_label':'DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST' if reference=='nfelo_margin' else 'RECONSTRUCTED_HISTORY_NOT_AS_ISSUED_T60'}

def run(output):
    protocol=json.loads((RUN/'protocol.json').read_text())
    old=json.loads((BASE/'protocol.json').read_text())
    for path,sha in old['inputs'].items():
        if digest(ROOT/path)!=sha:raise ValueError('Pinned v1 source changed')
    receipt=json.loads((RUN/'qb/receipt.json').read_text())
    if digest(RUN/'qb/qb-history.csv')!=receipt['qb_history_sha256']:raise ValueError('QB hash mismatch')
    qb={}
    for r in read(RUN/'qb/qb-history.csv'):
        key=(r['game_id'],r['team'])
        if key in qb:raise ValueError('Duplicate QB team-game')
        qb[key]=r
    initial={r['team']:float(r['elo']) for r in read(BASE/'sources/538-initial_elos.csv')};model=Elo(initial)
    for r in read(BASE/'sources/538-nfl_games.csv'):
        year=int(r['season'])
        if year>=2015:continue
        h,a=r['team1'],r['team2'];model.prepare(h,year);model.prepare(a,year)
        prediction=model.forecast(h,a,r['neutral']=='1',0.,0.);model.update(h,a,float(r['score1']),float(r['score2']),prediction)
    allgames=read(ROOT/old['schedules'])
    schedule=[r for r in allgames if 2015<=int(r['season'])<=2025 and r['home_score'] and r['away_score']]
    schedule.sort(key=lambda r:(int(r['season']),int(r['week']),r['gameday'],r['gametime'],r['game_id']))
    if len({r['game_id'] for r in schedule})!=len(schedule):raise ValueError('Duplicate game')
    warm=sorted([r for r in allgames if r['season']=='2014' and r['game_type']=='REG'],key=lambda r:(r['gameday'],r['gametime'],r['game_id']))
    totals=deque((float(r['home_score'])+float(r['away_score']) for r in warm),maxlen=256)
    references=read(BASE/'sources/nfelo-historic_projected_spreads.csv');counts=Counter(r['game_id'] for r in references)
    nfelo={r['game_id']:r for r in references if counts[r['game_id']]==1}
    groups=defaultdict(list)
    for r in schedule:groups[(int(r['season']),int(r['week']))].append(r)
    histories=defaultdict(list);shapes={};rows=[];audit=[];season_previous=None;missing=[]
    for (season,week),games in groups.items():
        if season!=season_previous:
            shapes={k:Counter(integer(error) for y,error in vals if y<season) for k,vals in histories.items()}
            audit.append({'season':season,'max_training_season':max((y for vals in histories.values() for y,e in vals),default=None),'shape_n':{k:sum(v.values()) for k,v in shapes.items()}})
            season_previous=season
        league_mean=statistics.mean(totals)
        pending=[]
        for g in games:
            h,a=canonical(g['home_team']),canonical(g['away_team']);model.prepare(h,season);model.prepare(a,season)
            plain=model.forecast(h,a,g['location']=='Neutral',0.,0.)
            home=qb.get((g['game_id'],h));away=qb.get((g['game_id'],a));adjusted=None
            if home and away and all(r['qb_adjustment_elo']!='' for r in (home,away)):
                for r in (home,away):
                    if (int(r['training_season']),int(r['training_week']))>=(season,week):raise ValueError('QB table includes target week')
                adjusted=model.forecast(h,a,g['location']=='Neutral',float(home['qb_adjustment_elo']),float(away['qb_adjustment_elo']))
            else:missing.append(g['game_id'])
            locations={'plain_margin':plain['margin_location'],'companion_total':league_mean}
            if adjusted:locations['anya_margin']=adjusted['margin_location']
            if g['spread_line']:locations['market_margin']=float(g['spread_line'])
            if g['total_line']:locations['market_total']=float(g['total_line'])
            ref=nfelo.get(g['game_id'])
            if ref and ref['home_closing_line_rounded_nfelo']:locations['nfelo_margin']=-float(ref['home_closing_line_rounded_nfelo'])
            pending.append((g,h,a,plain,locations,home,away))
        # All current-week forecasts and league means are frozen before scoring/updating.
        for g,h,a,plain,locations,home,away in pending:
            margin=float(g['home_score'])-float(g['away_score']);total=float(g['home_score'])+float(g['away_score'])
            if g['game_type']=='REG':
                if season>=2016:
                    row={'game_id':g['game_id'],'season':season,'week':week,'week1':week==1,'week18':week==18,'margin':margin,'total':total,'evidence':'RECONSTRUCTED_STARTER_IDENTITY_NOT_AS_ISSUED_T60','total_label':'MARKET_TOTAL_RESIDUAL_SHAPE_AT_PRIOR_256_GAME_LEAGUE_MEAN','home_qb_id':home['starter_qb_id'] if home else '', 'away_qb_id':away['starter_qb_id'] if away else '', 'home_qb_adjustment_elo':home['qb_adjustment_elo'] if home else '', 'away_qb_adjustment_elo':away['qb_adjustment_elo'] if away else ''}
                    for key in ('plain_margin','anya_margin','market_margin','nfelo_margin','market_total','companion_total'):
                        shape_key='market_total' if key=='companion_total' else key
                        row[key+'_location']=locations.get(key,'');row[key+'_crps']=''
                        if key in locations and shapes.get(shape_key):
                            target_total=key.endswith('total')
                            row[key+'_crps']=crps(shift(shapes[shape_key],locations[key],target_total),total if target_total else margin)
                    rows.append(row)
                for key,location in locations.items():
                    if key!='companion_total':histories[key].append((season,(total if key.endswith('total') else margin)-location))
                totals.append(total)
            model.update(h,a,float(g['home_score']),float(g['away_score']),plain)
    comparisons=[]
    pairs=[('plain_margin','market_margin','margin'),('plain_margin','nfelo_margin','margin'),('anya_margin','market_margin','margin'),('anya_margin','nfelo_margin','margin'),('companion_total','market_total','total')]
    for season in [None]+list(range(2016,2026)):
        for c,r,target in pairs:comparisons.append(compare(rows,c,r,target,season))
    all_results={r['candidate']+':'+r['reference']:r for r in comparisons if r['season']=='ALL'}
    gates={}
    for candidate in ('plain','anya'):
        common=[r for r in rows if all(r[k+'_crps']!='' for k in (candidate+'_margin','market_margin','companion_total','market_total'))]
        margin_comparison=compare(common,candidate+'_margin','market_margin','margin')
        total_comparison=compare(common,'companion_total','market_total','total')
        margin_ok=bool(common) and margin_comparison['candidate_crps']<margin_comparison['reference_crps']
        total_ok=bool(common) and total_comparison['candidate_crps']<=total_comparison['reference_crps']
        gates[candidate]={'paired_n':len(common),'margin_improves':margin_ok,'total_does_not_worsen':total_ok,'numeric_gate_pass':margin_ok and total_ok,'promotion_eligible':False,'evidence_qualification':'Reconstructed historical lines and postgame-derived starter identity do not establish as-issued T60 availability','margin':margin_comparison,'total':total_comparison}
    result={'experiment_id':'harvest-elo-v2','status':'COMPARISONS_COMPLETE','comparisons':comparisons,'gates':gates,'live_location':'empirical_market_distribution_unchanged','qb_metric':'Rolling ANY/A proxy, NOT published 538 VALUE','total_companion':'Prior-season empirical market total residual shape, centered on prior-256-REG-game league mean, shared by both Elo candidates','qb_table':receipt,'missing_qb_game_ids':missing,'excluded_nfelo_duplicate_ids':sorted(k for k,v in counts.items() if v>1),'shape_audit':audit,'credits_spent':0,'protocol_sha256':digest(RUN/'protocol.json'),'source_hashes':{'nflverse_schedule':digest(ROOT/old['schedules']),'nfelo':digest(BASE/'sources/nfelo-historic_projected_spreads.csv'),'pbp_manifest':digest(RUN/'sources/manifest.json')},'code_sha256':{p:digest(ROOT/p) for p in ['engine/elo.py','engine/harvest_comparison.py','engine/qb_history.py','engine/harvest.py','engine/market_distribution.py']},'limitations':['Starter identity is reconstructed from the target game and could differ from the announced starter; no prospective availability claim.','ANY/A differs from 538 VALUE; fixed 25-Elo-per-ANY/A-unit scale is a local untuned diagnostic convention.','NFelo has margin locations only, with own prior-season empirical wrapper for CRPS; no native nfelo distribution or totals claim.','Market shapes are fitted from prior seasons only; the live all-years fit is not used for in-sample scoring.']}
    output=Path(output);put(output/'paired-losses.csv',encoded(rows));put(output/'experiment.json',(json.dumps(result,indent=2,sort_keys=True)+'\n').encode())
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--harvest',choices=['elo-anya-v2'],required=True);p.add_argument('--output',required=True);a=p.parse_args();r=run(a.output)
    print(json.dumps({'comparisons':[x for x in r['comparisons'] if x['season']=='ALL'],'gates':{k:v['numeric_gate_pass'] for k,v in r['gates'].items()}},indent=2))
