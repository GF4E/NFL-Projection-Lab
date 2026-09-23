"""Content-addressed issuing evidence; no statistical activation or fitting.

The manifest captures the actual issuing components. It is not yet an executable
rollback mechanism. Earlier source-vintage gaps remain explicit in each bundle.
"""
import copy
import hashlib
import gzip
import io
import json
from pathlib import Path, PurePosixPath
import platform
import subprocess
import numpy as np
from .lineage import read_artifact
from .model import hash_value
from .scoring import SCHEMA, artifact_payload, validate_pair
from .storage import write_bytes, save

BASE = 'outputs/projection-v3'
PROTECTED = ('game_id','season','week','home','away','kickoff_at','cutoff_at','version',
             'issued_at','evidence','projection','contributions','why','personnel','forecast',
             'fit_artifact_ref','fit_sha256','calibration_ref','probability_semantics')
CODE_PATHS = (
    'engine/projection/pipeline_release.py','scripts/cloud_scheduler.py',
    'engine/projection/finals.py','engine/projection/source_archive.py',
    'scripts/board_v7_publish.py','scripts/board_v9_publish.py',
    'engine/projection/bundle.py', 'engine/projection/scoring.py', 'engine/projection/prepared.py',
    'engine/projection/scoring_process.py', 'scripts/projection_score_worker.py',
    'engine/projection/lineage.py','engine/projection/storage.py',
    'engine/projection/training_ledger.py','engine/projection/refit_release.py',
    'engine/projection/observations.py','engine/projection/cutoff_features.py','engine/forecast_system/cadence.py',
    'engine/projection/cutoff_state.py','engine/projection/cutoff_pipeline.py','engine/projection/cutoff_publication.py','engine/projection/cutoff_selection.py','engine/projection/cutoff_worker.py',
    'engine/projection/model.py','engine/projection/card.py','engine/projection/grade.py',
    'engine/projection/distribution.py','engine/projection_v3/card.py','engine/projection_v3/model.py',
    'engine/projection/features.py','engine/projection_v3/personnel.py','engine/elo.py','engine/elo_hfa.py',
    'engine/forecast_system/calendar.py','scripts/projection_v3_publish.py',
    'scripts/projection_prepare.py','scripts/projection_v3_prepare.py','scripts/projection_v3_sources.py',
    'scripts/projection_learning.py')


def raw(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)+'\n').encode()


def store(root, kind, value):
    if kind not in {'bundles','releases','input-manifests'}: raise ValueError('Unapproved bundle kind')
    data = raw(value)
    suffix = '.json'
    if kind == 'bundles':
        # GzipFile emits a fixed header (no filename/time/platform variability).
        buffer = io.BytesIO()
        with gzip.GzipFile(fileobj=buffer, mode='wb', filename='', mtime=0) as stream:
            stream.write(data)
        data = buffer.getvalue(); suffix = '.json.gz'
    sha = hashlib.sha256(data).hexdigest()
    ref = {'path':f'{BASE}/{kind}/{sha}{suffix}', 'sha256':sha}
    write_bytes(Path(root)/ref['path'], data, immutable=True)
    return ref


def resolve(root, ref, kind):
    if set(ref) != {'path','sha256'} or len(ref['sha256']) != 64:
        raise ValueError('Invalid bundle reference')
    path = PurePosixPath(ref['path'])
    suffix = '.json.gz' if kind == 'bundles' else '.json'
    if str(path) != f'{BASE}/{kind}/{ref["sha256"]}{suffix}' or '..' in path.parts:
        raise ValueError('Unapproved bundle reference')
    root = Path(root).resolve(); local = (root/str(path)).resolve()
    if not local.is_relative_to(root): raise ValueError('Bundle path escapes repository')
    data = local.read_bytes()
    if hashlib.sha256(data).hexdigest() != ref['sha256']: raise ValueError('Bundle hash mismatch')
    return json.loads(gzip.decompress(data) if kind == 'bundles' else data)


