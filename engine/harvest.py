"""Named offline harvest: frozen prior-season shapes and paired CRPS diagnostics."""
import argparse,csv,datetime as dt,hashlib,io,json,math
from collections import Counter,defaultdict
from pathlib import Path
from engine.elo import Elo
from engine.market_distribution import Distribution,integer
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'work/harvest-elo-v1'

def read(path):
    with Path(path).open(newline='') as f:return list(csv.DictReader(f))
def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def canonical(t):return {'LA':'LAR','STL':'LAR','SD':'LAC','LV':'OAK','WAS':'WSH'}.get(t,t)
def crps(pmf,actual):
    mass=0.;weighted=0.;half_pair=0.
    for x,p in sorted(pmf.items()):
        half_pair+=p*(x*mass-weighted);mass+=p;weighted+=x*p
    return sum(p*abs(x-actual) for x,p in pmf.items())-half_pair

def distribution(residuals,center,total=False):
    counts=Counter()
    for x in residuals:
        v=integer(center)+integer(x);counts[max(0,v) if total else v]+=1
    return Distribution(counts)

def run(component,output,qb_input=None,predictions_input=None):
    if not predictions_input and component not in {'538-qb-elo','538-base-elo'}:raise ValueError('Unimplemented component: register and port it before harvest; no arbitrary code loading')
    protocol=json.loads((BASE/'protocol.json').read_text())
    for path,sha in protocol['inputs'].items():
        if digest(ROOT/path)!=sha:raise ValueError('Pinned source changed: '+path)
    initial={r['team']:float(r['elo']) for r in read(BASE/'sources/538-initial_elos.csv')}
    model=Elo(initial)
    # Historical warm-up only; never seed from future pre/postgame ratings.
    for r in read(BASE/'sources/538-nfl_games.csv'):
        if int(r['season'])>=2015:continue
        h,a=r['team1'],r['team2'];y=int(r['season'])
        model.prepare(h,y);model.prepare(a,y)
        pred=model.forecast(h,a,r['neutral']=='1',0.,0.)
        model.update(h,a,float(r['score1']),float(r['score2']),pred)
    schedule=[r for r in read(ROOT/protocol['schedules']) if 2015<=int(r['season'])<=2025 and r['home_score'] and r['away_score']]
    schedule.sort(key=lambda r:(int(r['season']),int(r['week']),r['gameday'],r['gametime'],r['game_id']))
    if len({r['game_id'] for r in schedule})!=len(schedule):raise ValueError('Duplicate schedule ID')
    refrows=read(BASE/'sources/nfelo-historic_projected_spreads.csv')
    refcounts=Counter(r['game_id'] for r in refrows)
    duplicate_ids=sorted(k for k,v in refcounts.items() if v>1)
    references={r['game_id']:r for r in refrows if refcounts[r['game_id']]==1}
    qbs={}
    if qb_input:
        for r in read(qb_input):
            if r['game_id'] in qbs:raise ValueError('Duplicate QB input')
            qbs[r['game_id']]=r
    imported={}
    if predictions_input:
        for row in read(predictions_input):
            if row['game_id'] in imported:raise ValueError('Duplicate component prediction')
            imported[row['game_id']]=row
    records=[];histories=defaultdict(list);shapes={};audit=[]
    groups=defaultdict(list)
    for r in schedule:groups[(int(r['season']),int(r['week']))].append(r)
    previous_season=None
    for (season,week),games in groups.items():
        if season!=previous_season:
            shapes={k:[e for y,e in values if y<season] for k,values in histories.items()}
            audit.append({'season':season,'training_max_season':max((y for vals in histories.values() for y,e in vals),default=None),'sample_sizes':{k:len(v) for k,v in shapes.items()}})
            previous_season=season
        predictions=[]
        # Forecast whole week before any result from that week can update ratings.
        for r in games:
            h,a=canonical(r['home_team']),canonical(r['away_team'])
            model.prepare(h,season);model.prepare(a,season)
            base=model.forecast(h,a,r['location']=='Neutral',0.,0.)
            qb=qbs.get(r['game_id']);candidate=None
            if qb:
                # Inputs must attest pre-week availability; target-week performance cannot enter.
                from zoneinfo import ZoneInfo
                kickoff=dt.datetime.fromisoformat(r['gameday']+'T'+r['gametime']).replace(tzinfo=ZoneInfo('America/New_York'))
                available=dt.datetime.fromisoformat(qb['available_at'].replace('Z','+00:00'))
                if available.tzinfo is None or available>kickoff-dt.timedelta(minutes=60):raise ValueError('QB input violates T60')
                if int(qb['training_season'])>season or (int(qb['training_season'])==season and int(qb['training_week'])>=week):raise ValueError('QB training uses target week')
                candidate=model.forecast(h,a,r['location']=='Neutral',float(qb['home_qb_adjustment']),float(qb['away_qb_adjustment']))
            if component=='538-base-elo':candidate=base
            supplied=imported.get(r['game_id'])
            if supplied:
                from zoneinfo import ZoneInfo
                cutoff=dt.datetime.fromisoformat(r['gameday']+'T'+r['gametime']).replace(tzinfo=ZoneInfo('America/New_York'))-dt.timedelta(minutes=60)
                issued=dt.datetime.fromisoformat(supplied['available_at'].replace('Z','+00:00'))
                if issued.tzinfo is None or issued>cutoff:raise ValueError('Component issued after T60')
                if (int(supplied['training_season']),int(supplied['training_week']))>=(season,week):raise ValueError('Component trained on target week')
                candidate={k:float(supplied[k]) for k in ('margin_location','total_location') if supplied.get(k,'')!=''}
                if not all(math.isfinite(x) for x in candidate.values()):raise ValueError('Invalid component location')
            predictions.append((r,h,a,base,candidate))
        for r,h,a,base,candidate in predictions:
            # Labels are used only after the week's forecasts have been frozen.
            margin=float(r['home_score'])-float(r['away_score']);total=float(r['home_score'])+float(r['away_score'])
            locations={'elo_base_margin':base['margin_location']}
            if candidate:
                for target in ('margin','total'):
                    if target+'_location' in candidate:locations['candidate_'+target]=candidate[target+'_location']
            if r['spread_line']:locations['market_margin']=float(r['spread_line'])
            if r['total_line']:locations['market_total']=float(r['total_line'])
            ref=references.get(r['game_id'])
            if ref and ref['home_closing_line_rounded_nfelo']:locations['nfelo_margin']=-float(ref['home_closing_line_rounded_nfelo'])
            if r['game_type']=='REG':
                if season>=2016:
                    row={'game_id':r['game_id'],'season':season,'week':week,'week1':week==1,'week18':week==18,'cutoff_label':'DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST','candidate_status':'PREGAME_INPUT_AVAILABLE' if candidate else 'MISSING_COMPONENT_INPUT' if predictions_input else 'MISSING_PREGAME_QB_INPUT','candidate_total_status':'AVAILABLE' if 'candidate_total' in locations else 'NOT_PROVIDED_BY_COMPONENT','nfelo_total_status':'NOT_PROVIDED_BY_REFERENCE','margin':margin,'total':total}
                    for key in ('market_margin','market_total','elo_base_margin','candidate_margin','candidate_total','nfelo_margin','nfelo_total'):
                        target='total' if key.endswith('total') else 'margin'
                        row[key+'_location']=locations.get(key,'');row[key+'_crps']=''
                        if key in locations and shapes.get(key):row[key+'_crps']=crps(distribution(shapes[key],locations[key],target=='total').pmf,total if target=='total' else margin)
                    records.append(row)
                for key,location in locations.items():histories[key].append((season,(total if key.endswith('total') else margin)-location))
            model.update(h,a,float(r['home_score']),float(r['away_score']),base)
    summary=[]
    for year in ['ALL']+list(range(2016,2026)):
        subset=[r for r in records if year=='ALL' or r['season']==year]
        for candidate in ('market_margin','market_total','candidate_margin','candidate_total','elo_base_margin','nfelo_margin','nfelo_total'):
            target='total' if candidate.endswith('total') else 'margin';market='market_'+target
            pairs=[r for r in subset if r[candidate+'_crps']!='' and r[market+'_crps']!='']
            summary.append({'season':year,'series':candidate,'target':target,'eligible_games':len(subset),'paired_n':len(pairs),'crps':sum(r[candidate+'_crps'] for r in pairs)/len(pairs) if pairs else None,'market_crps_same_games':sum(r[market+'_crps'] for r in pairs)/len(pairs) if pairs else None})
    nfelo_pairs={}
    for target in ('margin','total'):
        pairs=[r for r in records if r['candidate_'+target+'_crps']!='' and r['nfelo_'+target+'_crps']!='']
        nfelo_pairs[target]={'paired_n':len(pairs),'candidate_crps':sum(r['candidate_'+target+'_crps'] for r in pairs)/len(pairs) if pairs else None,'nfelo_crps':sum(r['nfelo_'+target+'_crps'] for r in pairs)/len(pairs) if pairs else None}
    comparison={'excluded_nfelo_duplicate_ids':duplicate_ids,'candidate_vs_nfelo':nfelo_pairs,'component':component,'status':'IMPORTED_COMPONENT_DIAGNOSTIC' if predictions_input else 'INCOMPLETE_QB_INPUTS_AND_NO_TOTAL_FORECAST' if component=='538-qb-elo' else 'DIAGNOSTIC_BASE_ELO_ONLY','promotion_eligible':False,'live_location':'empirical_market_distribution_unchanged','cutoff_label':'DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST','scores':summary,'season_fit_audit':audit,'protocol_sha256':digest(BASE/'protocol.json'),'code_sha256':{p:digest(ROOT/p) for p in ['engine/elo.py','engine/harvest.py','engine/market_distribution.py']},'qb_input_sha256':digest(qb_input) if qb_input else None,'predictions_input_sha256':digest(predictions_input) if predictions_input else None,'credits_spent':0,'limitations':['Pinned upstream code has no QB estimator or totals forecast. QB adjustment math is implemented but must receive qualified pregame inputs; missing values are never zero-filled.','538 point-to-margin conversion and empirical CRPS wrappers are local diagnostic adapters, not published 538 distribution forecasts.','Historical nflverse lines and nfelo outputs do not attest T60 issuance. nfelo begins 2021; first-season residual calibration is unavailable.','The live PMF trained on 2015-2025 is never scored on its own training games; market shapes are refit using prior seasons only.']}
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    buf=io.StringIO(newline='');w=csv.DictWriter(buf,fieldnames=list(records[0]));w.writeheader();w.writerows(records)
    artifacts={'paired-losses.csv':buf.getvalue().encode(),'experiment.json':(json.dumps(comparison,indent=2,sort_keys=True)+'\n').encode()}
    for name,data in artifacts.items():
        p=output/name
        if p.exists() and p.read_bytes()!=data:raise ValueError('Immutable harvest differs')
        if not p.exists():p.write_bytes(data)
    return comparison

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--harvest',required=True);p.add_argument('--output',required=True);p.add_argument('--qb-input');p.add_argument('--predictions')
    a=p.parse_args()
    if a.harvest=='elo-anya-v2':
        if a.qb_input or a.predictions:p.error('elo-anya-v2 uses the pinned reconstructed QB table')
        from engine.harvest_comparison import run as run_comparison
        result=run_comparison(a.output)
        print(json.dumps({'status':result['status'],'promotion_eligible':any(g['promotion_eligible'] for g in result['gates'].values()),'output':a.output}))
    else:
        result=run(a.harvest,a.output,a.qb_input,a.predictions)
        print(json.dumps({'status':result['status'],'promotion_eligible':result['promotion_eligible'],'output':a.output}))
