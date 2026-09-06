"""Offline power sensitivity only. Never fits forecasts or calls providers."""
import argparse, csv, hashlib, json, math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rfcomp09-v1-d78471e3d2ffdb18')
GAINS = [0., .01, .025, .05, .075, .10]

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def load_pairs():
    index_path = ARCHIVE/'completion/artifact-index.json'
    assert digest(index_path) == 'd9c6742f28e144c2c641cd97034b9ccf72645baf33de772b7e2f3a9530d98220'
    index = json.loads(index_path.read_text())['files']
    pins = {str(index_path): digest(index_path)}
    rows = []
    for p in sorted(ARCHIVE.glob('outer-losses-*.json')):
        season, week = map(int, p.stem.split('-')[-2:])
        if not 2013 <= season <= 2024: continue
        sha = digest(p)
        assert sha == index[p.name]['sha256'], p
        pins[str(p)] = sha
        pairs = {}
        for row in json.loads(p.read_text()):
            if row['variant'] != 'full' or row['family'] not in ('E3', 'N0'): continue
            key = (row['game_id'], row['family'])
            assert key not in pairs, key
            pairs[key] = [row['metrics'][t+'_crps'] for t in ('margin','total')]
        ids = sorted({g for g, f in pairs})
        for g in ids:
            rows.append((season, week, g, *pairs[g,'E3'], *pairs[g,'N0']))
    scorecard = ROOT/'outputs/team-scorecard.csv'
    pins[str(scorecard)] = digest(scorecard)
    summaries = list(csv.DictReader(scorecard.open()))
    series = sorted({r['series'] for r in summaries})
    expected = {'E1','E2','E3','N0','S1'}
    assert all(s.split(':')[0] in expected for s in series), 'New series requires market-baseline inspection'
    values = np.array([r[3:] for r in rows], float)
    assert len({r[2] for r in rows}) == len(rows)
    assert np.all(np.isfinite(values)) and np.all(values>0)
    for family, offset in [('E3',0),('N0',2)]:
        summary = next(r for r in summaries if r['series']==family+':full' and r['population']=='development')
        assert len(rows)==int(summary['games'])
        for i,t in enumerate(('margin','total')):
            assert abs(values[:,offset+i].mean()-float(summary[t+'_crps'])) < 1e-9
    seasons=[]
    for s in sorted({r[0] for r in rows}):
        weeks=[]
        for w in sorted({r[1] for r in rows if r[0]==s}):
            ix=[i for i,r in enumerate(rows) if r[0]==s and r[1]==w]
            weeks.append(values[ix].sum(axis=0))
        seasons.append(np.array(weeks))
    return seasons, values, pins, series

def sample_sums(seasons, horizon, block, count, rng):
    """Paired season draw then circular week blocks; all games retained per week."""
    result=np.zeros((count,4))
    for _ in range(horizon):
        chosen=rng.integers(len(seasons),size=count)
        for s, weeks in enumerate(seasons):
            ids=np.flatnonzero(chosen==s)
            if not len(ids): continue
            n=len(weeks)
            starts=rng.integers(n,size=(len(ids),math.ceil(n/block)))
            indexes=((starts[:,:,None]+np.arange(block))%n).reshape(len(ids),-1)[:,:n]
            result[ids] += weeks[indexes].sum(axis=1)
    return result

def lower_bounds(raw_ratios, calibration_ratios, population_ratio, gain, alpha):
    scale=(1-gain)/population_ratio
    # Basic bootstrap lower bound: estimate minus upper error quantile.
    errors=1-calibration_ratios*scale-gain
    upper=np.quantile(errors,1-alpha,axis=0,method='linear')
    return 1-raw_ratios*scale-upper

