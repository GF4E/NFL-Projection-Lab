"""Independent saved-source and chronology verification; no calibration fitting."""
import datetime as dt, gzip, hashlib, json
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[2]

def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def read(ref):
    raw=(ROOT/ref['path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()==ref['sha256'],ref['path']
    return json.loads(gzip.decompress(raw) if ref['path'].endswith('.gz') else raw)
def stamp(value):return dt.datetime.fromisoformat(value.replace('Z','+00:00')).astimezone(dt.timezone.utc)
def kickoff(game):return dt.datetime.fromisoformat(game['gameday']+'T'+game['gametime']).replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc)

def run():
    ref=json.loads((ROOT/'work/engine-rebuild/calibration-inputs-current.json').read_text());a=read(ref)
    early=read(a['sources']['early']);point=read(a['sources']['point_replay']);legacy=read(a['sources']['legacy_donor'])
    old=read(a['sources']['early_inputs']);schedule={g['game_id']:g for g in old['schedule']+read(a['sources']['schedule'])}
    initial={f['season']:f for b in (early,point) for f in b['fits'] if f['through_week']==0}
    original_own={g['game_id']:g for b in (early,point) for g in b['games']}
    original_legacy={g['game_id']:g for g in legacy['forecasts']}
    own_fits={(f['fit_sha256'],f['available_at']):f for b in (early,point) for f in b['fits']}
    legacy_fits={f['season']:f for f in legacy['fits']}
    checked_rows=0;memberships=0
    for role,pack in a['roles'].items():
        assert a['methods'][role]['sha256']==digest(a['methods'][role]['descriptor'])
        assert len(pack['history'])==len({r['game_id'] for r in pack['history']})==3407
        for identity,m in pack['fits'].items():
            assert digest(m)==identity and m['method_sha256']==a['methods'][role]['sha256']
            ids=m['training_game_ids'];assert len(ids)==len(set(ids))
            ends=[kickoff(schedule[g])+dt.timedelta(hours=4) for g in ids]
            assert max(ends)==stamp(m['last_label_available_at'])<stamp(m['available_at'])
            memberships+=len(ids)
        for r in pack['history']:
            gid=r['game_id'];g=schedule[gid];m=pack['fits'][r['fit_evidence_sha256']];p=pack['parents'][r['fit_evidence_sha256']]
            assert gid not in m['training_game_ids']
            assert stamp(r['issuance_at'])==kickoff(g)-dt.timedelta(minutes=75)
            assert stamp(r['label_available_at'])==kickoff(g)+dt.timedelta(hours=4)
            assert stamp(m['available_at'])<stamp(r['issuance_at'])
            assert [r['actual_home'],r['actual_away']]==[float(g['home_score']),float(g['away_score'])]
            assert all(r['actual_'+side]>=0 and r['actual_'+side]==int(r['actual_'+side]) for side in ['home','away'])
            if role=='own':
                source=original_own[gid];f=own_fits[(source['fit_sha256'],source.get('fit_available_at',source.get('fit_at')))];prefix=''
                assert digest(f['fit'])==p['coefficient_sha256']==source['fit_sha256']
                assert sorted(f['training_games'])==m['training_game_ids']
                assert p['training_hash']==source['training_hash']==f['fit']['training_hash']
            elif r['season']<2016:
                source=original_own[gid];prefix='legacy_donor_';assert p['coefficient_sha256'] is None
                assert sorted(initial[r['season']]['training_games'])==m['training_game_ids']
            else:
                source=original_legacy[gid];prefix='';f=legacy_fits[r['season']]
                assert digest(f['fit'])==p['coefficient_sha256']
                assert sorted(f['training_game_ids'])==m['training_game_ids']
            assert r['home']==source[prefix+'home'] and r['away']==source[prefix+'away']
            checked_rows+=1
    ids=[r['game_id'] for r in a['roles']['own']['history']]
    assert ids==[r['game_id'] for r in a['roles']['legacy']['history']]
    assert set(a['evaluation_game_ids'])=={g['game_id'] for g in read(a['authoritative_control_unchanged'])}
    fold_checks=0
    for fold in a['folds']:
        y=fold['season'];expected=sorted(r['game_id'] for r in a['roles']['own']['history'] if r['season']<y)
        assert sorted(fold['expected_game_ids'])==expected
        for key in ['offseason_planned_at','week9_planned_at']:
            at=stamp(fold[key]);local=at.astimezone(ZoneInfo('America/Los_Angeles'))
            assert local.weekday()==1 and local.hour==6 and local.minute==10
            assert all(kickoff(schedule[gid])+dt.timedelta(hours=4)<at for gid in expected)
            fold_checks+=1
        assert stamp(fold['offseason_planned_at'])<min(stamp(r['issuance_at']) for r in a['roles']['own']['history'] if r['season']==y)
        week9=[g for g in point['games'] if g['season']==y and int(schedule[g['game_id']]['week'])==9]
        assert stamp(fold['week9_planned_at'])<min(stamp(g['issuance_at']) for g in week9)
    for r in a['code']+[a['plan']]:assert hashlib.sha256((ROOT/r['path']).read_bytes()).hexdigest()==r['sha256']
    result={'status':'PASS','artifact':ref,'history_rows_checked':checked_rows,'training_memberships_checked':memberships,
            'planned_population_checks':fold_checks,'calibration_banks_fitted':0,
            'scope':'Independent source-value, coefficient/training identity, Eastern chronology and planned-population audit. No historical availability proof.'}
    (ROOT/'work/engine-rebuild/calibration-inputs-independent-check.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':run()
