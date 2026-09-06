"""Frozen-population post-result interval-mass diagnosis; never fit or score."""
import hashlib
import json
from pathlib import Path
import signal
import sys
import time

ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')
RUN = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02c-v1-2d9c91d803f1c991')
INDEX_SHA = 'ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab'
MANIFEST_SHA = '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38'
DIST_SHA = 'aaa557304054788603f29d56a11fa7e4fe98d3f32b7e699c7f9919f8d7b41ba1'
SCOPE = ROOT / '.planning/engine-os/quality/2026-09-05-rf02c-diagnosis.md'
sys.path.insert(0, str(ROOT / 'scripts'))
import numpy as np
from research_score_contract import read_regular
from research_score_distribution import JointBase
from research_score_run import recover_distribution, rss_mb
from research_score_models import BASE_SEED

FAMILIES = ('N0', 'S1', 'E1', 'E2')
TARGETS = ('home', 'away', 'margin', 'total')
FIELDS = ('forecast_mass', 'realized_coverage', 'coverage_residual', 'lower_forecast', 'lower_realized',
          'lower_residual', 'upper_forecast', 'upper_realized', 'upper_residual',
          'predicted_variance', 'squared_residual', 'variance_residual', 'interval_width', 'mean_error')
RESIDUALS = ('coverage_residual', 'lower_residual', 'upper_residual', 'variance_residual')


def sha(raw): return hashlib.sha256(raw).hexdigest()


def encoded(value): return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def budget(start):
    if time.monotonic() - start > 300: raise TimeoutError('diagnostic_300_second_cap')
    if rss_mb() > 4096: raise RuntimeError('diagnostic_4096_MiB_cap')


