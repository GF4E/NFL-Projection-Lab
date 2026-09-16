"""Audit every historical forecast; unknown completion evidence fails the full replay."""
import csv,gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from datetime import timedelta
from engine.forecast_system.calendar import audit,plan,cutoff_before,schedule_kickoff,timestamp
OUT=ROOT/'work/projection-governance-v2/e1-calendar-corrected'

def run():
    schedule=ROOT/'outputs/model-pick-v1/final-sources/c4b302a4e1dc27b0f1db0a2617a353a4f73b5b4ed798b0762dd1403032874b77.csv'
    allrows=[g for g in csv.DictReader(schedule.open()) if 2011<=int(g['season'])<=2025 and g['game_type']=='REG' and g['home_score']!='']
    source=OUT/'completion-evidence.json'
    evidence=json.loads(source.read_text()) if source.exists() else {}
    gaps=[];games=[]
    for g in allrows:
        kickoff=schedule_kickoff(g['gameday'],g['gametime']);issuance=kickoff-timedelta(minutes=75)
        value=evidence.get(g['game_id'],{})
        if not value.get('completed_at') or not value.get('source_url') or not value.get('source_sha256'):
            gaps.append(dict(game_id=g['game_id'],season=int(g['season']),reason='UNKNOWN_VERIFIED_COMPLETION'));continue
        if timestamp(value['completed_at'])<kickoff:
            gaps.append(dict(game_id=g['game_id'],season=int(g['season']),reason='COMPLETION_BEFORE_KICKOFF'));continue
        games.append(dict(game_id=g['game_id'],season=int(g['season']),week=int(g['week']),issuance_at=issuance.isoformat(),completed_at=value['completed_at']))
    result=dict(status='BLOCKED_COMPLETION_EVIDENCE' if gaps else 'PASS',valid_e1_result=False,full_schedule_games=len(allrows),
                scored_period_games=sum(2016<=int(g['season'])<=2025 for g in allrows),
                unknown_completions=gaps,by_season={str(y):dict(games=sum(int(g['season'])==y for g in allrows),missing_completions=sum(g['season']==y for g in gaps),affected_forecasts=None) for y in range(2016,2026)},
                rule='Latest scheduled Tuesday 06:00 America/Los_Angeles strictly before own T-75; only completions strictly before cutoff; same state within interval.',
                candidates=['linear','k4','k8','state_space'],common_calendar=True)
    if not gaps:
        batches=plan(games);result['audited_forecasts']=audit(games,batches)
        affected={y:[] for y in range(2016,2026)};details=[]
        for batch in batches:
            for game in batch['forecasts']:
                if not 2016<=game['season']<=2025:continue
                old={g['game_id'] for g in games if (g['season'],g['week'])<(game['season'],game['week'])}
                new=set(batch['incorporated']);difference=old^new
                if difference:affected[game['season']].append(game['game_id'])
                details.append(dict(game_id=game['game_id'],state_cutoff=batch['cutoff'],incorporated=sorted(new),added=sorted(new-old),removed=sorted(old-new)))
        for year,ids in affected.items():result['by_season'][str(year)]['affected_forecasts']=len(ids)
        result['affected_definition']='Forecasts with a changed set of available historical game results; downstream numerical propagation is separate.'
        (OUT/'calendar-games.json').write_text(json.dumps(games,sort_keys=True,indent=2)+'\n')
        (OUT/'calendar-lineage.json.gz').write_bytes(gzip.compress(json.dumps(details,sort_keys=True).encode(),mtime=0))
    (OUT/'calendar-audit.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='unknown_completions'},indent=2))
    return result
if __name__=='__main__':raise SystemExit(0 if run()['status']=='PASS' else 1)
