"""Offline replay of week1-usefulness-audit-v1; never writes production artifacts."""
import argparse
import csv
import hashlib
import json
import math
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np
from engine.market_distribution import Distribution, MarketDistribution, integer
from engine.model_pick import BOOKS, MARKETS, quotes, consensus, evaluate, probabilities
from engine.pricing import power_devig, decimal_odds, american, price_edge, qualifies
from engine.harvest import crps
from engine.live_weather_v2 import qualified

BASE = ROOT / 'work/week1-usefulness-audit-v1'


def read(path):
    return json.loads(Path(path).read_text())


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rows(path):
    with Path(path).open() as f:
        return list(csv.DictReader(f))


def encode(value):
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False)+'\n').encode()


def put(path, value):
    path = Path(path)
    data = encode(value)
    if path.exists() and path.read_bytes() != data:
        raise ValueError('Immutable audit output differs: '+str(path))
    if not path.exists():
        path.write_bytes(data)


def csv_bytes(data):
    import io
    stream = io.StringIO(newline='')
    w = csv.DictWriter(stream, fieldnames=list(data[0]))
    w.writeheader(); w.writerows(data)
    return stream.getvalue().encode()


def arithmetic(shape):
    checks = []
    def check(name, ok):
        if not ok:
            raise AssertionError(name)
        checks.append(name)
    check('two_way_equal_power_devig', np.allclose(power_devig([-110,-110])[0], [.5,.5], atol=1e-12))
    check('two_way_hand_solvable_power_two', np.allclose(power_devig([-150,-400])[0], [.36,.64], atol=1e-12))
    q = math.sqrt(.5)
    check('three_way_hand_solvable_power_two', np.allclose(power_devig([100,100,-100*q/(1-q)])[0], [.25,.25,.5], atol=1e-12))
    check('American_round_trip', all(abs(1/decimal_odds(american(p))-p)<1e-12 for p in (.2,.49,.5,.6,.7,.9)))
    check('even_money_sign_continuity', abs(price_edge(.5,100)-price_edge(.5,-100))<1e-12)
    check('registered_gate_boundaries', qualifies(.60,-140) and not qualifies(.5999,-140) and not qualifies(.7001,-200) and not qualifies(.6,-141))
    model=MarketDistribution(shape,-3,45)
    check('unit_mass', all(abs(sum(d.pmf.values())-1)<1e-12 for d in (model.margin,model.total)))
    check('monotone_CDF', all(d.cdf(x)<=d.cdf(x+1) for d in (model.margin,model.total) for x in range(-150,200)))
    check('integer_push_positive', model.spread(-3)['push']>0 and model.totals(45)['push']>0)
    check('half_point_push_zero', model.spread(-2.5)['push']==0 and model.totals(45.5)['push']==0)
    check('home_away_complement', abs(model.spread(-3)['win']-model.spread(3,False)['loss'])<1e-12)
    check('over_under_complement', abs(model.totals(45)['win']-model.totals(45,False)['loss'])<1e-12)
    check('half_point_improvement', model.spread(-2.5)['win']>model.spread(-3)['win'])
    check('teaser_leg_monotonicity', model.teaser(-3)['win']>model.spread(-3)['win'])
    # Direct settlement enumeration is independent of probability()'s thresholds.
    for home,line in [(True,-3),(False,3),(True,-2.5),(False,2.5)]:
        p=model.spread(line,home)
        direct=sum(m*(100/120 if (k if home else -k)+line>0 else -1 if (k if home else -k)+line<0 else 0) for k,m in model.margin.pmf.items())
        check('settlement_EV_'+str((home,line)), abs(direct-(p['win']*100/120-p['loss']))<1e-12)
    toy=Distribution({-7:1,0:2,3:4,7:3})
    check('tie_and_OT_final_arithmetic', toy.probability(0)['push']==.2 and toy.probability(3)['push']==.4)
    for d in (model.margin,model.total,toy):
        for actual in (-3,0,3,34,45,90):
            low=min(min(d.pmf),actual); high=max(max(d.pmf),actual)
            cdf_formula=sum((d.cdf(x)-int(actual<=x))**2 for x in range(low,high))
            check('CRPS_CDF_vs_expectation_'+str((min(d.pmf),actual)), abs(cdf_formula-crps(d.pmf,actual))<=1e-9)
    # Quantized locations are a declared model limitation, not changed by this audit.
    return checks


