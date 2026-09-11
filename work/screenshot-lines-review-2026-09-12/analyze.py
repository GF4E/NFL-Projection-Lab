"""Offline screenshot diagnostic. Never calls a provider or changes live picks."""
import csv,datetime,hashlib,json,subprocess,math
from pathlib import Path
from engine.pricing import decimal_odds,power_devig,price_edge,american
from engine.model_pick import probabilities
from engine.market_distribution import wong
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
REFERENCE='77035aa7fc5ddd4ee8dc6ec357c941f1485e0450'
def pinned(path):
    return json.loads(subprocess.check_output(['git','show',REFERENCE+':'+path],cwd=ROOT))
def run():
    config=pinned('work/model-pick-v1/runtime-config.json')
    raw=subprocess.check_output(['git','show',REFERENCE+':'+config['distribution']['path']],cwd=ROOT)
    assert hashlib.sha256(raw).hexdigest()==config['distribution']['sha256']
    shape=json.loads(raw);quotes=list(csv.DictReader((OUT/'screenshot-quotes.csv').open()));rows=[];teasers=[];vig=[]
    assert len(quotes)==14 and len({(r['away'],r['home']) for r in quotes})==14
    for r in quotes:
        game_id=f"2026_01_{r['away']}_{r['home']}";live=pinned(f'outputs/model-pick-v1/live/{game_id}.json');game=live['game']
        pairs={'spreads':[(game['away_team'],float(r['away_spread']),int(r['away_spread_price'])),(game['home_team'],-float(r['away_spread']),int(r['home_spread_price']))], 'totals':[('Over',float(r['total']),int(r['over_price'])),('Under',float(r['total']),int(r['under_price']))], 'moneyline':[(game['away_team'],0,int(r['away_moneyline'])),(game['home_team'],0,int(r['home_moneyline']))]}
        for market,pair in pairs.items():
            fair,k=power_devig([x[2] for x in pair]);assert abs(sum(fair)-1)<1e-12
            vig.append({'game_id':game_id,'market':market,'overround_percent':100*(sum(1/decimal_odds(x[2]) for x in pair)-1),'first_side':pair[0][0],'first_side_power_fair_probability':fair[0],'second_side':pair[1][0],'second_side_power_fair_probability':fair[1]})
            if market=='moneyline':continue
            center=live['consensus'][market]['leave_one_out']['williamhill_us']['center']
            for side,line,price in pair:
                offer={'side':side,'line':line,'price':price};p=probabilities(shape,market,center,offer,game['home_team']);assert abs(p['win']+p['loss']+p['push']-1)<1e-12
                prob=p['conditional_win'];edge=price_edge(prob,price);ev=p['win']*(decimal_odds(price)-1)-p['loss']
                pick=next(x for x in live['picks'] if x['market']==market)
                rows.append({'game_id':game_id,'market':market,'side':side,'line':line,'price':price,'fair_probability_conditional':prob,'fair_price':american(prob),'win':p['win'],'push':p['push'],'EV_per_unit':ev,'edge_cents':edge,'diagnostic_filter_pass':.60<=prob<=.70 and edge>=10,'reference_center':center,'reference_captured_at':live['captured_at'],'saved_pick_side':pick['side'],'saved_pick_line':pick['line'],'saved_pick_price':pick['price'],'saved_pick_book':pick['book'],'status':'SCREENSHOT_DIAGNOSTIC_NOT_LOCKED'})
                if market=='spreads' and wong(line):
                    leg=probabilities(shape,market,center,{**offer,'line':line+6},game['home_team'])
                    teasers.append({'game_id':game_id,'side':side,'line':line,'teased_line':line+6,'model_win_probability':leg['win'],'model_push_probability':leg['push'],'key_numbers':'3,7','ticket_price_visible':False,'status':'CANDIDATE_ONLY'})
    assert len(rows)==56 and len(vig)==42
    def write(name,values):
        with (OUT/name).open('w',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(values[0]));w.writeheader();w.writerows(values)
    write('model-diagnostic.csv',rows);write('teaser-candidates.csv',teasers);write('market-overround.csv',vig)
    exp={'name':OUT.name,'analyzed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'input':'screenshot-quotes.csv','input_sha256':hashlib.sha256((OUT/'screenshot-quotes.csv').read_bytes()).hexdigest(),'source_metadata':'screenshot-sources.json','assumed_book':'Caesars based on user context; bookmaker name not visible in these screenshots','capture_date_and_timezone':'UNKNOWN; status-bar time alone is insufficient','reference_commit':REFERENCE,'reference_distribution':config['distribution'],'method':'Evaluate manually transcribed screenshot spread/total prices against frozen empirical residual distribution and saved Friday consensus excluding Caesars. Do not update consensus, picks, locks, logs or site. Single-book power devig is market-implied information, not independent predictive evidence.','evidence_label':'DIFFERENT_TIMES_SCREENSHOT_DIAGNOSTIC_NOT_EXECUTABLE','games':len(quotes),'spread_total_offers':len(rows),'filter_pass_count':sum(r['diagnostic_filter_pass'] for r in rows),'positive_EV_count':sum(r['EV_per_unit']>0 for r in rows),'wong_candidates':teasers,'highest_diagnostic_EV':sorted(rows,key=lambda r:r['EV_per_unit'],reverse=True)[:5],'highest_overround':max(vig,key=lambda r:r['overround_percent']),'odds_credits_spent':0,'live_records_modified':False,'executed_bets_recorded':False,'checks':['14 unique games after removing overlapping screenshot rows','Pinned distribution hash matches runtime manifest','All 42 power-devig pairs sum to one within 1e-12','All 56 model win/loss/push triples sum to one within 1e-12','All 56 spread/total offers evaluated'],'check_count':5,'commands':{'replay':'PYTHONPATH=. /opt/anaconda3/bin/python3.12 -B work/screenshot-lines-review-2026-09-12/analyze.py'},'limitations':['Screenshot prices may have changed; no capture date/timezone is established','Saved Friday cross-book reference is not contemporaneous with the screenshots','Empirical diagnostic probabilities are not independently calibrated for these offers','Teaser ticket odds are absent; straight-market juice is not teaser pricing','No current weather inference added; previously saved forecast remains dated evidence']}
    exp['teaser_break_even']={str(p):math.sqrt(abs(p)/(100+abs(p))) for p in (-110,-120)}
    exp['teaser_break_even_basis']='Per-leg break-even for two equal-probability independent legs with no pushes; not an established joint model'
    exp['standard_minus110_pair_overround_percent']=100*(2*110/210-1)
    (OUT/'experiment.json').write_text(json.dumps(exp,indent=2)+'\n')
    print(json.dumps({k:exp[k] for k in ('games','spread_total_offers','filter_pass_count','positive_EV_count','highest_overround')}));print(json.dumps(teasers,indent=2))
if __name__=='__main__':run()
