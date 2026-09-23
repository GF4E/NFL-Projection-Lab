"""Audit saved train/test memberships independently; does not fit or promote."""
import collections
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
import statistics
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[2]


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def stamp(value):return dt.datetime.fromisoformat(value.replace('Z','+00:00'))


def audit(replay,schedule):
    games={g['game_id']:g for g in schedule}
    if len(games)!=len(schedule):raise ValueError('Duplicate source game')
    fits={};initial={};checks=0
    for fit in replay['fits']:
        key=(fit['fit_sha256'],fit['available_at'])
        if key in fits or digest(fit['fit'])!=fit['fit_sha256']:raise ValueError('Fit identity differs')
        trained=fit['training_games']
        if len(trained)!=len(set(trained)) or not trained:raise ValueError('Invalid training population')
        if stamp(fit['available_at'])<stamp(fit['at']):raise ValueError('Fit availability predates training')
        for gid in trained:
            g=games[gid]
            kick=dt.datetime.fromisoformat(g['gameday']+'T'+g['gametime']).replace(tzinfo=ZoneInfo('America/New_York'))
            if kick+dt.timedelta(hours=4)>=stamp(fit['at']):raise ValueError('Training game not complete before fit')
            if any(g.get(s+'_score') is None for s in ('home','away')):raise ValueError('Training final missing')
            checks+=1
        if fit['kind']=='OUTER_SEASON_INITIAL_FIT':
            if fit['season'] in initial or any(int(games[g]['season'])>=fit['season'] for g in trained):
                raise ValueError('Outer-season training overlaps test season')
            initial[fit['season']]=len(trained)
        fits[key]=(fit,set(trained))
    seen=set();annual=collections.defaultdict(list)
    for row in replay['games']:
        gid=row['game_id']
        if gid in seen:raise ValueError('Duplicate test game')
        seen.add(gid);fit,trained=fits[(row['fit_sha256'],row['fit_at'])]
        if row['season']!=fit['season'] or row['season']!=int(games[gid]['season']):
            raise ValueError('Test season identity differs')
        if gid in trained:raise ValueError('Test game entered its own training set')
        if stamp(fit['available_at'])>=stamp(row['issuance_at']):raise ValueError('Test forecast uses unavailable fit')
        if row['training_hash']!=fit['fit']['training_hash']:raise ValueError('Training hash differs')
        for side in ('home','away'):
            actual=row['actual_'+side]
            if actual!=float(games[gid][side+'_score']) or actual<0 or int(actual)!=actual:
                raise ValueError('Test target differs from completed integer score')
        annual[row['season']].append(row)
    return {'status':'PASS','source_authoritative':replay['authoritative'],
        'scope':'Saved training membership, fit identity, chronology proxy and actual-score audit only. Not feature-vintage, tuning, calibration or live-availability qualification.',
        'evaluation':'Sequential chronological test; earlier test outcomes may enter later scheduled refits, never their own prediction.',
        'test_games':len(seen),'test_team_targets':2*len(seen),'fits':len(fits),
        'training_game_membership_checks':checks,
        'by_season':{str(year):{'initial_training_games':initial[year],
            'test_games':len(rows),'test_team_targets':2*len(rows),
            'team_mae':statistics.mean(abs(r[s]-r['actual_'+s]) for r in rows for s in ('home','away'))}
            for year,rows in sorted(annual.items())},
        'limitations':['2016–2025 have already been inspected; this is historical development evidence, not an untouched confirmatory test.',
            'Saved replay is non-authoritative; it cannot replace the deployed control or establish a promotion.',
            'Historical final availability uses the disclosed kickoff-plus-four-hours proxy. Provider vintages remain unknown.']}


def read(ref):
    data=(ROOT/ref['path']).read_bytes()
    if hashlib.sha256(data).hexdigest()!=ref['sha256']:raise ValueError('Artifact hash differs')
    return json.loads(gzip.decompress(data) if ref['path'].endswith('.gz') else data)


if __name__=='__main__':
    ref=json.loads((ROOT/'work/engine-rebuild/hourly-catchup/current-ref.json').read_bytes())
    replay=read(ref);control=read(replay['control'])
    if {r['game_id'] for r in control}!={r['game_id'] for r in replay['games']}:
        raise ValueError('Registered test population differs')
    result=audit(replay,read(replay['sources']['schedule']));result['replay_ref']=ref
    result['control_ref']=replay['control']
    (ROOT/'work/engine-rebuild/train-test-audit.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
