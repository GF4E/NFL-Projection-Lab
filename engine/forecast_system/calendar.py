"""Pure assimilation calendar. Week labels never determine result availability."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

PACIFIC=ZoneInfo('America/Los_Angeles')
EASTERN=ZoneInfo('America/New_York')

def timestamp(value):
    result=datetime.fromisoformat(value.replace('Z','+00:00')) if isinstance(value,str) else value
    if result.tzinfo is None:raise ValueError('A timezone-aware timestamp is required')
    return result.astimezone(timezone.utc)

def cutoff_before(issuance):
    """Most recent Tuesday 06:00 PT, strictly before issuance, including DST."""
    local=timestamp(issuance).astimezone(PACIFIC)
    cutoff=(local-timedelta(days=(local.weekday()-1)%7)).replace(hour=6,minute=0,second=0,microsecond=0)
    if cutoff>=local:cutoff-=timedelta(days=7)
    return cutoff.astimezone(timezone.utc)

def next_cutoff(value):
    local=cutoff_before(timestamp(value)+timedelta(microseconds=1)).astimezone(PACIFIC)
    return (local+timedelta(days=7)).astimezone(timezone.utc)

def schedule_kickoff(day,time):
    return datetime.fromisoformat(day+'T'+time).replace(tzinfo=EASTERN).astimezone(timezone.utc)

def plan(games):
    """Return frozen forecast batches and strictly completed observations per cutoff.

    Every game supplies issuance_at and completed_at as sourced UTC timestamps.
    Unknown completion is an error, never an inferred duration or silent exclusion.
    """
    ordered=sorted(games,key=lambda g:(timestamp(g['issuance_at']),g['game_id']))
    if not ordered:return []
    forecasts={};observations={};years={}
    for game in ordered:
        issued=timestamp(game['issuance_at']);completed=timestamp(game['completed_at'])
        if completed<=issued:raise ValueError('Completion must follow issuance: '+game['game_id'])
        cutoff=cutoff_before(issued)
        forecasts.setdefault(cutoff,[]).append(game)
        observations.setdefault(next_cutoff(completed),[]).append(game)
        years.setdefault(game['season'],[]).append(cutoff)
    cutoffs=set(forecasts)|set(observations)
    # Count weekly process steps inside each season, not across the offseason.
    for year,values in years.items():
        current=min(values);end=max(values)
        while current<=end:
            cutoffs.add(current);current=next_cutoff(current)
    result=[];incorporated=[]
    for cutoff in sorted(cutoffs):
        available=sorted(observations.get(cutoff,[]),key=lambda g:(timestamp(g['completed_at']),g['game_id']))
        for g in available:
            assert timestamp(g['completed_at'])<cutoff
            incorporated.append(g['game_id'])
        batch=forecasts.get(cutoff,[])
        result.append(dict(cutoff=cutoff.isoformat(),observations=available,forecasts=batch,
                           incorporated=tuple(incorporated)))
    return result

def audit(games,batches):
    by={g['game_id']:g for g in games};seen=set();count=0
    for batch in batches:
        cutoff=timestamp(batch['cutoff'])
        for forecast in batch['forecasts']:
            if cutoff!=cutoff_before(forecast['issuance_at']):raise AssertionError('Incorrect forecast cutoff')
            for gid in batch['incorporated']:
                if timestamp(by[gid]['completed_at'])>=cutoff:raise AssertionError('Result at or after cutoff: '+gid)
            expected={g['game_id'] for g in games if timestamp(g['completed_at'])<cutoff}
            if set(batch['incorporated'])!=expected:raise AssertionError('Missing or extra completed result')
            seen.add(forecast['game_id']);count+=1
    if len(seen)!=len(games) or count!=len(games):raise AssertionError('Missing or duplicate forecasts')
    return count
