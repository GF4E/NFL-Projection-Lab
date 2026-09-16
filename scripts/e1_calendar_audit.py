"""Full-history audit of the fixed played-kickoff + 4h assimilation convention."""
import csv,gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from datetime import timedelta
from engine.forecast_system.calendar import audit,plan,schedule_kickoff,timestamp
OUT=ROOT/'work/projection-governance-v2/e1-calendar-corrected'

def run():
    policy=json.loads((OUT/'availability-convention.json').read_text())
    schedule=ROOT/policy['schedule_path'];raw=schedule.read_bytes()
    assert hashlib.sha256(raw).hexdigest()==policy['schedule_sha256']
    assert policy['duration_hours']==4 and policy['source_timezone']=='America/New_York'
    allrows=[g for g in csv.DictReader(raw.decode().splitlines()) if 2011<=int(g['season'])<=2025 and g['game_type']=='REG' and g['home_score']!='']
    games=[]
    for g in allrows:
        kickoff=schedule_kickoff(g['gameday'],g['gametime'])
        games.append(dict(game_id=g['game_id'],season=int(g['season']),week=int(g['week']),
                          kickoff_at=kickoff.isoformat(),issuance_at=(kickoff-timedelta(minutes=75)).isoformat(),
                          assimilation_available_at=(kickoff+timedelta(hours=4)).isoformat()))
    batches=plan(games)
    result=dict(status='PASS',valid_e1_result=False,full_schedule_games=len(games),
                audited_forecasts=audit(games,batches),scored_period_games=sum(2016<=g['season']<=2025 for g in games),
                unknown_completions=[],completion_timestamps_used=False,games_dropped=0,
                by_season={str(y):dict(games=sum(g['season']==y for g in games),affected_forecasts=0) for y in range(2016,2026)},
                rule=policy['rule'],availability_convention_sha256=policy['sha256'],
                candidates=['linear','k4','k8','state_space'],common_calendar=True)
    affected={y:[] for y in range(2016,2026)};details=[];changed_sources=set();gaps=[]
    for batch in batches:
        for game in batch['forecasts']:
            if not 2016<=game['season']<=2025:continue
            old={g['game_id'] for g in games if (g['season'],g['week'])<(game['season'],game['week'])}
            new=set(batch['incorporated']);difference=old^new
            if difference:affected[game['season']].append(game['game_id']);changed_sources.update(difference)
            details.append(dict(game_id=game['game_id'],state_cutoff=batch['cutoff'],incorporated=sorted(new),added=sorted(new-old),removed=sorted(old-new)))
        for g in batch['observations']:
            gaps.append((timestamp(batch['cutoff'])-timestamp(g['assimilation_available_at'])).total_seconds()/3600)
    for year,ids in affected.items():result['by_season'][str(year)]['affected_forecasts']=len(ids)
    result.update(affected_forecast_ids=affected,changed_source_game_ids=sorted(changed_sources),
                  minimum_hours_between_availability_and_assimilation=min(gaps),
                  affected_definition='Forecasts with a changed set of available historical game results versus week-label replay; downstream numerical propagation is separate.')
    (OUT/'calendar-games.json').write_text(json.dumps(games,sort_keys=True,indent=2)+'\n')
    (OUT/'calendar-lineage.json.gz').write_bytes(gzip.compress(json.dumps(details,sort_keys=True).encode(),mtime=0))
    (OUT/'calendar-audit.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='affected_forecast_ids'},indent=2))
    return result
if __name__=='__main__':raise SystemExit(0 if run()['status']=='PASS' else 1)
