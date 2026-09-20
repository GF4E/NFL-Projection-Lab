"""As-of score context for presentation only; no forecasts or fit inputs change."""
import datetime as dt
import math
from zoneinfo import ZoneInfo
from engine.board_v7 import metadata
UTC=dt.timezone.utc

def stamp(value):
 try:
  t=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
  return t if t.tzinfo else None
 except (ValueError,TypeError,AttributeError):return None

def team(code):return {'LAR':'LA','STL':'LA','WSH':'WAS','OAK':'LV','SD':'LAC'}.get(code,code)

def percentile(value,rows,key):
 values=[r[key] for r in rows]
 return None if not values else 100*(sum(x<value for x in values)+.5*sum(x==value for x in values))/len(values)

def build(board,schedule,finals,shape_loader):
 cards={g['game_id']:g for g in board['games']}; history=[];missing=[]
 seasons={int(g['season']) for g in board['games']}
 wanted=seasons|{s-1 for s in seasons}
 for row in sorted(schedule,key=lambda g:g['game_id']):
  if int(row['season']) not in wanted or row.get('game_type')!='REG':continue
  score=finals.get(row['game_id']) or {}
  if any(score.get(s+'_score') is None for s in ('home','away')):continue
  # nflverse gametime is Eastern, including international games (existing convention).
  try: kickoff=dt.datetime.fromisoformat(row['gameday']+'T'+row['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(UTC)
  except (ValueError,TypeError,KeyError):missing.append(row['game_id']);continue
  h,a=float(score['home_score']),float(score['away_score'])
  if not all(math.isfinite(x) for x in (h,a)):continue
  c=cards.get(row['game_id']); issued=bool(c and c.get('evidence')=='AS_ISSUED' and c.get('freeze_time'))
  history.append({'game_id':row['game_id'],'season':int(row['season']),'home':team(row['home_team']),'away':team(row['away_team']),'home_points':h,'away_points':a,'total':h+a,'completed_at':(kickoff+dt.timedelta(hours=4)).isoformat(),'version':c.get('version') if issued else None})
 out={}
 for g in board['games']:
  p=g.get('ours') or g.get('projection'); issued=stamp(g.get('issued_at'))
  if not p:continue
  # Retrospective cards cannot use outcomes after their original pregame cutoff.
  cutoff=stamp(g.get('cutoff_at')); asof=min(issued,cutoff) if issued and cutoff else issued
  eligible=[r for r in history if asof and stamp(r['completed_at'])<asof and r['game_id']!=g['game_id']]
  league=[r for r in eligible if r['season']==g['season']]
  md=metadata(dict(g,projection=p),shape_loader(g)); teams={}
  for s in ('away','home'):
   code=team(g[s]); current=[r for r in league if code in (r['home'],r['away']) and r['version']==g['version']]
   fallback=len(current)<4; sample=[r for r in eligible if r['season']==g['season']-1 and code in (r['home'],r['away'])] if fallback else current
   pts=[dict(r,points=r['home_points'] if r['home']==code else r['away_points']) for r in sample]
   teams[s]={'percentile':percentile(p[s+'_points'],pts,'points'),'n':len(pts),'current_version_n':len(current),'prior_season':fallback,'sample_season':g['season']-1 if fallback else g['season'],'game_ids':[r['game_id'] for r in sample],'intervals':md['teams'][s]['intervals']}
  out[g['game_id']]={'version':g['version'],'issued_at':g.get('issued_at'),'as_of':asof.isoformat() if asof else None,'points':{s:p[s+'_points'] for s in ('home','away')},'teams':teams,'evidence':md,'total':{'percentile':percentile(p['total'],league,'total'),'n':len(league),'game_ids':[r['game_id'] for r in league],'interval50':p['intervals']['total']['50']}}
 return {'schema':'board-v9-context-v1','board_sha256':board['content_sha256'],'published_at':board['published_at'],'conventions':{'completion':'actual played kickoff + 4h, strictly before original issuance (bounded by T75 for retrospective cards)','percentile':'100 * (count below + 0.5 * count equal) / n; no rounding before ranking','team_current':'exact issuing-version AS_ISSUED cohort','team_fallback':'prior-season actual regular-season scores; explicitly flagged, no historical version inferred','league':'all completed current-season regular-season scores, independent of model version; no prior fallback','error':'actual minus displayed projection'},'missing_kickoff':missing,'history':history,'games':out}