def capture_code(root):
    """Reject uncommitted scoring changes; artifact-only commits do not churn releases."""
    root = Path(root)
    commit = subprocess.check_output(['git','log','-1','--format=%H','--',*CODE_PATHS], cwd=root, text=True).strip()
    hashes = {}
    for path in CODE_PATHS:
        data = (root/path).read_bytes()
        recorded = subprocess.check_output(['git','show',f'{commit}:{path}'], cwd=root, stderr=subprocess.DEVNULL)
        if data != recorded: raise ValueError('Issuing code differs from its recorded commit')
        hashes[path] = hashlib.sha256(data).hexdigest()
    return {'commit':commit, 'files':hashes,
            'environment':{'python':platform.python_version(), 'implementation':platform.python_implementation(),
                           'numpy':np.__version__, 'system':platform.system(), 'machine':platform.machine()},
            'environment_scope':'Scorer runtime identity, not a fully archived environment'}


def release_for(root, ref, artifact):
    if read_artifact(root, ref) != artifact: raise ValueError('Fit changed during publication')
    read_artifact(root, artifact['shapes'])
    components = {'schema':'projection-release-v1', 'input_schema':SCHEMA,
                  'output_schema':'projection-scoring-bundle-v1', 'code':capture_code(root),
                  'version':artifact['version'], 'fit_artifact_ref':ref,
                  'fit_sha256':hash_value(artifact['fit']), 'calibration_ref':artifact['shapes'],
                  'scoring_artifact_sha256':hash_value(artifact_payload(artifact)),
                  'settings':{'groups':artifact['groups'], 'selected':artifact['selected']},
                  'training':{'population_hash':artifact['fit']['training_hash'],
                              'historical_features':artifact.get('historical_features'),
                              'through_week':artifact.get('through_week'),
                              'parent_version':artifact.get('parent_version')},
                  'point_semantics':'LEGACY_RIDGE_CENTER; not relabeled as calibrated predictive mean',
                  'probability_semantics':'P(win) plus half P(tie)',
                  'seed':{'status':'NOT_APPLICABLE','reason':'Deterministic empirical residual lookup'},
                  'release_role':'CAPTURED_ISSUING_MANIFEST; compatible executable rollback pending'}
    from . import pipeline_release
    pipeline_ref=pipeline_release.pointer(root,pipeline_release.ACTIVE)
    if pipeline_ref:
        pipeline_release.guard(root)
        components['pipeline_release_ref']=pipeline_ref
    pointer = Path(root)/BASE/'current-release-ref.json'
    previous = json.loads(pointer.read_bytes()) if pointer.exists() else None
    if previous:
        old = resolve(root, previous, 'releases')
        if {k:v for k,v in old.items() if k != 'release_parent'} == components:
            return previous
    release = {**components, 'release_parent':previous}
    current = store(root, 'releases', release)
    save(pointer, current)  # Manifest is durable before its derivative pointer.
    return current


def attach(root, card, request, release_ref, prepared_manifest):
    from . import cutoff_publication
    validate_pair(request)
    release = resolve(root, release_ref, 'releases')
    if (request['game_id'] != card['game_id'] or release['version'] != card['version']
        or release['fit_artifact_ref'] != card['fit_artifact_ref']
        or release['fit_sha256'] != card['fit_sha256']
        or release['calibration_ref'] != card['calibration_ref']):
        raise ValueError('Card and issuing release differ')
    for side in ('away','home'):
        from .card import code
        if code(request['rows'][side]['team']) != card[side]: raise ValueError('Bundle team mismatch')
    manifest_ref = store(root, 'input-manifests', prepared_manifest)
    body = {'schema':'projection-scoring-bundle-v1', 'release_ref':release_ref,
            'input':request, 'prepared_manifest_ref':manifest_ref,
            'forecast':{**{key:copy.deepcopy(card[key]) for key in PROTECTED},**cutoff_publication.protected(card)},
            'chronology':{'status':'LEGACY_SOURCE_VINTAGES_NOT_QUALIFIED',
                          'state_cutoff':None, 'input_event_times':None,
                          'source_publication_times':None, 'source_first_seen_times':None,
                          'source_retrieval_times':'Only entries explicitly recorded in prepared manifest',
                          'reason':'Exact captured values/hashes; unavailable times are not inferred'},
            'derivatives':'Card may add edits, lock, grade and display fields; forecast fields remain exact'}
    if cutoff_publication.protected(card):
        body['chronology']=cutoff_publication.chronology(root,card)
        forecast=cutoff_publication.validate_card(root,card)
        if request!=forecast['input']:raise ValueError('Bundle input differs from cutoff calculation')
    ref = store(root, 'bundles', body)
    return {**card, 'forecast_bundle_ref':ref, 'release_ref':release_ref}


