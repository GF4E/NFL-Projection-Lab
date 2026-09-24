"""Apply the new read-only acceptance check to independently reconstructed locks.

Captured September 22 records, not a claim about today's deployment. No model,
distribution, fit, gate or release reference is written by this qualification.
"""
import hashlib
import importlib.util
import json
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from engine.projection import mean_contract


def main():
    spec=importlib.util.spec_from_file_location('independent',Path(__file__).with_name('audit_forecast_contract.py'))
    audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    receipt_path=ROOT/'work/engine-rebuild/prepared-input-capture.json'
    receipt=json.loads(receipt_path.read_bytes());snapshot=ROOT/receipt['folder']
    def verify():
        for name,meta in receipt['files'].items():
            assert audit.digest((snapshot/name).read_bytes())==meta['sha256'],name
    verify()
    board=json.loads((snapshot/'outputs/projection-v3/board.json').read_bytes())
    registry=json.loads((snapshot/'work/engine-rebuild/legacy-calibration-map.json').read_bytes())
    assert audit.digest(audit.canonical({k:v for k,v in registry.items() if k!='sha256'}))==registry['sha256']
    old=json.loads((ROOT/'work/engine-rebuild/forecast-contract-audit.json').read_bytes())
    expected={r['game_id']:r for r in old['cards']}
    rows=[];counts=Counter()
    for card in sorted(board['games'],key=lambda c:c['game_id']):
        if not card.get('projection'):continue
        shapes,ref,resolution=audit.resolve_shapes(snapshot,card,registry)
        p=card['projection'];points={k:p[k] for k in mean_contract.TARGETS}
        masses={k:audit.masses(shapes['team_points' if k.endswith('_points') else k],v) for k,v in points.items()}
        intervals={k:{str(level):[audit.quantile(m,(100-level)/200),audit.quantile(m,(100+level)/200)]
                      for level in (50,80)} for k,m in masses.items()}
        for k,band in p['intervals'].items():assert intervals[k]==band
        probabilities={k:p[k] for k in ('home_win_probability','away_win_probability','tie_probability')}
        probabilities.update(home_strict_win_probability=sum(v for x,v in masses['margin'].items() if x>0),
                             away_strict_win_probability=sum(v for x,v in masses['margin'].items() if x<0))
        result=mean_contract.assess(points,masses,intervals=intervals,probabilities=probabilities,
                                    contributions=card['contributions'])
        for k,v in result['distribution_means'].items():
            assert abs(v-expected[card['game_id']]['targets'][k]['distribution_mean'])<1e-10
        assert not result['expected_score_contract_met']
        assert not any(v.startswith(('CONTRIBUTION_','PROBABILITY_','INTERVAL_','UNNESTED_','POINT_LINEAR_'))
                       for v in result['violations'])
        counts.update(result['violations'])
        rows.append({'game_id':card['game_id'],'version':card['version'],'evidence':card.get('evidence'),
                     'week':card['week'],'calibration_ref':ref,'resolution':resolution,'assessment':result})
    verify()
    current=json.loads((ROOT/'work/engine-rebuild/source-recovery-qualified/initial-operator.json').read_bytes())
    files=current['code']['files']
    assert len(files)==50 and all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in files.items())
    out={'scope':'READ_ONLY_ACCEPTANCE_QUALIFICATION; original captured forecasts unchanged; no experiment',
         'captured_at':receipt['captured_at'],'capture_receipt_sha256':audit.digest(receipt_path.read_bytes()),
         'checker_sha256':audit.digest((ROOT/'engine/projection/mean_contract.py').read_bytes()),
         'script_sha256':audit.digest(Path(__file__).read_bytes()),
         'strict_probabilities':'DERIVED_FROM_ORIGINAL_MARGIN_COUNTS',
         'team_intervals':'DERIVED_FROM_ORIGINAL_TEAM_COUNTS; not separately stored in original forecasts',
         'cards':rows,'counts':dict(sorted(counts.items())),'all_capture_files_unchanged':True,
         'frozen_issuing_files_unchanged':len(files),'production_enforcement':'NOT_INSTALLED',
         'activates_method':False}
    target=ROOT/'work/engine-rebuild/mean-contract-qualified.json'
    target.write_text(json.dumps(out,indent=2,sort_keys=True)+'\n')
    print(json.dumps({k:v for k,v in out.items() if k!='cards'},indent=2))


if __name__=='__main__':main()
