"""Captured-data verification, independent direct-formula scores; no fitting."""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import statistics
import sys
import time

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection.weekly_diagnostics import build


def check(root,output):
    root=Path(root);output=Path(output);output.mkdir(parents=True,exist_ok=True);start=time.monotonic()
    names=[p for kind in ('locks','grades') for p in (root/'outputs/projection-v3'/kind).glob('*.json')]
    names.append(root/'work/in-season-learning-v1/active-fit-ref.json')
    before={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in names}
    board_path=root/'outputs/projection-v3/board.json';board_raw=board_path.read_bytes();board=json.loads(board_raw)
    report=build(root,board['games'])
    spec=importlib.util.spec_from_file_location('independent_contract',root/'work/engine-rebuild/audit_forecast_contract.py')
    independent=importlib.util.module_from_spec(spec);spec.loader.exec_module(independent)
    registry=json.loads((root/'work/engine-rebuild/legacy-calibration-map.json').read_bytes())
    expected={};checks=0;max_error=0.
    def close(actual,wanted):
        nonlocal checks,max_error
        checks+=1
        if actual is None or wanted is None:
            assert actual is wanted;return
        error=abs(actual-wanted);max_error=max(max_error,error)
        assert error<1e-10,(actual,wanted)
    for row in report['records']:
        raw=(root/row['first_grade_ref']['path']).read_bytes()
        assert hashlib.sha256(raw).hexdigest()==row['first_grade_ref']['sha256']
        card=json.loads(raw);p=card['projection'];a=card['grades']['PROJECTION']['actual']
        shapes,ref,evidence=independent.resolve_shapes(root,card,registry)
        assert ref==row['calibration']['calibration_ref']
        computed={}
        for target,s in row['scores'].items():
            mass=independent.masses(shapes['team_points' if target.endswith('_points') else target],p[target]);y=a[target]
            error=y-p[target]
            crps=math.fsum(prob*abs(value-y) for value,prob in mass.items())-.5*math.fsum(px*pz*abs(x-z) for x,px in mass.items() for z,pz in mass.items())
            pit=math.fsum(prob for value,prob in mass.items() if value<y)+.5*mass.get(y,0.)
            vals={'point':p[target],'actual':y,'error':error,'absolute_error':abs(error),'crps':crps,'pit':pit,'negative_mass':math.fsum(prob for value,prob in mass.items() if value<0)}
            for k,v in vals.items():close(s[k],v)
            for level in ('50','80'):
                alpha=1-int(level)/100;lo=independent.quantile(mass,alpha/2);hi=independent.quantile(mass,1-alpha/2)
                band={'lower':lo,'upper':hi,'hit':lo<=y<=hi,'width':hi-lo,'interval_score':hi-lo+2/alpha*max(lo-y,0)+2/alpha*max(y-hi,0)}
                for k,v in band.items():close(s[level][k],v)
                vals[level]=band
            computed[target]=vals
        mass=independent.masses(shapes['margin'],p['margin']);prob=math.fsum(v for k,v in mass.items() if k>0)+.5*mass.get(0,0.)
        outcome=1 if a['margin']>0 else 0 if a['margin']<0 else .5
        close(row['winner']['brier'],(prob-outcome)**2)
        expected[row['game_id']]={'scores':computed,'winner':{'probability':prob,'outcome':outcome,'brier':(prob-outcome)**2}}
    for evidence,pop in report['populations'].items():
        for table in pop['tables']+pop['by_lineage']:
            selected=[r for r in report['records'] if r['evidence']==evidence and r['season']==table['season']
                      and (table['scope']=='season' or (r['week']==table['week'] if table['scope']=='week' else r['week']<=table['week']))
                      and ('lineage_key' not in table or r['lineage_key']==table['lineage_key'])]
            assert len(selected)==table['games']
            for target,fields in [('team_points',('home_points','away_points')),('margin',('margin',)),('total',('total',))]:
                values=[expected[r['game_id']]['scores'][f] for r in selected for f in fields];t=table['targets'][target];n=len(values)
                for key,val in {'n':n,'probability_n':n,'mae':statistics.mean(v['absolute_error'] for v in values),'rmse':math.sqrt(statistics.mean(v['error']**2 for v in values)),
                    'bias_actual_minus_projected':statistics.mean(v['error'] for v in values),'sigma':statistics.stdev(v['error'] for v in values) if n>1 else None,
                    'crps':statistics.mean(v['crps'] for v in values),'projected_sd':statistics.pstdev(v['point'] for v in values),'actual_sd':statistics.pstdev(v['actual'] for v in values)}.items():close(t[key],val)
                counts=[0]*10
                for v in values:counts[min(9,int(v['pit']*10))]+=1
                assert counts==t['pit_counts']
                for level in ('50','80'):
                    hits=sum(v[level]['hit'] for v in values)
                    for key,val in {'hits':hits,'n':n,'coverage':hits/n,'width':statistics.mean(v[level]['width'] for v in values),'interval_score':statistics.mean(v[level]['interval_score'] for v in values)}.items():close(t[level][key],val)
            wins=[expected[r['game_id']]['winner'] for r in selected]
            close(table['winner']['brier'],statistics.mean(r['brier'] for r in wins))
            for b in table['winner']['reliability']:
                subset=[r for r in wins if min(9,int(r['probability']*10))==b['bin']]
                close(b['n'],len(subset))
                close(b['forecast'],statistics.mean(r['probability'] for r in subset) if subset else None)
                close(b['observed'],statistics.mean(r['outcome'] for r in subset) if subset else None)
    assert report==build(root,list(reversed(board['games'])))
    assert before=={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in names}
    sources=['engine/projection/weekly_diagnostics.py','scripts/projection_learning.py','work/engine-rebuild/check_weekly_diagnostics.py']
    result={'state':'CAPTURED_FIRST_GRADE_DIAGNOSTICS_VERIFIED','games':len(report['records']),'independent_scalar_checks':checks,'maximum_absolute_difference':max_error,
            'row_order_invariant':True,'protected_originals_unchanged':len(before),'board_ref':{'path':str(board_path.relative_to(root)),'sha256':hashlib.sha256(board_raw).hexdigest()},
            'source_files':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in sources},'provenance_counts':report['provenance_counts'],'shortfalls':report['shortfalls'],
            'elapsed_seconds':time.monotonic()-start,'scope':'Read-only original grade/calibration arithmetic; bootstrap fixture verifies pairing. No improved accuracy, fitted candidate, independent historical holdout, activation or public-site claim.'}
    (output/'report.json').write_text(json.dumps(report,sort_keys=True,indent=2,allow_nan=False)+'\n')
    result['report_sha256']=hashlib.sha256((output/'report.json').read_bytes()).hexdigest()
    (output/'verification.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=ROOT);p.add_argument('--output',type=Path,required=True);a=p.parse_args();check(a.root,a.output)
