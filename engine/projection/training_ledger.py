"""Immutable training migration: reconstructed history plus original live locks.

Historical source availability remains assumed. These rows never replace an
as-issued forecast, and this ledger neither activates a fit nor promotes a model.
"""
import collections
import copy
import datetime as dt
import gzip
import io
import json
from pathlib import Path, PurePosixPath

from . import cutoff_pipeline as p, cutoff_state as cs, observations as obs
from .storage import write_bytes

SCHEMA = 'retained-pregame-training-ledger-v1'


def fit_row(row):
    """Keep numerical/chronology fields; verbose explanations stay in pinned bytes."""
    return {k:v for k,v in row.items() if k not in ('metadata','personnel')}


def historical_rows(data):
    """Stream the hash-pinned canonical cache instead of expanding 113 MB at once.

    The retained serializer writes exactly rows, then schema. This reader does
    not accept a different schema or quietly skip a malformed/truncated row.
    """
    decoder=json.JSONDecoder();rows=[]
    with io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(data)),encoding='utf-8') as stream:
        if stream.read(9)!='{"rows":[':raise ValueError('Historical training cache header differs')
        buf='';ended=False
        while True:
            if not buf:buf=stream.read(65536)
            if not buf:raise ValueError('Truncated historical training cache')
            if buf.startswith(']'):
                tail=buf+stream.read()
                if tail.rstrip()!='],"schema":"retained-pregame-training-v1"}':
                    raise ValueError('Historical training cache schema differs')
                break
            if ended:
                if not buf.startswith(','):raise ValueError('Historical row delimiter differs')
                buf=buf[1:];ended=False
            while True:
                try:row,end=decoder.raw_decode(buf);break
                except json.JSONDecodeError:
                    more=stream.read(65536)
                    if not more:raise ValueError('Truncated historical training row')
                    buf+=more
            if not isinstance(row,dict):raise ValueError('Historical row must be an object')
            rows.append(fit_row(row));buf=buf[end:];ended=True
    return rows


def read(root, ref):
    name = PurePosixPath(ref['path'])
    if name.is_absolute() or '..' in name.parts or name.parts[0] not in ('work','config','outputs'):
        raise ValueError('Unapproved training evidence path')
    root = Path(root).resolve(); path = root / str(name)
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('Training evidence escapes repository')
    data = path.read_bytes()
    if obs.sha(data) != ref['sha256']:
        raise ValueError('Training evidence hash mismatch')
    return json.loads(gzip.decompress(data) if name.suffix == '.gz' else data)


def retain_base(root, data, replay):
    if obs.sha(data) != replay['retained_training_cache']['sha256']:
        raise ValueError('Historical training cache differs from replay')
    historical_rows(data)
    ref = {'path':f'{p.BASE}/training/{obs.sha(data)}.json.gz','sha256':obs.sha(data)}
    write_bytes(Path(root)/ref['path'], data, immutable=True)
    return ref


def paired_rows(rows):
    pairs = collections.defaultdict(dict); seen = set()
    for row in rows:
        if row.get('actual_points') is not None:
            raise ValueError('Training ledger must remain label-free')
        gid = row['game_id']; side = 'home' if row['home'] else 'away'; game = row['game']
        if row['row_id'] in seen or side in pairs[gid]:
            raise ValueError('Duplicate training row')
        seen.add(row['row_id'])
        if (row['row_id'] != gid+':'+row['team'] or game['game_id'] != gid
                or row['team'] != game[side+'_team']
                or row['opponent'] != game[('away' if row['home'] else 'home')+'_team']
                or row['season'] != int(game['season']) or row['week'] != int(game['week'])):
            raise ValueError('Training row identity differs')
        if set(game)-set(cs.features.GAME_FIELDS):
            raise ValueError('Unapproved training game fields')
        lineage = row['state_lineage']; deadline = p.time_of(game)
        if (lineage['role'] not in ('HISTORICAL_RECONSTRUCTION','FINAL_ELIGIBLE')
                or p.cutoff_before(deadline) != p.timestamp(lineage['cutoff_at'])):
            raise ValueError('Training role or cutoff differs')
        if row['features'].get('baseline') is None:
            raise ValueError('Training baseline missing; population cannot shrink')
        pairs[gid][side] = row
    if not pairs or any(set(x) != {'home','away'} for x in pairs.values()):
        raise ValueError('Paired training population required')
    return pairs