def verify_card(root, card):
    from . import cutoff_publication
    if cutoff_publication.protected(card) and (not card.get('forecast_bundle_ref') or not card.get('release_ref')):
        raise ValueError('Cutoff forecast requires its immutable bundle and release')
    if 'forecast_bundle_ref' not in card and 'release_ref' not in card:
        return None  # Existing history retains the frozen legacy convention.
    if not card.get('forecast_bundle_ref') or not card.get('release_ref'):
        raise ValueError('Incomplete forecast bundle references')
    bundle = resolve(root, card['forecast_bundle_ref'], 'bundles')
    if bundle.get('schema') != 'projection-scoring-bundle-v1' or bundle['release_ref'] != card['release_ref']:
        raise ValueError('Unsupported or incompatible forecast bundle')
    if bundle['forecast'] != {**{key:card[key] for key in PROTECTED},**cutoff_publication.protected(card)}:
        raise ValueError('Card differs from immutable forecast bundle')
    validate_pair(bundle['input'])
    resolve(root, bundle['prepared_manifest_ref'], 'input-manifests')
    release = resolve(root, card['release_ref'], 'releases')
    if (release.get('schema') != 'projection-release-v1' or release['input_schema'] != SCHEMA
        or release['output_schema'] != bundle['schema'] or release['version'] != card['version']
        or release['fit_artifact_ref'] != card['fit_artifact_ref']
        or release['fit_sha256'] != card['fit_sha256'] or release['calibration_ref'] != card['calibration_ref']):
        raise ValueError('Forecast release compatibility failed')
    artifact = read_artifact(root, release['fit_artifact_ref'])
    if (hash_value(artifact['fit']) != release['fit_sha256'] or artifact['shapes'] != release['calibration_ref']
        or hash_value(artifact_payload(artifact)) != release['scoring_artifact_sha256']):
        raise ValueError('Release components differ')
    read_artifact(root, release['calibration_ref'])
    if release.get('pipeline_release_ref'):
        # Old locks resolve their original manifest, never the current active
        # mode/configuration. Rollback cannot relabel an already issued forecast.
        from . import pipeline_release
        pipeline=pipeline_release.read(root,release['pipeline_release_ref'],'manifests')
        metadata=resolve(root,bundle['prepared_manifest_ref'],'input-manifests')
        if (pipeline['code']!=release['code'] or pipeline['fit_ref']!=release['fit_artifact_ref']
                or pipeline['calibration_ref']!=release['calibration_ref']
                or pipeline_release.mode(metadata)!=pipeline['mode']):
            raise ValueError('Forecast pipeline release differs')
    if cutoff_publication.protected(card):
        forecast=cutoff_publication.validate_card(root,card)
        if bundle['input']!=forecast['input']:raise ValueError('Cutoff bundle input differs')
        if bundle['chronology']!=cutoff_publication.chronology(root,card):raise ValueError('Cutoff bundle chronology differs')
        cutoff_publication.verify_receipt(root,card)
    return bundle
