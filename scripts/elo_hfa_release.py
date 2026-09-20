"""Build and activate the explicitly promoted HFA lineage; no source fetch or paid calls."""
import copy,csv,datetime as dt,gzip,hashlib,json,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts.elo_hfa_deployed_gate import elo_features,read
from scripts.projection_learning import pinned,active_artifact,method_signature
from scripts.projection_publish import save
from engine.projection_v3.model import fit
O=ROOT/'work/e-elo-hfa-release'
def prepare_release():
 a=active_artifact()
 if a.get('version_prefix')=='projection-v2.hfa1':return read(json.loads((O/'release-ref.json').read_text()))
 receipt=json.loads((ROOT/'work/projection-v2w/replay-receipt.json').read_text());hist=read(receipt['historical_features']);gate=json.loads((ROOT/'work/e-elo-qb-hfa-v1/hfa-deployed-gate.json').read_text());assert all(gate['checks'].values())
 v1=read(json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text()));schedule=read(v1['source_manifest']['schedule']);hfa={x['season']:x['hfa_elo'] for x in gate['parameters']}
 raw=list(csv.DictReader((ROOT/'work/market-distribution-v1/schedules-d64cef660c4b14c74f0e33ecee387343675137ed2f1a1fac2b0c70951b8a4c07.csv').open()));prior=[g for g in raw if 2023<=int(g['season'])<=2025 and g['game_type']=='REG' and g['location']!='Neutral' and g['home_score'] and g['away_score']];hfa[2026]=float(np.mean([float(g['home_score'])-float(g['away_score']) for g in prior]))*25
 mod=elo_features(schedule,hfa)
 for r in hist:r['features'].update(mod[r['game_id'],r['team']])
 href=pinned('historical-hfa1',hist)
 # Current pinned features contain all unchanged football measurements. Only the gated Elo pair changes.
 from scripts.projection_learning import current_rows
 from engine.projection_v3.qualify import read as qread
 current=json.loads(gzip.decompress((O/'parent-week1-features.json.gz').read_bytes()));m=json.loads((O/'parent-source-manifest.json').read_text());cm=elo_features(qread(m['schedule']),hfa)
 for r in current:r['features'].update(cm[r['game_id'],r['team']])
 through=a['through_week'];train=[r for r in hist+current if (r['season']<2026 or r['week']<=through) and r.get('actual_points') is not None and r['features'].get('baseline') is not None]
 updated=copy.deepcopy(a);updated.update(fit=fit(train,a['groups'],a['selected'][1]),parent_version=a['version'],version=f'projection-v2.hfa1.w{through+1}',version_prefix='projection-v2.hfa1',historical_features=href,elo_hfa={str(y):v for y,v in hfa.items()},promotion='E-ELO-HFA',released_at=dt.datetime.now(dt.timezone.utc).isoformat());ref=pinned('fit',updated)
 result={'version':updated['version'],'fit':ref,'parent_fit':json.loads((ROOT/'work/in-season-learning-v1/active-fit-ref.json').read_text()),'historical_features':href,'hfa_2026_elo':hfa[2026],'hfa_2026_points':hfa[2026]/25,'hfa_training_games':len(prior),'through_week':through,'training_rows':len(train),'gate':'work/e-elo-qb-hfa-v1/hfa-deployed-gate.json','method_signature':method_signature(),'created_at':updated['released_at']}
 raw=(json.dumps(result,sort_keys=True,separators=(',',':'))+'\n').encode();sha=hashlib.sha256(raw).hexdigest();p=O/f'release-{sha}.json';p.write_bytes(raw);save(O/'release-ref.json',{'path':str(p.relative_to(ROOT)),'sha256':sha});return result

def activate():
 result=read(json.loads((O/'release-ref.json').read_text()));a=read(result['fit']);assert result['method_signature']==method_signature()
 current=json.loads((ROOT/'work/in-season-learning-v1/active-fit-ref.json').read_text());assert current in (result['parent_fit'],result['fit']),'Unexpected active lineage'
 save(ROOT/'work/in-season-learning-v1/active-fit-ref.json',result['fit']);save(ROOT/'work/in-season-learning-v1/method-signature.json',result['method_signature'])
 from scripts.projection_v3_prepare import prepare
 rows=prepare();assert json.loads((ROOT/'work/projection-v3/current-ref.json').read_text())['fit']==result['fit'];return result
if __name__=='__main__':print(json.dumps(activate() if '--activate' in sys.argv else prepare_release(),indent=2))
