"""Explicit football-only staff seed. Unknown PFR evidence is never inferred."""
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'work/projection-governance-v2/e1'
PFR=dict(ARI='crd',ATL='atl',BAL='rav',BUF='buf',CAR='car',CHI='chi',CIN='cin',CLE='cle',DAL='dal',DEN='den',DET='det',GB='gnb',HOU='htx',IND='clt',JAX='jax',KC='kan',LAC='sdg',LAR='ram',MIA='mia',MIN='min',NE='nwe',NO='nor',NYG='nyg',NYJ='nyj',OAK='rai',PHI='phi',PIT='pit',SEA='sea',SF='sfo',TB='tam',TEN='oti',WSH='was')


def run():
    target=ROOT/'config/staff_history.json'
    prior=json.loads(target.read_text())
    if prior['records']:
        raise ValueError('Seed is not allowed to overwrite populated history')
    now=dt.datetime.now(dt.timezone.utc).isoformat()
    url='https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv'
    with urllib.request.urlopen(url,timeout=30) as response:
        raw=response.read()
    quarterbacks={};source_rows=[]
    for row in csv.DictReader(io.StringIO(raw.decode())):
        if row['game_type']!='REG' or int(row['week'])!=1 or not 2012<=int(row['season'])<=2026:
            continue
        for side in ('home','away'):
            team={'LA':'LAR','STL':'LAR','SD':'LAC','LV':'OAK','WAS':'WSH'}.get(row[side+'_team'],row[side+'_team'])
            item=dict(season=int(row['season']),team=team,game_id=row['game_id'],qb1=row[side+'_qb_id'] or None)
            source_rows.append(item);quarterbacks[(item['season'],team)]=item
    payload=json.dumps(sorted(source_rows,key=lambda r:(r['season'],r['team'])),sort_keys=True,indent=2)+'\n'
    source_hash=hashlib.sha256(payload.encode()).hexdigest()
    (OUT/f'week1-starters-{source_hash}.json').write_text(payload)
    records=[]
    for year in range(2013,2027):
        for team,code in sorted(PFR.items()):
            qb=quarterbacks.get((year,team));previous=quarterbacks.get((year-1,team))
            records.append(dict(season=year,team=team,head_coach=None,offensive_coordinator=None,defensive_coordinator=None,
                coaching_status='UNKNOWN_SOURCE_UNAVAILABLE',coaching_source_url=f'https://www.pro-football-reference.com/teams/{code}/{year}.htm',
                coaching_history_url=f'https://www.pro-football-reference.com/teams/{code}/coaches.htm',
                coaching_retrieved_at=None,coaching_access_checked_at=now,
                coaching_access_note='PFR season and coaching-history endpoints returned HTTP 403 in source availability probes; this row was not retrieved. No substitute or inference.',
                qb1=qb['qb1'] if qb else None,qb1_source_url=url,qb1_source_sha256=source_hash,qb1_retrieved_at=now,
                qb1_changed=(qb['qb1']!=previous['qb1']) if qb and previous and qb['qb1'] and previous['qb1'] else None,
                head_coach_changed=None,preseason_variance_doubled=False,
                transition_status='UNKNOWN_FALSE_BY_A3',
                qb1_definition='nflverse REG Week 1 starter ID; previous season Week 1 comparison; missing Week 1 stays unknown'))
    result=dict(schema='staff-history-v2',seeded=True,status='PARTIAL_QB_ONLY_COACHING_UNKNOWN',records=records,
                required_roles=prior['required_roles'],unchanged_inactive_roles=['general_manager','roster'],
                policy='Data addition only. No live continuity weight enabled. Unknown staff transitions use false flag under A.3.',
                source_evidence=dict(nflverse_url=url,nflverse_raw_sha256=hashlib.sha256(raw).hexdigest(),sanitized_source_sha256=source_hash,
                                     pfr_probe_urls=['https://www.pro-football-reference.com/teams/rav/2025.htm','https://www.pro-football-reference.com/teams/rav/coaches.htm'],pfr_probe_status=403))
    target.write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
    coverage={str(year):dict(team_seasons=32,head_coach=0,offensive_coordinator=0,defensive_coordinator=0,
                qb1=sum(r['qb1'] is not None for r in records if r['season']==year),
                qb1_change_known=sum(r['qb1_changed'] is not None for r in records if r['season']==year),
                unknown_coaching_teams=[r['team'] for r in records if r['season']==year]) for year in range(2013,2027)}
    report=dict(file='config/staff_history.json',sha256=hashlib.sha256(target.read_bytes()).hexdigest(),coverage=coverage,
                unknown_team_seasons=[dict(season=r['season'],team=r['team'],roles=['head_coach','offensive_coordinator','defensive_coordinator']) for r in records])
    (OUT/'staff-coverage.json').write_text(json.dumps(report,sort_keys=True,indent=2)+'\n')
    print(json.dumps(dict(sha256=report['sha256'],coverage=coverage),indent=2))

if __name__=='__main__':run()
