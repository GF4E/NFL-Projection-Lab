"""Checked, same-fit preparation-mode transitions; no statistical promotion.

No active manifest is installed by importing this module. General code/fit
rollback and the activated weekly-refit handoff still require qualification.
"""
import datetime as dt
import fcntl
import json
from pathlib import Path
import re

from . import bundle, prepared
from .lineage import read_artifact
from .model import hash_value
from .storage import save

BASE = 'outputs/projection-v3/pipeline-releases'
ACTIVE = BASE + '/active.json'
OPERATION = BASE + '/operation.json'
OWNER = 'work/cloud-migration-v1/ownership.json'
EXTRA_CODE = ('scripts/cloud_scheduler.py', 'engine/projection/pipeline_release.py',
              'engine/projection/finals.py', 'engine/projection/source_archive.py',
              'scripts/board_v7_publish.py', 'scripts/board_v9_publish.py')


def source(root):
    """Capture extra consumer files from the same exact issuing-code commit."""
    from .executable import git
    code = bundle.capture_code(root)
    files = dict(code['files'])
    for name in EXTRA_CODE:
        data = (Path(root) / name).read_bytes()
        if data != git(root, 'show', code['commit'] + ':' + name):
            raise ValueError('Pipeline source differs from issuing commit')
        files[name] = prepared.sha(data)
    return {**code, 'files': files}


def store(root, kind, value):
    if kind not in ('manifests', 'intents', 'receipts'):
        raise ValueError('Invalid pipeline release record kind')
    digest = prepared.sha(prepared.raw(value))
    ref = {'path': f'{BASE}/{kind}/{digest}.json', 'sha256': digest}
    save(Path(root) / ref['path'], value, immutable=True)
    return ref


def read(root, ref, kind):
    if (not isinstance(ref, dict) or set(ref) != {'path', 'sha256'}
            or not re.fullmatch('[0-9a-f]{64}', ref['sha256'])
            or ref['path'] != f'{BASE}/{kind}/{ref["sha256"]}.json'):
        raise ValueError('Invalid pipeline release reference')
    root = Path(root).resolve(); path = root / ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('Pipeline release reference escapes repository')
    data = path.read_bytes()
    if prepared.sha(data) != ref['sha256']:
        raise ValueError('Pipeline release hash mismatch')
    return json.loads(data)


def pointer(root, name):
    path = Path(root) / name
    return json.loads(path.read_bytes()) if path.exists() else None


def mode(metadata):
    if metadata.get('scheduled_selection'):
        if metadata.get('cutoff_mode') != 'RECORDED_CUTOFF_V1':
            raise ValueError('Scheduled release lacks cutoff contract')
        return 'SCHEDULED'
    if metadata.get('cutoff_mode') or metadata.get('cutoff_preparations'):
        raise ValueError('Manual cutoff preparation is not a production release')
    return 'LEGACY'


def publication_games(rows, metadata):
    # Same eligibility as the publisher; a rollback must not hide visible games.
    week=metadata.get('publication_week',min(18,max([int(r['week']) for r in rows
                         if r.get('actual_points') is not None]+[1])+1))
    return sorted({r['game_id'] for r in rows if int(r['week'])<=week})


def validate(root, manifest, *, reconstruct=False):
    from . import cutoff_pipeline as pipeline, cutoff_selection as selection, cutoff_worker as worker, cutoff_state
    if manifest.get('schema') != 'projection-pipeline-release-v1':
        raise ValueError('Unsupported pipeline release')
    if source(root) != manifest['code']:
        raise ValueError('Pipeline code or runtime identity differs')
    artifact = read_artifact(root, manifest['fit_ref'])
    read_artifact(root, manifest['calibration_ref'])
    if artifact['shapes'] != manifest['calibration_ref'] or hash_value(artifact['fit']) != manifest['fit_sha256']:
        raise ValueError('Pipeline fit/calibration differs')
    rows, metadata, _ = prepared.load(root, ref=manifest['prepared_ref'])
    if metadata['fit'] != manifest['fit_ref'] or mode(metadata) != manifest['mode']:
        raise ValueError('Pipeline prepared checkpoint differs')
    if manifest['publication_games']!=publication_games(rows,metadata):
        raise ValueError('Pipeline publication population differs')
    if manifest['mode'] == 'SCHEDULED':
        config = selection.configuration(root, manifest['configuration_ref'])
        current = worker.configuration(root, config['owner'])
        if current != config or config['fit_ref'] != manifest['fit_ref']:
            raise ValueError('Pipeline state configuration differs')
        for ref in {r['sha256']: r for r in metadata['cutoff_preparations'].values()}.values():
            body = pipeline.load(root, ref, 'preparations')
            if cutoff_state.read(root, body['state']['state_ref'])['fit_ref'] != manifest['fit_ref']:
                raise ValueError('Pipeline prepared state fit differs')
            if reconstruct:
                pipeline.verify_preparation(root, body)
    elif manifest['configuration_ref'] is not None:
        raise ValueError('Legacy release has a state selection configuration')
    return metadata