def historical():
    old=read(ROOT/'work/harvest-elo-v1/protocol.json')
    games=[r for r in rows(ROOT/old['schedules']) if r['game_type']=='REG' and 2015<=int(r['season'])<=2025 and all(r[k] for k in ('home_score','away_score','spread_line','total_line'))]
    saved={r['game_id']:r for r in rows(ROOT/'work/harvest-elo-v2/run-2/paired-losses.csv')}
    previous_cov={(int(r['season']),r['target']):r for r in rows(ROOT/'work/teaser-calibration-situations-v1/run-2/calibration.csv')}
    result=[]; aggregate=[]; max_error=0.
    for year in range(2016,2026):
        train=[r for r in games if int(r['season'])<year]
        current=[r for r in games if int(r['season'])==year]
        shape={'targets':{}}
        for target,sgn,field in [('margin',-1,'spread_line'),('total',1,'total_line')]:
            counts=Counter(integer(float(g['home_score'])+sgn*float(g['away_score'])-float(g[field])) for g in train)
            shape['targets'][target]={'counts':counts}
        values={t:[] for t in ('margin','total')}
        for g in current:
            model=MarketDistribution(shape,-float(g['spread_line']),float(g['total_line']))
            for target,actual in [('margin',float(g['home_score'])-float(g['away_score'])),('total',float(g['home_score'])+float(g['away_score']))]:
                d=getattr(model,target); score=crps(d.pmf,actual)
                error=abs(score-float(saved[g['game_id']]['market_'+target+'_crps']))
                max_error=max(error,max_error)
                if error>1e-9:raise AssertionError('Historical saved loss mismatch')
                v={'game_id':g['game_id'],'season':year,'target':target,'crps':score}
                for level in (.5,.8,.95):
                    lo,hi=d.interval(level);v['coverage_'+str(int(level*100))]=int(lo<=actual<=hi)
                values[target].append(v)
        for target,vals in values.items():
            r={'season':year,'target':target,'n':len(vals),'max_training_season':max(int(g['season']) for g in train),'training_n':len(train),'crps':float(np.mean([v['crps'] for v in vals]))}
            for level in (50,80,95):
                r['coverage_'+str(level)]=float(np.mean([v['coverage_'+str(level)] for v in vals]))
                if abs(r['coverage_'+str(level)]-float(previous_cov[year,target]['rolling_'+str(level)]))>1e-12:raise AssertionError('Calibration mismatch')
            result.append(r)
    rng=np.random.default_rng(20260912); draws=rng.integers(0,10,size=(10000,10))
    for target in ('margin','total'):
        rs=[r for r in result if r['target']==target]; ns=np.array([r['n'] for r in rs]); summary={'target':target,'n':int(ns.sum())}
        for metric in ('crps','coverage_50','coverage_80','coverage_95'):
            sums=np.array([r[metric]*r['n'] for r in rs]); means=sums[draws].sum(axis=1)/ns[draws].sum(axis=1)
            summary[metric]=float(sums.sum()/ns.sum());summary[metric+'_95_interval']=list(map(float,np.quantile(means,[.025,.975])))
        summary['season_nominal_flags']={str(l):[r['season'] for r in rs if abs(r['coverage_'+str(l)]-l/100)>.03] for l in (50,80,95)}
        aggregate.append(summary)
    return {'label':'PRIOR_SEASON_MARKET_RESIDUAL_BASELINE_AT_RECONSTRUCTED_NFLVERSE_CLOSE; NOT EXACT_LIVE_T75_SELECTION_VALIDATION','max_saved_CRPS_difference':max_error,'seasonal':result,'aggregate':aggregate,'interval_method':'10000 whole-season bootstrap replicates; 10 seasons; descriptive uncertainty only'}