def run(record):
    config=record['config']
    seasons, values, pins, series=load_pairs()
    assert pins==record['input_sha256'], 'Source changed since registration'
    ratio=values[:,:2].sum(axis=0)/values[:,2:].sum(axis=0)
    cells=[]
    for horizon in (1,2,3):
        for block in (1,3,6):
            # Independent calibration and power streams, common draws across gains.
            seed=np.random.SeedSequence([config['seed'],horizon,block])
            a,b=seed.spawn(2)
            cal=sample_sums(seasons,horizon,block,10000,np.random.default_rng(a))
            sim=sample_sums(seasons,horizon,block,1000,np.random.default_rng(b))
            cr=cal[:,:2]/cal[:,2:]; sr=sim[:,:2]/sim[:,2:]
            for gain in GAINS:
                bounds=lower_bounds(sr,cr,ratio,gain,.025)
                claims={}
                for threshold in (0.,.01,.05):
                    passed=np.all(bounds>threshold,axis=1)
                    rate=float(passed.mean())
                    claims[str(threshold)]={'joint_successes':int(passed.sum()),'power':rate,'monte_carlo_se':math.sqrt(rate*(1-rate)/1000)}
                cells.append({'seasons':horizon,'block_weeks':block,'true_gain':gain,'replicates':1000,'claims_lower_bound_above':claims})
    feasible=[h for h in (1,2,3) if all(c['claims_lower_bound_above']['0.05']['power']>=.8 for c in cells if c['seasons']==h and c['true_gain']==.075)]
    return {'experiment_id':record['experiment_id'],'status':'complete','market_status':'MARKET_BASELINE_PENDING_STEP_3','family_size':2,'alpha_per_comparison':.025,'endpoint':min(feasible) if feasible else 'INFEASIBLE_WITHIN_3_SEASONS','cells':cells,'parity_status':'NOT_TESTED_TOLERANCE_UNDECLARED_AND_MARKET_BASELINE_ABSENT','source_integrity_after':all(digest(Path(p))==h for p,h in pins.items()),'E3_disposition':'unchanged_rejected','limitations':record['limitations']}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('mode',choices=['register','run','replay']); ap.add_argument('--experiment',default='cycle-one-power-v1'); args=ap.parse_args()
    folder=ROOT/'work'/args.experiment
    record_path=folder/'experiment.json'; result_path=folder/'result.json'
    if args.mode=='register':
        seasons,values,pins,series=load_pairs()
        folder.mkdir(exist_ok=False)
        record={'experiment_id':args.experiment,'status':'registered_before_simulation','input_sha256':pins,'code_sha256':digest(Path(__file__)),'scorecard_series':series,'paired_games':len(values),'population':'saved development 2013–2024; 2025 excluded; no model refit or rescoring','candidate_dependence_template':'E3:full saved losses, multiplicatively scaled separately by target; not an E3 performance test','market_status':'MARKET_BASELINE_PENDING_STEP_3','config':{'seed':2026090601,'gains':GAINS,'seasons':[1,2,3],'block_weeks':[1,3,6],'replicates_per_cell':1000,'calibration_resamples':10000,'family':['N0:margin','N0:total'],'family_size':2,'alpha':.05,'bonferroni_alpha':.025,'endpoint_threshold':.05,'endpoint_true_gain':.075,'power_target':.8,'diagnostic_thresholds':[0,.01,.05]},'method':'Independent archive-based calibration bank and outer synthetic trials. Resample seasons then circular week blocks, retain all games and both targets jointly. Scale candidate losses to each requested population mean gain. Basic one-sided bounds use the upper error quantile from calibration bank. Not nested trial-specific re-estimation. All targets must pass. Same draws across gains.','limitations':['Planning sensitivity conditional on saved loss dependence, not future success probability or predictive acceptance.','Archive-calibrated error bounds assume this dependence distribution is known. They do not measure additional uncertainty from estimating dependence on a future small sample.','One-season horizon resamples historical seasons as a planning mixture; no claim that one future season estimates between-season variation.','Zero-gain scenario and superiority thresholds do not constitute a parity test; tolerance remains undeclared.','Tier A registry backlogged; this is an N0-only planning family, not a Tier A or market superiority claim.']}
        with record_path.open('x') as f: json.dump(record,f,indent=2)
        print('REGISTERED',record_path)
    else:
        record=json.loads(record_path.read_text()); assert digest(Path(__file__))==record['code_sha256']
        result=run(record); assert result['source_integrity_after']
        if args.mode=='run':
            with result_path.open('x') as f: json.dump(result,f,indent=2)
            print('RESULT',result['endpoint'],result_path)
        else:
            assert result==json.loads(result_path.read_text()),'Replay mismatch'
            print('PASS exact immutable experiment replay')
if __name__=='__main__': main()
