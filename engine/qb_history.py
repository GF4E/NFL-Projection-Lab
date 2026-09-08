"""Reconstructed nflverse starters and strictly lagged rolling ANY/A (not 538 VALUE)."""
import csv,hashlib,io,json
from collections import defaultdict,deque
from pathlib import Path
from engine.harvest import ROOT,canonical

COLUMNS=['game_id','season','week','posteam','passer_player_id','passer_id','passer_player_name','play_type','two_point_attempt','pass_attempt','sack','passing_yards','yards_gained','pass_touchdown','interception']

def aggregate(frame):
    """Official attempts exclude sacks, nullified plays and two-point attempts."""
    frame=frame.copy()
    frame=frame[(frame['play_type']!='no_play') & (frame['two_point_attempt'].fillna(0)!=1) & ((frame['pass_attempt']==1)|(frame['sack']==1))].copy()
    frame['qb_id']=frame['passer_player_id'].fillna(frame['passer_id'])
    missing=int(frame['qb_id'].isna().sum())
    frame=frame[frame['qb_id'].notna() & frame['posteam'].notna()].copy()
    frame['attempts']=((frame['pass_attempt']==1)&(frame['sack']!=1)).astype(int)
    frame['sacks']=(frame['sack']==1).astype(int)
    frame['pass_yards']=frame['passing_yards'].fillna(0)
    frame['sack_yards']=(-frame['yards_gained'].fillna(0)).where(frame['sack']==1,0)
    frame['td']=frame['pass_touchdown'].fillna(0);frame['ints']=frame['interception'].fillna(0)
    stats=['attempts','sacks','pass_yards','sack_yards','td','ints']
    result=frame.groupby(['game_id','season','week','posteam','qb_id'],dropna=False)[stats].sum().reset_index()
    result['numerator']=result.pass_yards+20*result.td-45*result.ints-result.sack_yards
    result['denominator']=result.attempts+result.sacks
    return result.to_dict('records'),missing

def ratio(history):
    den=sum(r[1] for r in history)
    return sum(r[0] for r in history)/den if den else None

def rolling_table(records):
    groups=defaultdict(list)
    for r in records:groups[(int(r['season']),int(r['week']))].append(r)
    qb_hist=defaultdict(lambda:deque(maxlen=10));team_hist=defaultdict(lambda:deque(maxlen=10));league=deque(maxlen=256)
    output=[];last=None
    for origin,rows in sorted(groups.items()):
        teams=defaultdict(list)
        for r in rows:teams[(r['game_id'],canonical(r['posteam']))].append(r)
        updates=[]
        for (game,team),passers in sorted(teams.items()):
            ordered=sorted(passers,key=lambda r:(-r['attempts'],r['qb_id']))
            starter=ordered[0]
            if starter['attempts']<=0:raise ValueError('No attempts to identify starter')
            prior=ratio(league);raw=ratio(qb_hist[starter['qb_id']]);team_value=ratio(team_hist[team])
            qb_value=raw if raw is not None else prior
            team_value=team_value if team_value is not None else prior
            adjustment=25*(qb_value-team_value) if qb_value is not None and team_value is not None else ''
            output.append({'game_id':game,'season':origin[0],'week':origin[1],'team':team,'starter_qb_id':starter['qb_id'],'starter_attempts':starter['attempts'],'starter_tie':sum(r['attempts']==starter['attempts'] for r in passers)>1,'qb_prior_games':len(qb_hist[starter['qb_id']]),'team_prior_games':len(team_hist[team]),'qb_rolling_anya':qb_value if qb_value is not None else '', 'team_rolling_anya':team_value if team_value is not None else '', 'rookie_prior':raw is None,'qb_adjustment_elo':adjustment,'training_season':last[0] if last else '', 'training_week':last[1] if last else '', 'evidence_label':'RECONSTRUCTED_STARTER_NOT_KNOWN_AT_T60'})
            updates.append((team,passers))
        # Complete the whole week's forecasts before adding any current-game stats.
        for team,passers in updates:
            num=sum(r['numerator'] for r in passers);den=sum(r['denominator'] for r in passers)
            team_hist[team].append((num,den));league.append((num,den))
            for r in passers:qb_hist[r['qb_id']].append((r['numerator'],r['denominator']))
        last=origin
    return output

def put(path,data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.read_bytes()!=data:raise ValueError('Immutable output differs: '+str(path))
    if not path.exists():path.write_bytes(data)

def encoded(rows):
    buf=io.StringIO(newline='');w=csv.DictWriter(buf,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows);return buf.getvalue().encode()

def build(manifest,output):
    import pyarrow.parquet as pq
    sources=json.loads(Path(manifest).read_text())['records'];records=[];missing=0
    for source in sources:
        path=ROOT/source['path']
        if hashlib.sha256(path.read_bytes()).hexdigest()!=source['sha256']:raise ValueError('PBP hash mismatch')
        rows,unknown=aggregate(pq.read_table(path,columns=COLUMNS).to_pandas());records.extend(rows);missing+=unknown
    output=Path(output);table=rolling_table(records)
    put(output/'passer-game-stats.csv',encoded(records));put(output/'qb-history.csv',encoded(table))
    receipt={'qb_history_sha256':hashlib.sha256((output/'qb-history.csv').read_bytes()).hexdigest(),'passer_stats_sha256':hashlib.sha256((output/'passer-game-stats.csv').read_bytes()).hexdigest(),'team_game_rows':len(table),'missing_passer_plays':missing,'pbp_manifest_sha256':hashlib.sha256(Path(manifest).read_bytes()).hexdigest(),'code_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'metric':'Rolling ANY/A; not 538 VALUE','evidence':'Most-attempts starter identity is reconstructed using target-game PBP; QB values use prior weeks only. Not prospective T60 evidence.'}
    put(output/'receipt.json',(json.dumps(receipt,indent=2,sort_keys=True)+'\n').encode());return receipt

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--output',required=True);a=p.parse_args();print(json.dumps(build(a.manifest,a.output)))
