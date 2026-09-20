"""Publish additive board evidence using existing version-pinned distributions."""
import sys,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.board_v7 import build
from scripts.projection_v3_publish import shape_for
from scripts.projection_learning import active_artifact
from engine.projection_v3.qualify import read
from scripts.projection_publish import save

def run(board=None):
 board=board or json.loads((ROOT/'outputs/projection-v3/board.json').read_text());artifact=active_artifact();ref=json.loads((ROOT/'work/in-season-learning-v1/reference.json').read_text());history=read(ref['oof']);training_ref=json.loads((ROOT/'work/in-season-learning-v1/historical-ref.json').read_text());training=read(training_ref);result=build(board,lambda g:shape_for(g,artifact),history,training);result['reference']['climatology_source']=training_ref;result['reference']['oof_source']=ref['oof']
 tagged=[]
 for g in board['games']:
  if not result['games'][g['game_id']]['qualified_lock'] or not g.get('final') or not g.get('ours'):continue
  entry=g.get('entry') or {}
  if entry.get('post_lock'):continue
  loss=sum(abs(g['final'][s+'_points']-g['ours'][s+'_points']) for s in ('away','home'))/2
  tagged.append({'game_id':g['game_id'],'mae':loss,'tags':entry.get('tags',[])})
 tagged.sort(key=lambda x:(x['mae'],x['game_id']));result['edits']['best_tags']=tagged[:5];result['edits']['worst_tags']=list(reversed(tagged[-5:]))
 save(ROOT/'outputs/board-v7/evidence.json',result)
 from scripts.board_v9_publish import run as publish_context
 publish_context(board,lambda g:shape_for(g,artifact))
 return result
if __name__=='__main__':
 r=run();print(json.dumps({'teams':r['trust']['teams'],'inside80':r['trust']['inside80'],'weeks':len(r['weeks'])}))