def checkpoint(root, *, label):
    """Retain the current compatible checkpoint. Caller owns writer and fence."""
    from . import cutoff_selection as selection
    rows, metadata, _ = prepared.load(root)
    if not metadata.get('prepared_manifest_ref'):
        raise ValueError('Immutable prepared checkpoint required')
    ref = prepared.active_fit(root); artifact = read_artifact(root, ref)
    selected = mode(metadata)
    config_ref = selection.retain_configuration(root)[0] if selected == 'SCHEDULED' else None
    manifest = {'schema': 'projection-pipeline-release-v1', 'mode': selected,
                'code': source(root), 'fit_ref': ref, 'calibration_ref': artifact['shapes'],
                'fit_sha256': hash_value(artifact['fit']), 'configuration_ref': config_ref,
                'prepared_ref': metadata['prepared_manifest_ref'], 'label': label,
                'publication_games':publication_games(rows,metadata),
                'scope': 'Same-fit preparation transition; code/runtime changes and weekly refit handoff require separate qualification'}
    validate(root, manifest, reconstruct=True)
    return store(root, 'manifests', manifest)


def guard(root):
    """Actual consumers reject pending transitions and incompatible active modes."""
    operation = pointer(root, OPERATION)
    if operation:
        intent = read(root, operation['intent_ref'], 'intents')
        receipt_ref = operation.get('receipt_ref')
        if not receipt_ref:
            raise ValueError('Pipeline release transition requires reconciliation')
        receipt = read(root, receipt_ref, 'receipts')
        if receipt != {'intent_ref': operation['intent_ref'], 'state': 'COMMITTED', 'target': intent['target']}:
            raise ValueError('Pipeline release completion differs')
        if pointer(root, ACTIVE) != intent['target']:
            raise ValueError('Pipeline active release differs from completion')
    ref = pointer(root, ACTIVE)
    if not ref:
        return None
    manifest = read(root, ref, 'manifests')
    validate(root, manifest)
    _, metadata, _ = prepared.load(root)
    if prepared.active_fit(root) != manifest['fit_ref'] or metadata['fit'] != manifest['fit_ref']:
        raise ValueError('Pipeline active fit requires qualified release handoff')
    if mode(metadata) != manifest['mode']:
        raise ValueError('Pipeline current preparation mode differs')
    return manifest


def switch(root, target, *, owner, operation_id, expected_active):
    """Explicit fenced operation; no retries, provider calls or code checkout.

    Lost responses resume with the identical ID/payload. The caller must first
    have verified remote ownership. This function rechecks local fence bytes and
    holds the actual dispatch and preparation locks through acknowledgment.
    """
    root = Path(root)
    if not re.fullmatch('[A-Za-z0-9_-]{1,80}', operation_id):
        raise ValueError('Invalid release operation ID')
    lock = root / 'outputs/model-pick-v1/.cloud-dispatch.lock'
    lock.parent.mkdir(parents=True, exist_ok=True)
    with lock.open('a+') as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('Scheduler writer already active') from None
        with prepared.writer(root):
            fence = pointer(root, OWNER)
            if not fence or fence.get('state') != 'ACTIVE' or fence.get('owner') != owner:
                raise ValueError('Release owner differs')
            manifest = read(root, target, 'manifests')
            metadata = validate(root, manifest, reconstruct=True)
            if prepared.active_fit(root) != manifest['fit_ref']:
                raise ValueError('Cross-fit rollback requires qualified release handoff')
            current_rows,current_metadata,_=prepared.load(root)
            if not set(publication_games(current_rows,current_metadata))<=set(manifest['publication_games']):
                raise ValueError('Rollback would omit current publication games; prepare a compatible checkpoint')
            id_path = f'{BASE}/operation-ids/{operation_id}.json'
            old = pointer(root, id_path)
            request = {'target': target, 'owner': fence, 'expected_active': expected_active,
                       'operation_id': operation_id}
            pending = pointer(root, OPERATION)
            if old:
                intent = read(root, old, 'intents')
                if any(intent[k] != v for k, v in request.items()):
                    raise ValueError('Release operation ID reused with changed payload')
                if not pending or pending['intent_ref'] != old:
                    if pending != intent['previous_operation']:
                        raise ValueError('Release operation superseded; cannot replay old switch')
                    if prepared.current(root)!=intent['prepared_before'] or pointer(root,ACTIVE)!=expected_active:
                        raise ValueError('Release changed before pending intent acknowledgment')
                    save(root / OPERATION, {'intent_ref': old})
                elif pending.get('receipt_ref'):
                    guard(root)
                    return {'state':'COMMITTED','release_ref':target,'receipt_ref':pending['receipt_ref']}
            else:
                if pending and not pending.get('receipt_ref'):
                    raise ValueError('Another release transition requires reconciliation')
                guard(root)
                if pointer(root, ACTIVE) != expected_active:
                    raise ValueError('Release compare-and-swap failed')
                before = prepared.current(root)
                intent = {**request, 'prepared_before': before, 'previous_operation':pending,
                          'started_at': dt.datetime.now(dt.timezone.utc).isoformat()}
                old = store(root, 'intents', intent)
                save(root / id_path, old, immutable=True)
                save(root / OPERATION, {'intent_ref': old})
            current = prepared.current(root)
            if current not in (intent['prepared_before'], metadata):
                raise ValueError('Preparation changed outside release transaction')
            if pointer(root, ACTIVE) not in (expected_active, target):
                raise ValueError('Active release changed outside transaction')
            if pointer(root, OWNER) != fence:
                raise ValueError('Release fence changed during verification')
            save(root / prepared.POINTER, metadata)
            save(root / ACTIVE, target)
            receipt = store(root, 'receipts', {'intent_ref': old, 'state': 'COMMITTED', 'target': target})
            save(root / OPERATION, {'intent_ref': old, 'receipt_ref': receipt})
            guard(root)
            return {'state': 'COMMITTED', 'release_ref': target, 'receipt_ref': receipt}
