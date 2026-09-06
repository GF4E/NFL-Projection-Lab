import json
import math
from pathlib import Path
import sys
import time

ROOT=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
sys.path.insert(0,str(ROOT/'scripts'))
import numpy as np
from research_score_contract import encoded,digest,read_regular,load_accepted
from research_score_run import recover_distribution,plain
from research_score_distribution import JointBase
from research_score_metrics import score_forecast

RUN=Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data/rf02s-v1-c4fc78f7beb8c9ee')
SPEC=ROOT/'.planning/engine-os/research-first/RF-02S-COST-DIAGNOSTIC.v1.md'
assert digest(read_regular(SPEC))=='b49cc393a72ca95f8a72f0df113f070373a12c649821cd88d1f265ee8c2bf633'
assert digest(read_regular(RUN/'artifact-index.json'))=='93d52799f823e92545ea6deef57b0bd5c8b3b97157fdbab66eb2a5cad1d34192'
index=json.loads(read_regular(RUN/'artifact-index.json'))['files']
files={}
for name,pointer in index.items():
    assert '/' not in name and '..' not in name
    raw=read_regular(RUN/name)
    assert digest(raw)==pointer['sha256'] and len(raw)==pointer['bytes']
    files[name]=raw
_,config,data,_=load_accepted(ROOT)
by_game={r['gameId']:r for r in data['records']}
rows=[];identities=set();mapper_cache={};started=time.perf_counter()
for week in (1,2):
    forecasts=json.loads(files[f'forecasts-2013-{week:02}.json'])['outer_selected_forecasts']
    archived={(r['family'],r['variant'],r['game_id']):r['metrics'] for r in json.loads(files[f'outer-losses-2013-{week:02}.json'])}
    for row in forecasts:
        descriptor=row['distribution'];name=descriptor['mapper']['name']
        if name not in mapper_cache:
            b=json.loads(files[name]);mapper_cache[name]=JointBase(np.array(b['atoms']),np.array(b['weights']),b['b'],b['epsilon'])
        fit=recover_distribution(mapper_cache[name],descriptor)
        original=fit.cdf;calls=[];seen=set();duplicate_seconds=0.
        def measured(target,value):
            global duplicate_seconds
            key=(target,math.floor(value))
            tick=time.perf_counter();result=original(target,value);seconds=time.perf_counter()-tick
            repeated=key in seen
            if repeated:duplicate_seconds+=seconds
            calls.append({'target':target,'argument':value,'key':list(key),'seconds':seconds,'repeated':repeated})
            seen.add(key)
            return result
        fit.cdf=measured
        game=by_game[row['game_id']];tick=time.perf_counter()
        metrics=plain(score_forecast(fit,[game['homeScore'],game['awayScore']],row['game_id'],double_grid=True,diagnostics=True))
        seconds=time.perf_counter()-tick
        key=(row['family'],row['variant'],row['game_id'])
        assert metrics==archived[key],('metric_mismatch',key)
        dkey=(row['game_id'],name,tuple(descriptor['theta']),descriptor['independent'])
        duplicate=dkey in identities;identities.add(dkey)
        rows.append({'key':list(key),'scoringSeconds':seconds,'cdfCalls':len(calls),'cdfUniqueKeys':len(seen),
                     'cdfSeconds':sum(c['seconds'] for c in calls),'repeatedCdfSeconds':duplicate_seconds,
                     'duplicateDistributionWithinGame':duplicate,'metricDictionaryExact':True,'calls':calls})
assert len(rows)==1280
summary={'occurrences':len(rows),'metricDictionariesExact':len(rows),'scoringSeconds':sum(r['scoringSeconds'] for r in rows),
         'cdfCalls':sum(r['cdfCalls'] for r in rows),'cdfUniqueKeysWithinOccurrence':sum(r['cdfUniqueKeys'] for r in rows),
         'cdfSeconds':sum(r['cdfSeconds'] for r in rows),'repeatedCdfSeconds':sum(r['repeatedCdfSeconds'] for r in rows),
         'duplicateDistributionsWithinGame':sum(r['duplicateDistributionWithinGame'] for r in rows),
         'elapsedSeconds':time.perf_counter()-started,'interpretation':'Repeated-call time is a profiling upper bound, not measured optimization speedup.',
         'footballFits':0,'newForecasts':0,'providerRequests':0,'originalIndexSha256':digest(read_regular(RUN/'artifact-index.json')),
         'protocolSha256':digest(read_regular(SPEC)),'diagnosticSourceSha256':digest(read_regular(Path(__file__).resolve()))}
out=Path(__file__).parent/'rf02s_cost_diagnostic_result.json'
with out.open('xb') as stream:stream.write(encoded({'summary':summary,'occurrences':rows}))
print(json.dumps(summary,indent=2))
