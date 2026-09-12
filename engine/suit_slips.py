"""Link executed slips to locked Jarrett leans without rewriting either record."""
import csv,json
from pathlib import Path
from engine.live_scorecard import csv_write
from engine.pricing import timestamp

def match(slip,leans):
 candidates=[]
 if slip.get('placed_at'):
  for l in leans:
   if l.get('person')=='Jarrett' and l.get('game_id')==slip.get('game_id') and l.get('market')==slip.get('market') and l.get('side')==slip.get('side') and l.get('entry_at') and timestamp(l['entry_at'])<=timestamp(slip['placed_at']):candidates.append(l)
 return {'slip_id':slip['slip_id'],'source':'jarrett','lean_source':'human_lean','person':'Jarrett','game_id':slip.get('game_id'),'market':slip.get('market'),'status':'MATCHED' if len(candidates)==1 else 'AMBIGUOUS' if candidates else 'UNMATCHED','lean_id':candidates[0]['lean_id'] if len(candidates)==1 else None,'reason':None if len(candidates)==1 else 'No unique prior submitted lean; never infer from a result'}

def run(root):
 root=Path(root);out=root/'outputs/iron-man-v1';leans=[]
 for path in (out/'locks').glob('*.json'):
  for i,lean in enumerate(json.loads(path.read_text()).get('leans',[])):leans.append({**lean,'lean_id':path.stem+':'+str(i)})
 slips=root/'outputs/jarrett/pick_log.csv';rows=[match(s,leans) for s in csv.DictReader(slips.open())] if slips.exists() else []
 csv_write(out/'slip-lean-links.csv',rows,['slip_id','source','lean_source','person','game_id','market','status','lean_id','reason'])
 return rows