def reconstruct(root, ledger):
    """Render only the declared pre-activation games, never from today's state."""
    sources = ledger['sources']; schedule = read(root,sources['schedule'])
    schedule = [{k:g.get(k) for k in (*obs.GAME_KEYS,'source_hash')} for g in schedule if g['game_type']=='REG']
    by_game = {g['game_id']:g for g in schedule}
    if len(by_game) != len(schedule):raise ValueError('Duplicate reconstruction game')
    targets = ledger['reconstructed_games']
    if len(targets) != len(set(targets)) or not set(targets) <= set(by_game):
        raise ValueError('Reconstruction target population differs')
    statistics = collections.defaultdict(list)
    for row in read(root,sources['team_games']):
        statistics[row['game_id']].append({k:row.get(k) for k in (*obs.STAT_FIELDS,'source_hash')})
    stadiums = read(root,sources['stadiums'])
    by_cut = collections.defaultdict(list)
    for gid in targets:by_cut[p.cutoff_before(p.time_of(by_game[gid]))].append(by_game[gid])
    result = []; receipts = []
    for cutoff,games in sorted(by_cut.items()):
        finals = [g for g in schedule if all(g.get(s+'_score') not in ('',None) for s in ('home','away'))
                  and p.time_of(g)+dt.timedelta(minutes=75,hours=4)<cutoff]
        finals.sort(key=lambda g:(p.time_of(g),g['game_id']))
        if any(len(statistics[g['game_id']]) != 2 for g in finals):
            raise ValueError('Historical reconstruction lacks paired statistics')
        state = cs.features.reconstruct(finals,{g['game_id']:statistics[g['game_id']] for g in finals},ledger['method']['elo_hfa'])
        if set(state.incorporated) & set(g['game_id'] for g in games):
            raise ValueError('Target result leaked into reconstruction')
        context = {'cutoff_at':cutoff.isoformat(),'state_sha256':state.identity(),
                   'source_availability':'HISTORICAL_AVAILABILITY_ASSUMED'}
        by_issue = collections.defaultdict(list)
        for g in games:by_issue[p.time_of(g)].append({k:g.get(k) for k in cs.features.GAME_FIELDS})
        for issuance,slate in sorted(by_issue.items()):
            body = p.prepare(state,context,slate,stadiums,at=issuance,role='HISTORICAL_RECONSTRUCTION')
            p.validate_preparation(body);result.append(body)
        receipts.append({'cutoff_at':cutoff.isoformat(),'incorporated_games':state.incorporated,
                         'target_games':sorted(g['game_id'] for g in games),
                         'state_sha256':state.identity(),'availability':'ASSUMED_NOT_RECORDED'})
    return result,receipts


def qualify_base(root, ledger):
    replay = read(root,ledger['replay_ref']); method = cs.method(root,ledger['method_fit_ref'])
    if ledger['method'] != method:
        raise ValueError('Training ledger method differs')
    if cs.method(root,replay['sources']['active_method']) != method:
        raise ValueError('Historical training method differs')
    code = {x['path']:x['sha256'] for x in replay['code']}
    if any(code.get(k) != v for k,v in method['code'].items()):
        raise ValueError('Historical renderer code differs')
    if ledger['sources'] != {k:replay['sources'][k] for k in ('schedule','team_games','stadiums')}:
        raise ValueError('Transition sources differ from replay')
    if ledger['base_ref']['sha256'] != replay['retained_training_cache']['sha256']:
        raise ValueError('Historical base differs from replay')
    ref=ledger['base_ref']
    if ref['path']!=f'{p.BASE}/training/{ref["sha256"]}.json.gz':raise ValueError('Historical base path differs')
    path=Path(root)/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(Path(root).resolve()):raise ValueError('Historical base escapes repository')
    data=path.read_bytes()
    if obs.sha(data)!=ref['sha256']:raise ValueError('Historical base hash mismatch')
    rows=historical_rows(data);paired_rows(rows)
    if len(rows) != replay['training_rows'] or any(r['season']>=ledger['transition_season'] for r in rows):
        raise ValueError('Historical training boundary differs')
    audit = read(root,ledger['legacy_audit_ref'])
    if (sorted(ledger['reconstructed_games']) != sorted(r['game_id'] for r in audit['records'])
            or audit['population_games'] != len(ledger['reconstructed_games'])):
        raise ValueError('Legacy population lost or changed')
    return rows


