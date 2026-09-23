"""Read-only initial-release evidence checks; never approval or activation.

Review authorship must be established outside this verifier. A locally written
reviewer name is not proof that a reviewer supplied a decision.
"""
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_ref(root, ref):
    if not isinstance(ref, dict) or set(ref) != {'path', 'sha256'}:
        raise ValueError('Exact evidence reference required')
    name=PurePosixPath(ref['path'])
    if name.is_absolute() or '..' in name.parts or str(name)!=ref['path']:
        raise ValueError('Unsafe evidence path')
    root=Path(root).resolve();path=root/ref['path']
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('Evidence escapes repository')
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):h.update(block)
    if h.hexdigest()!=ref['sha256']:raise ValueError('Evidence hash differs: '+ref['path'])
    return path


def read(root, ref, *, compressed=False):
    path=verify_ref(root,ref);raw=path.read_bytes()
    return json.loads(gzip.decompress(raw) if compressed else raw)


def recovery(root, acceptance_ref, consumer_ref):
    accepted=read(root,acceptance_ref);consumer=read(root,consumer_ref)
    if accepted.get('status')!='SAME_HOST_EXECUTABLE_RESTORE_VERIFIED':
        raise ValueError('Executable recovery not verified')
    if accepted.get('consumer_receipt_sha256')!=consumer_ref['sha256']:
        raise ValueError('Recovery acceptance refers to another consumer')
    unit=accepted.get('unit',{})
    if (unit.get('ActiveState')!='inactive' or unit.get('Result')!='success'
            or str(unit.get('ExecMainStatus'))!='0'):
        raise ValueError('Recovery job is not terminal-success')
    if consumer.get('status')!='RESTORED_CONSUMER_PASS':raise ValueError('Consumer did not pass')
    if (not consumer.get('namespace_isolation_verified') or not consumer.get('read_only_restored_mounts')
            or not accepted.get('original_mounts_and_namespaces_unchanged')):
        raise ValueError('Recovery isolation proof missing')
    for key in ('source_commit','runtime_manifest_sha256','parity','lifecycle'):
        if accepted.get(key)!=consumer.get(key):raise ValueError('Recovery acceptance contents differ')
    life=consumer['lifecycle']
    if life.get('status')!='PASS' or life.get('locks')!=life.get('slate_games') or life.get('synthetic_grades')!=life.get('slate_games'):
        raise ValueError('Incomplete recovered lifecycle')
    if not life.get('original_bundles_graded_after_rollback') or not life.get('numerical_retry_skipped'):
        raise ValueError('Recovered retry/rollback proof missing')
    if consumer['elapsed_seconds']>=570 or life['peak_rss_bytes']>4*1024**3:
        raise ValueError('Recovered consumer exceeds resource ceiling')
    if accepted['original_records_and_pointers_unchanged']!=life['original_source_records_preserved']+1:
        raise ValueError('Original record/pointer count differs')
    if accepted['external_native_files_verified']!=len(consumer['external_native_files']):
        raise ValueError('Native dependency count differs')
    return consumer


def check(root, packet_ref, *, runtime_manifest=None):
    root=Path(root);packet=read(root,packet_ref)
    if packet.get('schema')!='initial-chronology-release-review-v1':raise ValueError('Unsupported release packet')
    if packet.get('authorizes_activation') is not False:raise ValueError('Review packet cannot activate')
    for ref in packet['documents']:verify_ref(root,ref)
    evidence=packet['evidence']
    checks=[]
    def add(name,status,detail):checks.append({'name':name,'status':status,'detail':detail})
    consumer=recovery(root,evidence['recovery_acceptance'],evidence['restored_consumer'])
    add('RECOVERED_EXECUTABLE','PASS',consumer['source_commit'])
    expected=consumer['lifecycle']['code']['files']
    actual={name:sha((root/name).read_bytes()) for name in expected}
    if actual!=expected:raise ValueError('Current issuing source differs from recovered source')
    add('ISSUING_SOURCE','PASS',len(expected))
    fit=read(root,packet['fit_ref'])
    if json.loads((root/'work/in-season-learning-v1/active-fit-ref.json').read_bytes())!=packet['fit_ref']:
        raise ValueError('Active fit changed since packet')
    if consumer['lifecycle']['parent_fit']!=packet['fit_ref'] or fit['shapes']!=packet['calibration_ref']:
        raise ValueError('Recovery/packet fit or calibration differs')
    read(root,packet['calibration_ref'])
    add('FIT_AND_CALIBRATION','PASS',packet['fit_ref']['sha256'])
    training=read(root,packet['training_ref'],compressed=True)
    if training.get('method_fit_ref')!=packet['fit_ref'] or training.get('replay_ref')!=packet['replay_ref']:
        raise ValueError('Training history differs from packet')
    # Replay contains large explanation objects; admission verifies identity
    # without materializing or evaluating its historical rows.
    verify_ref(root,packet['replay_ref'])
    add('TRAINING_HISTORY_BINDING','PASS',packet['training_ref']['sha256'])
    closeout=read(root,evidence['public_closeout'])
    if closeout.get('status')!='HTTP_BYTES_VERIFIED':raise ValueError('Public closeout proof unqualified')
    for name,digest in closeout['artifacts'].items():
        read(root,{'path':name,'sha256':digest})
    add('RETAINED_PUBLIC_CLOSEOUT','PASS',closeout['observed_at'])
    if runtime_manifest is None:
        add('CURRENT_RUNTIME','NOT_CHECKED','Private accepted full-runtime manifest required; copying proof is not a fresh runtime check')
    else:
        from .runtime_snapshot import verify
        raw=Path(runtime_manifest).read_bytes()
        if sha(raw)!=consumer['runtime_manifest_sha256']:raise ValueError('Private runtime manifest differs')
        manifest=json.loads(raw)
        if str(Path(sys.prefix).resolve())!=str(Path(manifest['source_prefix']).resolve()):
            raise ValueError('Preflight is not running in the accepted interpreter prefix')
        verify(manifest['source_prefix'],manifest)
        for name,digest in consumer['external_native_files'].items():
            if sha(Path(name).read_bytes())!=digest:raise ValueError('Current native dependency differs: '+name)
        add('CURRENT_RUNTIME','PASS',consumer['runtime_manifest_sha256'])
    # This increment deliberately has no self-issued approval/activation route.
    for reviewer in ('Claude','Dr. M'):
        add('EXTERNAL_REVIEW_'+reviewer,'NOT_RECORDED','Actual decision on this packet and its listed conventions is required; no decision is inferred')
    add('LIVE_TRANSITION','NOT_INSTALLED','Enforced operator transition, qualified bootstrap and actual issuing/public provenance remain required')
    return {'schema':'initial-release-preflight-v1','status':'BLOCKED','packet_ref':packet_ref,
            'checks':checks,'activation':False,'control_authority_changed':False,'provider_requests':0,
            'scope':'Read-only evidence binding; not an experiment, approval, runtime switch or production readiness certificate'}
