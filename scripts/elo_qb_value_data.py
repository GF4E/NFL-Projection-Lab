"""Build strictly pre-issuance EPA and CPOE VALUE windows with provenance."""
import collections,csv,datetime as dt,gzip,hashlib,json,math,sys
from pathlib import Path
import pandas as pd
import pyarrow.parquet as pq
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));O=ROOT/'work/e-elo-qb-value-v2'
from scripts.elo_qb_starter_reproduce import kickoff,team

def pin(name,obj):
 raw=(json.dumps(obj,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode();sha=hashlib.sha256(raw).hexdigest();p=O/f'{name}-{sha}.json';p.write_bytes(raw);return {'path':str(p.relative_to(ROOT)),'sha256':sha}
def mean_value(rows,combined):
 if not rows:return None
 if any(r['epa'] is None or combined and r['cpoe'] is None for r in rows):return None
 n=sum(r['attempts'] for r in rows)
 return sum(r['epa']+(r['cpoe']/100*r['attempts'] if combined else 0) for r in rows)/n if n else None

def run():
 receipts=json.loads((ROOT/'work/e-elo-qb-hfa-v1/source-receipts.json').read_text())+json.loads((O/'extra-source-receipts.json').read_text());(O/'source-receipts.json').write_text(json.dumps(receipts,indent=2)+'\n')
 # Run the identical accepted selector with qualified 2014/15 warmup histories; do not overwrite prior evidence.
 import scripts.elo_qb_starter_reproduce as selector
 (O/'E-ELO-QB.json').write_text((ROOT/'work/e-elo-qb-hfa-v1/E-ELO-QB.json').read_text());selector.O=O;selector.run(output_start=2014)
 starter_ref=json.loads((O/'starter-reproduction.json').read_text())['table'];starters=json.loads((ROOT/starter_ref['path']).read_text());lookup={(r['game_id'],r['team']):r for r in starters}
 sources=json.loads((ROOT/'work/projection-v3/raw-manifest.json').read_text());cp={};cp_receipts=[]
 for src in sources:
  if src['kind']!='pbp' or int(src['name'].split('_')[-1].split('.')[0])>2025:continue
  p=ROOT/src['path'];assert hashlib.sha256(p.read_bytes()).hexdigest()==src['sha256']
  frame=pq.read_table(p,columns=['game_id','posteam','passer_player_id','cpoe','season_type']).to_pandas();frame=frame[frame.season_type.eq('REG') & frame.cpoe.notna() & frame.passer_player_id.notna()]
  for (gid,t,q),v in frame.groupby(['game_id','posteam','passer_player_id'],sort=True):cp[gid,team(t),q]=float(v.cpoe.mean())
  cp_receipts.append({'path':src['path'],'sha256':src['sha256']});print('CPOE',src['name'],flush=True)
 schedule=list(csv.DictReader((ROOT/'work/market-distribution-v1/schedules-d64cef660c4b14c74f0e33ecee387343675137ed2f1a1fac2b0c70951b8a4c07.csv').open()));games=sorted([g for g in schedule if g['game_type']=='REG' and g['home_score'] and g['away_score'] and 2000<=int(g['season'])<=2025],key=lambda g:(kickoff(g),g['game_id']));key={}
 for g in games:
  for side in ['home','away']:key[int(g['season']),int(g['week']),team(g[side+'_team'])]=g
 stats=collections.defaultdict(list)
 for src in receipts:
  if src.get('kind')!='player_stats' or src.get('http_status')!=200 or src['season']>2025:continue
  p=ROOT/src['compressed_path'];raw=gzip.decompress(p.read_bytes());assert hashlib.sha256(raw).hexdigest()==src['sha256'];f=pd.read_csv(p,low_memory=False);f=f[f.season_type.eq('REG') & f.position.eq('QB') & f.attempts.gt(0)]
  for r in f.to_dict('records'):
   t=team(r.get('recent_team') or r.get('team'));g=key.get((int(r['season']),int(r['week']),t))
   if not g:continue
   q=r['player_id'];stats[g['game_id'],t].append({'game_id':g['game_id'],'team':t,'id':q,'season':int(g['season']),'week':int(g['week']),'attempts':float(r['attempts']),'epa':float(r['passing_epa']) if pd.notna(r.get('passing_epa')) else None,'cpoe':cp.get((g['game_id'],t,q)),'completed_at':(kickoff(g)+dt.timedelta(hours=4)).isoformat(),'source_sha256':src['sha256']})
 # Persist the compact input table so reports/tests need no raw PBP downloads.
 perf=[r for k in sorted(stats) for r in sorted(stats[k],key=lambda x:x['id'])];perfref=pin('qb-game-performance',perf);qhist=collections.defaultdict(list);thist=collections.defaultdict(list);league=[];out=[]
 for g in games:
  cut=kickoff(g)-dt.timedelta(minutes=75)
  for side in ['home','away']:
   t=team(g[side+'_team']);identity=lookup.get((g['game_id'],t))
   if identity:
    priorleague=[x for x in league if dt.datetime.fromisoformat(x['completed_at'])<cut];weeks=sorted({(x['season'],x['week']) for x in priorleague})[-16:];lg=[x for x in priorleague if (x['season'],x['week']) in weeks];tg=[x for x in thist[t] if x['completed_at']<cut.isoformat()][-16:];tr=[v for x in tg for v in x['stats']]
    rec={'game_id':g['game_id'],'team':t,'season':int(g['season']),'week':int(g['week']),'T75_utc':cut.isoformat(),'selected_qb':identity['selected_qb'],'oracle_qb':identity['actual_most_attempts_qb_ORACLE_ONLY'],'UNTIMESTAMPED':identity['UNTIMESTAMPED'],'team_game_ids':[x['game_id'] for x in tg],'league_week_window':weeks,'latest_source_completion':max((r['completed_at'] for r in lg+tr),default=None),'values':{}}
    for label,q in [('rule',rec['selected_qb']),('oracle',rec['oracle_qb'])]:
     qr=[r for r in qhist[q] if r['attempts']>=5 and dt.datetime.fromisoformat(r['completed_at'])<cut][-16:] if q else [];n=len(qr);w=min(1,n/8);v={'qualifying_games':n,'weight':w,'ROOKIE_PRIOR':bool(q and n==0),'game_ids':[r['game_id'] for r in qr],'latest_completion':max((r['completed_at'] for r in qr),default=None)}
     for name,combined in [('epa',False),('combined',True)]:
      own=mean_value(qr,combined);lm=mean_value(lg,combined);tv=mean_value(tr,combined);sv=(own if w==1 else w*own+(1-w)*lm if own is not None and lm is not None else lm if n==0 else None) if q else None
      v[name]={'starter':sv,'team':tv,'league':lm,'own':own,'difference':sv-tv if sv is not None and tv is not None else None}
     rec['values'][label]=v
    out.append(rec)
  for side in ['home','away']:
   t=team(g[side+'_team']);rr=stats[g['game_id'],t];end=(kickoff(g)+dt.timedelta(hours=4)).isoformat();thist[t].append({'game_id':g['game_id'],'completed_at':end,'stats':rr});league+=rr
   for r in rr:qhist[r['id']].append(r)
 ref=pin('value-windows',out);coverage={str(y):{name:sum(r['values']['rule'][name]['difference'] is not None for r in out if r['season']==y) for name in ['epa','combined']} for y in range(2014,2026)};receipt={'starter_table':starter_ref,'performance':perfref,'values':ref,'CPOE_sources':cp_receipts,'coverage':coverage};(O/'value-data-ref.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'coverage':coverage,'values':ref},indent=2))
if __name__=='__main__':run()