def run():
    inputs=read(BASE/'inputs.json'); config=inputs['config']; shape=read(ROOT/config['distribution']['path'])
    assert digest(ROOT/config['distribution']['path'])==config['distribution']['sha256']
    assert all(digest(ROOT/p)==sha for p,sha in config['code_hashes'].items())
    checks=arithmetic(shape)
    traces=[]; all_offers=[]; table=[]; weather=[]; rounding=[]
    screenshots={(r['away'],r['home']):r for r in rows(ROOT/'work/screenshot-lines-review-2026-09-12/screenshot-quotes.csv')}
    for record in inputs['records']:
        game=record['game']; gid=game['game_id']; receipt=record['capture']
        events=inputs['captures'][receipt['source']['sha256']]
        event=next(e for e in events if e['home_team']==game['home_team'] and e['away_team']==game['away_team'])
        qs=quotes(event,receipt,shape)
        centers={m:{'full':consensus({b:q for (b,k),q in qs.items() if k==m}),'leave_one_out':{b:consensus({j:q for (j,k),q in qs.items() if k==m},b) for b in BOOKS}} for m in MARKETS}
        picks=evaluate(shape,game,qs,centers,config['version'])
        assert [picks[m] for m in MARKETS]==record['picks']
        f=record['forecast']; ok=qualified(f,game)
        weather.append({'game_id':gid,'roof':game['roof'],'wind_mph':f.get('wind_mph'),'forecast_issued_at':f.get('forecast_issued_at'),'forecast_request_at':f.get('request_at'),'qualified_forecast':ok,'wind_rule':record['analysis']['measured']['wind_rule'],'weather_source_sha256':f.get('source_sha256'),'weather_after_odds_capture':bool(f.get('request_at') and f['request_at']>record['captured_at'])})
        for p in record['picks']:
            traces.append({'game_id':gid,'market':p['market'],'pick':p['side'],'line':p['line'],'book':p['book'],'price':p['price'],'fair_probability':p['fair_probability'],'EV':p['EV'],'filter_pass':p['filtered_subset'],'edge_source':p['edge_source'],'seed':p['seed'],'exact_tie_count':p['exact_tie_count'],'capture_at':record['captured_at'],'quote_updated_at':p['quote_updated_at'],'capture_sha256':receipt['source']['sha256'],'replay_matches':True,'caesars_present':('williamhill_us',p['market']) in qs})
        s=screenshots[game['away_abbr'],game['home_abbr']]
        for market in MARKETS:
            center=centers[market]['leave_one_out']['williamhill_us']['center']
            offers=([{'side':game['away_team'],'line':float(s['away_spread']),'price':float(s['away_spread_price'])},{'side':game['home_team'],'line':-float(s['away_spread']),'price':float(s['home_spread_price'])}] if market=='spreads' else [{'side':'Over','line':float(s['total']),'price':float(s['over_price'])},{'side':'Under','line':float(s['total']),'price':float(s['under_price'])}])
            pair=[]
            for offer in offers:
                p=probabilities(shape,market,center,offer,game['home_team']);fair=p['conditional_win'];ev=p['win']*(decimal_odds(offer['price'])-1)-p['loss']
                sensitivities=[]
                for delta in (-.5,0,.5):
                    z=probabilities(shape,market,center+delta,offer,game['home_team']);sensitivities.append(z['win']*(decimal_odds(offer['price'])-1)-z['loss'])
                side=game['away_abbr'] if offer['side']==game['away_team'] else game['home_abbr'] if offer['side']==game['home_team'] else offer['side']
                row={'game_id':gid,'market':market,'side':side,'line':offer['line'],'price':offer['price'],'book':'Caesars (user-context assumption)','quote_time':'UNKNOWN','source':'screenshot-quotes.csv image '+s['image'],'conditional_fair_probability':fair,'win_probability':p['win'],'push_probability':p['push'],'EV':ev,'fair_price':american(fair),'price_edge_cents':price_edge(fair,offer['price']),'arithmetic_filter_pass':qualifies(fair,offer['price']),'reference_center':center,'reference_capture_at':record['captured_at'],'sensitivity_EV_min':min(sensitivities),'sensitivity_EV_max':max(sensitivities),'check_current_price':True,'published_side':picks[market]['side'],'published_source':picks[market]['edge_source']}
                pair.append(row);all_offers.append(row)
            best=max(pair,key=lambda r:r['EV'])
            diagnostic=(best['side']+' '+f'{best["line"]:+g}'+' '+f'{best["price"]:+g}')
            table.append({**best,'diagnostic_offer':diagnostic,'lean':'NO INFORMED LEAN' if best['EV']<=0 else diagnostic,'verdict':'INSUFFICIENT DATA','direction_basis':'market-price-driven diagnostic; not independent model evidence','reason_for':f'Highest estimated return of the two screenshot sides ({best["EV"]*100:+.2f}%); not necessarily profitable','reason_against':'Unknown quote time; no matched Caesars capture; '+('negative modeled EV' if best['EV']<=0 else 'out-of-time reference')+'; inactives unknown','wind_mph':f.get('wind_mph'),'wind_rule':record['analysis']['measured']['wind_rule'],'elo_disagreement_diagnostic_only':record['analysis']['measured'].get('elo_disagreement')})
            rounding.append({'game_id':gid,'market':market,'continuous_consensus_center':center,'effective_integer_center':integer(center)})
    history=historical()
    published=read(BASE/'published-board.json'); local=inputs['board']
    week1=lambda b:[g for g in b['games'] if g['week']==1]
    assert week1(published)==week1(local)
    report={'experiment_id':'week1-usefulness-audit-v1','protocol_sha256':digest(BASE/'protocol.json'),'inputs_sha256':digest(BASE/'inputs.json'),'credits_spent':0,'production_changes':False,'frozen_hashes_verified':len(config['code_hashes']),'arithmetic_checks_passed':len(checks),'arithmetic_checks':checks,'live_replay_picks':len(traces),'live_trace':traces,'website':{'week1_games_identical':True,'week_records_identical':published['week_records']==local['week_records'],'content_sha256':published['content_sha256'],'check_record':'website-check.json','other_weeks_difference':'Reader changes waiting-message text for uncaptured games; Week 1 is identical'},'shape':{'sha256':config['distribution']['sha256'],'sample_sizes':{k:v['n'] for k,v in shape['targets'].items()},'training_population':shape['population'],'integer_rule':shape['integer_rule']},'exact_live_validation':{'status':'PREDICTIVE_VALUE_UNVERIFIED','historical_paired_n':0,'live_CRPS':None,'independent_baseline_CRPS':None,'reason':'Saved 2015-2025 schedules have reconstructed closing lines, not simultaneous multi-book pre-cutoff quotes required by inverse-power-devig/leave-one-out selection. Frozen live shape includes all 2015-2025 results. Applying it to those same games would be in-sample. Existing prior-season baseline scores below are context, not a substitute.','market_only_identity':'Live location is solely market-informed; no promoted independent football signal. Market-only residual baseline is the same family, not an independent superiority comparator.'},'historical_baseline_context':history,'week1_finals_descriptive':local['week_records'].get('1'),'screenshot_offer_count':len(all_offers),'screenshot_positive_EV_count':sum(r['EV']>0 for r in all_offers),'screenshot_filter_pass_count':sum(r['arithmetic_filter_pass'] for r in all_offers),'operational_PLAY_count':0,'caesars_captured_picks':sum(r['caesars_present'] for r in traces),'saved_live_positive_EV_count':sum(r['EV']>0 for r in traces),'saved_live_filter_pass_count':sum(r['filter_pass'] for r in traces),'saved_live_tiebreak_label_count':sum(r['edge_source']=='tiebreak' for r in traces),'actual_seeded_ties':sum(r['seed'] is not None for r in traces),'table':table,'weather':weather,'quantization':rounding,'findings':['No arithmetic discrepancy found by independent settlement and CRPS checks. No frozen runtime edit needed.','edge_source=tiebreak is broader than an actual random tie: it can label a unique maximum-EV choice with no positive price/line edge. Report seeded tie separately.','A price edge label can mean a better line, despite negative total EV. It is not proof of positive expected return.','Empirical location rounds to integers; half-point center perturbations can change inferred prices. Integer support alone does not prove conditional NFL key-number calibration.','Teaser display may refer to the opposite side from the straight selection; keep leg and ticket distinct. Near-miss teaser pricing is not PLAY.','Forecast repair postdates Friday odds. Stored forecast is pregame evidence, not evidence available at the Friday price capture. No observed-weather substitution.','LIVE means mutable pick, not fresh or executable odds. Screenshot time and current Caesars price remain unverified.'],'commands':{'verify':"/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'",'replay':'/opt/anaconda3/bin/python3.12 -B scripts/week1_usefulness_audit.py --verify'},'source_hashes':{p:digest(ROOT/p) for p in ['scripts/week1_usefulness_audit.py','work/screenshot-lines-review-2026-09-12/screenshot-quotes.csv','work/screenshot-lines-review-2026-09-12/screenshot-sources.json','work/harvest-elo-v2/run-2/experiment.json','work/harvest-elo-v2/run-2/paired-losses.csv','work/teaser-calibration-situations-v1/run-2/calibration.csv',str(Path(read(ROOT/'work/harvest-elo-v1/protocol.json')['schedules']))]}}
    return report, {'caesars-all-offers.csv':all_offers,'game-table.csv':table,'live-trace.csv':traces,'weather.csv':weather,'historical-baseline.csv':history['seasonal']}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--verify',action='store_true');args=parser.parse_args()
    result,tables=run()
    outputs={'experiment.json':encode(result),**{name:csv_bytes(data) for name,data in tables.items()}}
    for name,data in outputs.items():
        path=BASE/name
        if args.verify or path.exists():
            if path.read_bytes()!=data:raise AssertionError('Audit replay mismatch: '+name)
        else:path.write_bytes(data)
    print(json.dumps({'experiment':result['experiment_id'],'offline_replay':'PASS','arithmetic_checks_passed':result['arithmetic_checks_passed'],'live_picks_reproduced':result['live_replay_picks'],'screenshot_offers':result['screenshot_offer_count'],'positive_EV':result['screenshot_positive_EV_count'],'filter_pass':result['screenshot_filter_pass_count'],'credits_spent':0},indent=2))
