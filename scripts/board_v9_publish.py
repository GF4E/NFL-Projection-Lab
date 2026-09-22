"""Refresh presentation context from pinned schedules and recorded final scores."""
import hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.board_v9 import build
from engine.projection_v3.qualify import read
from scripts.projection_publish import save

def run(board=None,shape_loader=None):
 if board is None:board=json.loads((ROOT/'outputs/projection-v3/board.json').read_text())
 if shape_loader is None:
  from scripts.projection_v3_publish import shape_for
  from scripts.projection_learning import active_artifact
  artifact=active_artifact();shape_loader=lambda g:shape_for(g,artifact)
 fit=read(json.loads((ROOT/'work/projection-v1/fit-ref.json').read_text()));ref=fit['source_manifest']['schedule'];schedule=read(ref)
 # Prefer the latest already-recorded public schedule for actual rescheduled kickoffs.
 feed=json.loads((ROOT/'outputs/projection-v3/final-feed.json').read_text())
 from engine.projection.source_archive import read_source,reference
 import csv,io
 source=reference(feed);raw=read_source(ROOT,feed)
 schedule=list(csv.DictReader(io.StringIO(raw.decode())))
 result=build(board,schedule,feed['games'],shape_loader);result['schedule_source']=source or ref
 def canonical(x):
  if isinstance(x,float) and x.is_integer():return int(x)
  if isinstance(x,dict):return {k:canonical(v) for k,v in x.items()}
  if isinstance(x,list):return [canonical(v) for v in x]
  return x
 result=canonical(result)
 raw=json.dumps(result,sort_keys=True,separators=(',',':'),allow_nan=False).encode();result['content_sha256']=hashlib.sha256(raw).hexdigest()
 save(ROOT/'outputs/board-v7/context-v9.json',result);return result
if __name__=='__main__':print(json.dumps({'games':len(run()['games'])}))
