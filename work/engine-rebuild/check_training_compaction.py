"""Mac parity audit of all retained rows; never activates the diagnostic fit."""
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from engine.projection import cutoff_pipeline as p,training_ledger as ledger
from engine.projection_v3.model import fit,predict

ref=json.loads((ROOT/'work/engine-rebuild/training-transition/current-ref.json').read_bytes())
body=p.load(ROOT,ref,'training');rows=p.load(ROOT,body['base_ref'],'training')['rows']
for item in body['preparations']:rows.extend(p.load(ROOT,item,'preparations')['rows'])
source={g['game_id']:g for g in ledger.read(ROOT,body['sources']['schedule'])}
for row in rows:row['actual_points']=float(source[row['game_id']]['home_score' if row['home'] else 'away_score'])
compact=[ledger.fit_row(row) for row in rows]
original=fit(rows,p.GROUPS,10);optimized=fit(compact,p.GROUPS,10)
assert original==optimized
for a,b in zip(rows,compact):assert predict(original,a['features'])==predict(optimized,b['features'])
report={'status':'PASS','rows':len(rows),'games':len({r['game_id'] for r in rows}),
    'ledger_ref':ref,'training_hash':original['training_hash'],'fit_and_predictions_identical':True,
    'maximum_difference':0.,'scope':'Compaction parity only on all retained rows, using unchanged qualified ridge implementation; independent arithmetic is a separate host check. No fit activated.'}
(ROOT/'work/engine-rebuild/training-transition/compaction-parity.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
