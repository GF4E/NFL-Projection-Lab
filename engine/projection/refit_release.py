"""Immutable issuing envelopes for recorded weight-only fits; no activation."""
import copy
from pathlib import Path

from . import cutoff_pipeline as pipeline, prepared
from .lineage import read_artifact
from .scoring import artifact_payload
from .storage import write_bytes

# Fields that identify a fit's lineage, rather than its statistical method.
LINEAGE = {'fit', 'version', 'parent_version', 'issued_at', 'through_week',
           'recorded_refit_ref', 'parent_fit_ref'}
SHADOW_FIELDS = {'fit','role','scheduled_cutoff','training_cutoff','through_week',
                 'training_games','training_exclusions','closeout_evidence','parent_training_hash',
                 'parent_fit_ref','state_ref','training_ref','label_observation_ref','fit_started_at',
                 'computation_completed_at','created_at','issued_at','intent_sha256','publication_limit'}


def compatible(root, left, right):
    """Reject every non-lineage change, including unrecognized new fields."""
    a=read_artifact(root,left); b=read_artifact(root,right)
    for artifact in (a,b):
        pipeline.settings(artifact); artifact_payload(artifact)
    if {k:v for k,v in a.items() if k not in LINEAGE}!={k:v for k,v in b.items() if k not in LINEAGE}:
        raise ValueError('Weight-only release changes method or calibration')
    for key in ('groups','names','penalty'):
        if a['fit'][key]!=b['fit'][key]:
            raise ValueError('Weight-only release changes fit settings')


def envelope(root, ref):
    shadow=pipeline.read_fit(root,ref)
    if shadow.get('role')!='SHADOW_WEIGHT_ONLY' or not ref['path'].startswith(pipeline.BASE+'/shadow-fits/'):
        raise ValueError('Recorded weight-only fit required')
    parent=read_artifact(root,shadow['parent_fit_ref'])
    pipeline.settings(parent); artifact_payload(shadow)
    if {k:v for k,v in shadow.items() if k not in SHADOW_FIELDS}!={k:v for k,v in parent.items() if k not in SHADOW_FIELDS}:
        raise ValueError('Recorded refit changes parent method')
    if shadow['parent_training_hash']!=parent['fit']['training_hash']:
        raise ValueError('Recorded refit parent training differs')
    for key in ('groups','names','penalty'):
        if shadow['fit'][key]!=parent['fit'][key]:raise ValueError('Recorded refit settings differ')
    at=pipeline.fit_available_at(root,ref,shadow)
    # Do not relabel a saved fit as publicly qualified. The handoff still has to
    # qualify the closeout, compatible preparation and release activation.
    result=copy.deepcopy(parent)
    result.update(fit=shadow['fit'],parent_version=parent['version'],
                  version=f"{parent.get('version_prefix','projection-v2')}.w{shadow['through_week']+1}",
                  through_week=shadow['through_week'],issued_at=at.isoformat(),
                  recorded_refit_ref=ref,parent_fit_ref=shadow['parent_fit_ref'])
    return result


def retain(root, ref):
    body=envelope(root,ref);raw=prepared.raw(body)
    target={'path':f'work/in-season-learning-v1/recorded-fit-{prepared.sha(raw)}.json',
            'sha256':prepared.sha(raw)}
    write_bytes(Path(root)/target['path'],raw,immutable=True)
    compatible(root,body['parent_fit_ref'],target)
    return target


def verify(root, ref):
    body=read_artifact(root,ref)
    if not body.get('recorded_refit_ref') or envelope(root,body['recorded_refit_ref'])!=body:
        raise ValueError('Issuing fit differs from recorded refit')
    return body


def linked(root,left,right):
    """A forward release or rollback must follow recorded parent references."""
    compatible(root,left,right)
    def ancestors(ref):
        seen=set();result=[]
        while True:
            key=(ref['path'],ref['sha256'])
            if key in seen:raise ValueError('Recorded refit lineage cycle')
            seen.add(key);result.append(ref)
            body=read_artifact(root,ref)
            if not body.get('recorded_refit_ref'):return result
            verify(root,ref);ref=body['parent_fit_ref']
    a=ancestors(left);b=ancestors(right)
    if left not in b and right not in a:
        raise ValueError('Fit handoff is not a recorded ancestor transition')
