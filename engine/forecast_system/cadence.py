"""Versioned three-cutoff calendar; no production activation or model promotion."""
from datetime import timedelta
from .calendar import PACIFIC,timestamp
DAYS=(0,1,4)  # Monday, Tuesday, Friday

def cutoff_before(value):
 local=timestamp(value).astimezone(PACIFIC)
 candidates=[(local-timedelta(days=i)).replace(hour=6,minute=0,second=0,microsecond=0) for i in range(8)]
 return max(c for c in candidates if c.weekday() in DAYS and c<local).astimezone(timestamp(value).tzinfo)

def next_cutoff(value):
 local=timestamp(value).astimezone(PACIFIC)
 candidates=[(local+timedelta(days=i)).replace(hour=6,minute=0,second=0,microsecond=0) for i in range(8)]
 return min(c for c in candidates if c.weekday() in DAYS and c>local).astimezone(timestamp(value).tzinfo)

def plan(games):
 if len({g['game_id'] for g in games})!=len(games):raise ValueError('Duplicate game IDs')
 forecasts={};observations={};seasons={}
 for g in games:
  issuance=timestamp(g['issuance_at']);available=timestamp(g['assimilation_available_at'])
  if available<=issuance:raise ValueError('Result availability must follow issuance')
  before=cutoff_before(issuance);after=next_cutoff(available)
  forecasts.setdefault(before,[]).append(g);observations.setdefault(after,[]).append(g)
  seasons.setdefault(g['season'],[]).extend([before,after])
 cutoffs=set(forecasts)|set(observations)
 for values in seasons.values():
  current=min(values)
  while current<=max(values):
   cutoffs.add(current);current=next_cutoff(current)
 lineage=[];incorporated=set()
 for cutoff in sorted(cutoffs):
  added=sorted(observations.get(cutoff,[]),key=lambda g:(timestamp(g['assimilation_available_at']),g['game_id']))
  for g in added:
   if g['game_id'] in incorporated:raise ValueError('Double assimilation')
   if timestamp(g['assimilation_available_at'])>=cutoff:raise ValueError('Early assimilation')
   incorporated.add(g['game_id'])
  lineage.append({'policy':'fri-mon-tue-0600-PT-v2','cutoff':cutoff.isoformat(),'observations':added,'forecasts':sorted(forecasts.get(cutoff,[]),key=lambda g:g['game_id']),'incorporated':sorted(incorporated)})
 return lineage

def audit(games,lineage):
 by={g['game_id']:g for g in games};seen=set();observed=set()
 for batch in lineage:
  cutoff=timestamp(batch['cutoff'])
  for g in batch['observations']:
   assert g['game_id'] not in observed;observed.add(g['game_id'])
   assert timestamp(g['assimilation_available_at'])<cutoff
  assert set(batch['incorporated'])==observed
  assert observed=={gid for gid,g in by.items() if timestamp(g['assimilation_available_at'])<cutoff}
  for g in batch['forecasts']:
   assert g['game_id'] not in seen;seen.add(g['game_id'])
   assert cutoff==cutoff_before(g['issuance_at'])
 assert seen==set(by) and observed==set(by)
 return len(seen)