def bootstrap(metadata, values, length, start):
    """Frozen season/within-season moving-block draws; descriptive pointwise CIs."""
    keys = sorted(set(map(tuple, metadata))); seasons = sorted({s for s, _ in keys}); assert len(seasons) == 12
    index = {key: i for i, key in enumerate(keys)}
    groups = [np.array([index[key] for key in keys if key[0] == s]) for s in seasons]
    weights = np.zeros((10000, len(keys)), dtype=np.int16)
    rng = np.random.Generator(np.random.PCG64(BASE_SEED + length))
    for member in range(10000):
        if member % 1000 == 0: budget(start)
        for s in rng.integers(0, len(seasons), size=len(seasons)):
            weeks = groups[s]
            starts = rng.integers(0, len(weeks)-length+1, size=(len(weeks)+length-1)//length)
            sample = np.concatenate([weeks[j:j+length] for j in starts])[:len(weeks)]
            np.add.at(weights[member], sample, 1)
    gamegroups = np.array([index[tuple(row)] for row in metadata]); counts = np.bincount(gamegroups, minlength=len(keys))
    sums = np.zeros((len(keys),) + values.shape[1:]); np.add.at(sums, gamegroups, values)
    flat = sums.reshape(len(keys), -1); w = weights.astype(float)
    draws = (w @ flat) / (w @ counts)[:, None]
    assert np.all(np.isfinite(draws)); budget(start)
    return np.quantile(draws, [.025, .975], axis=0, method='linear').reshape((2,) + values.shape[1:])


def main():
    start = time.monotonic()
    def expire(signum, frame): raise TimeoutError('diagnostic_300_second_cap')
    signal.signal(signal.SIGALRM, expire); signal.setitimer(signal.ITIMER_REAL, 300)
    output = WORK / 'rf02c-interval-mass-diagnostic-v1'
    output.mkdir()  # Existing attempt is never silently resumed or overwritten.
    occurrences = []; metadata = []; games_all = []; checked = {}; mapper_cache = {}
    manifest = {'diagnostic': 'original80_interval_mass_all16cells', 'runManifestSha256': MANIFEST_SHA,
        'runIndexSha256': INDEX_SHA, 'scriptSha256': sha(read_regular(Path(__file__))),
        'scopeSha256': sha(read_regular(SCOPE)), 'budgetSeconds': 300, 'budgetMiB': 4096,
        'families': FAMILIES, 'targets': TARGETS, 'fields': FIELDS,
        'primary': '2013-2024 development', 'separateDiagnostic': '2025 exposed',
        'bootstrap': {'members': 10000, 'blocks': [1,3,6], 'seed': BASE_SEED,
                      'intervals': 'pointwise95percentile_for_each_cell_and_residual_no_simultaneous_adjustment'},
        'footballFits': 0, 'numericalFits': 0, 'scoreCalls': 0, 'newAcceptanceGate': False}
    (output / 'manifest.json').write_bytes(encoded(manifest))
    try:
        raw = read_regular(RUN / 'artifact-index.json'); assert sha(raw) == INDEX_SHA
        index = json.loads(raw)['files']
        def get(name):
            raw = read_regular(RUN / name); pointer = index[name]
            assert sha(raw) == pointer['sha256'] and len(raw) == pointer['bytes'], name
            checked[name] = pointer['sha256']; return json.loads(raw)
        m = get('manifest.json'); assert checked['manifest.json'] == MANIFEST_SHA
        assert sha(read_regular(ROOT / 'scripts/research_score_distribution.py')) == DIST_SHA == m['code_hashes']['scripts/research_score_distribution.py']
        for name in ('scripts/research_score_contract.py','scripts/research_score_run.py','scripts/research_score_models.py'):
            assert sha(read_regular(ROOT / name)) == m['code_hashes'][name]
        terminal = get('terminal-decision.json'); assert terminal['status'] == 'reject_all'
        for name in sorted(n for n in index if n.startswith('outer-losses-')):
            budget(start)
            suffix = name.removeprefix('outer-losses-').removesuffix('.json'); year, week = map(int, suffix.split('-'))
            forecasts = get('forecasts-' + suffix + '.json')['outer_selected_forecasts']
            losses = get(name)
            lm = {(row['family'], row['game_id']): row for row in losses if row['variant'] == 'full'}
            fm = {(row['family'], row['game_id']): row for row in forecasts if row['variant'] == 'full'}
            games = list(dict.fromkeys(row['game_id'] for row in forecasts))
            assert len(lm) == len(fm) == len(games)*4
            assert set(lm) == set(fm) == {(f,g) for g in games for f in FAMILIES}
            for game in games:
                cells = np.zeros((4,4,len(FIELDS)))
                for fi, family in enumerate(FAMILIES):
                    record = fm[family,game]; loss = lm[family,game]; assert record['native_failure'] == loss['native_failure']
                    d = record['distribution']; pointer = d['mapper']; cache_key = (pointer['name'],pointer['sha256'])
                    if cache_key not in mapper_cache:
                        obj = get(pointer['name']); assert checked[pointer['name']] == pointer['sha256']
                        mapper_cache[cache_key] = JointBase(np.array(obj['atoms']),np.array(obj['weights']),obj['b'],obj['epsilon'])
                    # This helper invokes components(theta), verifies exact alpha hash,
                    # beta/rates/mean/covariance and constructs a distribution; no fit.
                    dist = recover_distribution(mapper_cache[cache_key],d); mu,cov = dist.moments()
                    assert not dist.independent and np.all(np.isfinite(cov))
                    metric = loss['metrics']
                    for ti,target in enumerate(TARGETS):
                        lower=metric[target+'_lower_80'];upper=metric[target+'_upper_80'];y=metric[target+'_observed'];mean=metric[target+'_mean']
                        assert lower<=upper and lower==int(lower) and upper==int(upper)
                        predicted = {'home':mu[0], 'away':mu[1], 'margin':mu[0]-mu[1], 'total':mu.sum()}[target]
                        assert predicted == mean
                        variance = {'home':cov[0,0], 'away':cov[1,1], 'margin':cov[0,0]+cov[1,1]-2*cov[0,1], 'total':cov[0,0]+cov[1,1]+2*cov[0,1]}[target]
                        flo=dist.cdf(target,lower-1);fhi=dist.cdf(target,upper);mass=fhi-flo
                        hit=float(lower<=y<=upper);lo=float(y<lower);hi=float(y>upper)
                        assert hit==metric[target+'_coverage_80'] and upper-lower==metric[target+'_width_80']
                        assert flo<.1 and fhi>=.9 and .8-1e-12<=mass<=1 and variance>0
                        squared=(y-mean)**2
                        cells[fi,ti] = [mass,hit,hit-mass,flo,lo,lo-flo,1-fhi,hi,hi-(1-fhi),variance,squared,squared-variance,upper-lower,mean-y]
                assert np.all(np.isfinite(cells))
                occurrences.append(cells);metadata.append((year,week));games_all.append(game)
            if len(metadata)%250<20:
                print(json.dumps({'phase':'interval_mass','games':len(metadata),'seconds':time.monotonic()-start}),flush=True)
        assert len(games_all)==len(set(games_all))==3407
        array=np.stack(occurrences);meta=np.array(metadata);dev=meta[:,0]<=2024;diag=meta[:,0]==2025
        assert dev.sum()==3135 and diag.sum()==272
        np.savez_compressed(output/'occurrences.npz',values=array,metadata=meta,game_ids=np.array(games_all),fields=np.array(FIELDS))
        result={'status':'complete','games':3407,'cells':16,'checkedArtifactCount':len(checked),'subsets':{},
            'interpretationLimits':['Post-result descriptive diagnosis, not new acceptance or causality',
                'Pointwise intervals across16cells and4residuals; no simultaneous correction',
                '2025 exposed sample reported separately without12-season-bootstrap confidence intervals',
                'Variance comparison uses squared residual around forecast mean, includes mean bias',
                'No fitting, proper scoring, restart, calibrated nominal replacement or threshold change']}
        for label,mask in [('development',dev),('exposed2025',diag)]:
            summaries={}
            for fi,family in enumerate(FAMILIES):
                for ti,target in enumerate(TARGETS):
                    means=array[mask,fi,ti].mean(axis=0);summary=dict(zip(FIELDS,map(float,means)))
                    summary['squaredResidualToPredictedVarianceRatio']=summary['squared_residual']/summary['predicted_variance']
                    summary['forecastMassAboveNominal80']=summary['forecast_mass']-.8
                    summary['realizedAboveNominal80']=summary['realized_coverage']-.8
                    summaries[family+':'+target]=summary
            result['subsets'][label]={'games':int(mask.sum()),'cells':summaries}
        resid_indices=[FIELDS.index(n) for n in RESIDUALS];residuals=array[dev][:,:,:,resid_indices]
        for length in (1,3,6):
            bounds=bootstrap(meta[dev],residuals,length,start)
            for fi,f in enumerate(FAMILIES):
                for ti,t in enumerate(TARGETS):
                    cell=result['subsets']['development']['cells'][f+':'+t]
                    cell.setdefault('pointwiseResidualBounds',{})[str(length)]={name:{'lower':float(bounds[0,fi,ti,j]),'upper':float(bounds[1,fi,ti,j])} for j,name in enumerate(RESIDUALS)}
            print(json.dumps({'phase':'descriptive_bootstrap','block':length}),flush=True)
        budget(start);result.update(seconds=time.monotonic()-start,peakRssMiB=rss_mb())
        (output/'checked-artifacts.json').write_bytes(encoded(checked));(output/'result.json').write_bytes(encoded(result))
        print(json.dumps({'status':'complete','result':str(output/'result.json'),'seconds':result['seconds']}),flush=True)
    except BaseException as exc:
        partial={'status':'diagnostic_failed','reason':str(exc),'gamesCompleted':len(metadata),'seconds':time.monotonic()-start,'peakRssMiB':rss_mb(),'automaticRestart':False}
        (output/'partial-status.json').write_bytes(encoded(partial))
        if occurrences: np.savez_compressed(output/'partial-occurrences.npz',values=np.stack(occurrences),metadata=np.array(metadata),game_ids=np.array(games_all),fields=np.array(FIELDS))
        (output/'checked-artifacts.json').write_bytes(encoded(checked));raise
    finally:signal.setitimer(signal.ITIMER_REAL,0)


if __name__=='__main__':main()
