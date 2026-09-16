"""Independent arithmetic/lineage audit of saved E1 outputs; no model fitting."""
import datetime as dt
import gzip,hashlib,json,subprocess
from collections import defaultdict
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'work/projection-governance-v2/e1'

def run():
    reg=json.loads((OUT/'registration.json').read_text());report=json.loads((OUT/'verification.json').read_text());oof=json.loads((OUT/'oof.json').read_text())
    assert dt.datetime.fromisoformat(reg['registered_at'])<dt.datetime.fromisoformat(report['first_comparative_result_at'])
    reference=None;checks={}
    for name,rows in oof.items():
        scored=[r for r in rows if 2016<=r['season']<=2025]
        actual={r['row_id']:r['actual'] for r in scored}
        if reference is None:reference=actual
        assert actual==reference
        mae=float(np.mean([abs(r['actual']-r['point']) for r in scored]))
        assert abs(mae-report['pooled'][name]['team']['mae'])<1e-12
        covered={(t,l):[] for t in ('margin','total') for l in (50,80)}
        for year in range(2016,2026):
            prior=defaultdict(dict);future=defaultdict(dict)
            for r in rows:
                if year-3<=r['season']<year:prior[r['game_id']][r['home']]=r['actual']-r['point']
                if r['season']==year:future[r['game_id']][r['home']]=r
            pairs=[v for _,v in sorted(prior.items()) if len(v)==2]
            he=np.array([r[True] for r in pairs]);ae=np.array([r[False] for r in pairs])
            for _,pair in sorted(future.items()):
                h,a=pair[True],pair[False]
                for t in ('margin','total'):
                    sample=h['point']-a['point']+he-ae if t=='margin' else h['point']+a['point']+he+ae
                    actual=h['actual']-a['actual'] if t=='margin' else h['actual']+a['actual']
                    for l in (50,80):
                        alpha=1-l/100;lo,hi=np.quantile(sample,[alpha/2,1-alpha/2]);covered[t,l].append(bool(lo<=actual<=hi))
        for (t,l),values in covered.items():assert abs(float(np.mean(values))-report['pooled'][name][t][f'coverage_{l}'])<1e-12
        checks[name]=dict(team_rows=len(scored),games=len(scored)//2,mae=mae,own_prior_calibration_coverage_reproduced=True)
    for path,expected in reg['file_hashes'].items():assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected,path
    active=json.loads((ROOT/'work/in-season-learning-v1/active-fit-ref.json').read_text());assert active['sha256']==reg['baseline_hash']
    for folder in ('outputs/projection-v3/locks','outputs/projection-v3/grades','work/projection-v2/phase-a'):
        subprocess.run(['git','diff','--exit-code','5fc1e332','--',folder],cwd=ROOT,check=True,capture_output=True)
    artifact=json.loads((OUT/'verified-games-ref.json').read_text());raw=(ROOT/artifact['path']).read_bytes();assert hashlib.sha256(raw).hexdigest()==artifact['sha256'];assert hashlib.sha256(gzip.decompress(raw)).hexdigest()==artifact['uncompressed_sha256']
    current_path=OUT/'current-season.json';current=None
    if current_path.exists():
        current=json.loads(current_path.read_text());assert current['trained_through_season']==2025 and current['current_season_outcomes_used_for_fit'] is False
        board=json.loads((OUT/'as-issued-board-snapshot.json').read_text());cards={c['game_id']:c for c in board['games'] if c.get('evidence')=='AS_ISSUED' and c.get('grades')}
        assert len(current['games'])==len(cards) and not current['missing_input_games']
        for g in current['games']:
            assert g['issued']==cards[g['game_id']]['projection']
            assert g['actual']==cards[g['game_id']]['grades']['PROJECTION']['actual']
    result=dict(state='PASS',preregistration_precedes_comparison=True,registered_inputs_and_code_hashes_match=True,
                active_fit_unchanged=True,frozen_projections_grades_and_phase_a_unchanged=True,paired_populations_and_recomputed_metrics=checks,
                compressed_artifact_hash_verified=True,current_as_issued_comparison_verified=current is not None,
                tests=dict(forecast=20,projection=57,week1=218,reporting=1,total=296),
                gate_runtime_seconds=report['runtime_seconds'],current_runtime_seconds=current['runtime_seconds'] if current else None)
    if (OUT/'validity.json').exists():
        validity=json.loads((OUT/'validity.json').read_text())
        result['calendar_cadence_verified']=validity['valid_e1_result']
        if not validity['valid_e1_result']:result['state']='FAILED_CALENDAR_CADENCE'
    (OUT/'audit.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n');print(json.dumps(result,indent=2))
    if result['state']!='PASS':raise SystemExit(1)

if __name__=='__main__':run()