def history(root, ref, *, method_ref=None):
    """Reverify source reconstruction and immutable locks before actual fitting."""
    ledger = p.load(root,ref,'training')
    if ledger.get('schema') != SCHEMA:raise ValueError('Training ledger schema differs')
    child=ledger;visited={ref['sha256']}
    immutable=('method','method_fit_ref','replay_ref','base_ref','legacy_audit_ref','transition_season',
               'sources','reconstructed_games','preparations','reconstruction_receipts','evidence')
    while child.get('parent'):
        parent_ref=child['parent']
        if parent_ref['sha256'] in visited:raise ValueError('Training ledger parent cycle')
        visited.add(parent_ref['sha256']);parent=p.load(root,parent_ref,'training')
        if (parent.get('schema')!=SCHEMA or any(parent[k]!=child[k] for k in immutable)
                or p.timestamp(parent['created_at'])>p.timestamp(child['created_at'])):
            raise ValueError('Training ledger changed its migration boundary')
        new={r['path']:r for r in child['recorded_locks']}
        if any(new.get(r['path'])!=r for r in parent['recorded_locks']) or not set(parent['training_games'])<=set(child['training_games']):
            raise ValueError('Training ledger dropped or revised prior games')
        child=parent
    rows = qualify_base(root,ledger)
    if method_ref and cs.method(root,method_ref) != ledger['method']:
        raise ValueError('Refit and training ledger methods differ')
    bodies,receipts = reconstruct(root,ledger)
    if receipts != ledger['reconstruction_receipts'] or len(bodies) != len(ledger['preparations']):
        raise ValueError('Reconstructed training state differs')
    for body,prep_ref in zip(bodies,ledger['preparations']):
        if p.load(root,prep_ref,'preparations') != body:
            raise ValueError('Training preparation does not reconstruct')
        rows.extend(fit_row(r) for r in body['rows'])
    from . import bundle, cutoff_publication as publication
    cache = {}
    for lock_ref in ledger['recorded_locks']:
        card = read(root,lock_ref)
        if lock_ref['path'] != f'outputs/projection-v3/locks/{card["game_id"]}.json':
            raise ValueError('Training source is not the original lock')
        if card['status'] not in ('LOCKED','FINAL') or card.get('evidence') != 'AS_ISSUED' or card.get('forecast_role') != 'FINAL_ELIGIBLE':
            raise ValueError('Training requires a final-eligible as-issued lock')
        if p.timestamp(card['freeze_time'])>p.timestamp(ledger['created_at']):
            raise ValueError('Training ledger predates lock')
        bundle.verify_card(root,card);publication.before_lock(root,card,cache=cache)
        forecast = p.load(root,card['cutoff_forecast_ref'],'forecasts')
        body = p.load(root,forecast['preparation_ref'],'preparations')
        if body['state']['method'] != ledger['method']:raise ValueError('Recorded training state method differs')
        rows.extend(fit_row(r) for r in body['rows'] if r['game_id']==card['game_id'])
    pairs = paired_rows(rows)
    if sorted(pairs) != ledger['training_games']:raise ValueError('Training ledger population differs')
    return sorted(rows,key=lambda r:r['row_id'])


def create(root, *, replay_ref, base_ref, legacy_audit_ref, method_ref, at):
    replay = read(root,replay_ref);audit = read(root,legacy_audit_ref)
    ledger = {'schema':SCHEMA,'created_at':p.timestamp(at).isoformat(),'method_fit_ref':method_ref,
        'method':cs.method(root,method_ref),'replay_ref':replay_ref,'base_ref':base_ref,
        'legacy_audit_ref':legacy_audit_ref,'transition_season':2026,
        'sources':{k:replay['sources'][k] for k in ('schedule','team_games','stadiums')},
        'reconstructed_games':sorted(r['game_id'] for r in audit['records']),
        'recorded_locks':[],'parent':None,'evidence':'HISTORICAL_RECONSTRUCTION_NOT_AS_ISSUED'}
    base = qualify_base(root,ledger);bodies,receipts = reconstruct(root,ledger)
    ledger['preparations'] = [p.store(root,'preparations',body) for body in bodies]
    ledger['reconstruction_receipts'] = receipts
    ledger['training_games'] = sorted(paired_rows(base+[r for body in bodies for r in body['rows']]))
    return p.store(root,'training',ledger)


def append_locks(root, parent_ref, lock_refs, *, at):
    """Preserve prior rows; same-lock retries deduplicate, changed locks fail."""
    history(root,parent_ref)
    ledger = p.load(root,parent_ref,'training');before = {r['path']:r for r in ledger['recorded_locks']}
    for ref in lock_refs:
        if ref['path'] in before and before[ref['path']] != ref:raise ValueError('Training lock revision rejected')
        before[ref['path']] = ref
    if sorted(before.values(),key=lambda r:r['path']) == ledger['recorded_locks']:return parent_ref
    ledger.update(parent=parent_ref,created_at=p.timestamp(at).isoformat(),recorded_locks=sorted(before.values(),key=lambda r:r['path']))
    ledger['training_games'] = sorted(set(ledger['training_games']) | {read(root,r)['game_id'] for r in lock_refs})
    ref = p.store(root,'training',ledger);history(root,ref)
    return ref
