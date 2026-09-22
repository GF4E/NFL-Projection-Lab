"""Cutoff contract for the actual publisher; no activation or state selection.

The prepared manifest selects this path explicitly. Existing legacy bundles keep
their original field set. An issuer calculation is not yet an issued card.
"""
import copy
import datetime as dt
import json
from pathlib import Path

from . import cutoff_pipeline as pipeline
from .storage import save
from engine.forecast_system.calendar import timestamp

FIELDS=('cutoff_forecast_ref','forecast_role')
RECEIPTS='outputs/projection-v3/issuance-receipts'


def protected(card):
    if any(k in card for k in FIELDS):
        if not all(k in card for k in FIELDS):raise ValueError('Incomplete cutoff card contract')
        return {k:copy.deepcopy(card[k]) for k in FIELDS}
    return {}


def calculation(root,preparation_ref,fit_ref,pair,cache):
    key=preparation_ref['sha256']
    if key not in cache:
        body=pipeline.load(root,preparation_ref,'preparations')
        refs=pipeline.recorded_scores(root,preparation_ref,fit_ref,purpose='ISSUER_PREPARATION')
        cache[key]=(body,refs)
    body,refs=cache[key];gid=pair['home']['game_id']
    expected={r['team']:r for r in body['rows'] if r['game_id']==gid}
    if expected!={r['team']:r for r in pair.values()}:raise ValueError('Publisher rows differ from cutoff preparation')
    ref=refs[gid];forecast=pipeline.load(root,ref,'forecasts')
    if forecast['fit_ref']!=fit_ref or forecast['status']!='ISSUER_PREPARATION':raise ValueError('Wrong issuer calculation')
    receipt=json.loads((Path(root)/pipeline.BASE/'scoring-receipts'/(ref['sha256']+'.json')).read_bytes())
    if receipt['forecast_ref']!=ref or receipt['status']!='COMMITTED_PREDEADLINE':raise ValueError('Issuer calculation missed deadline')
    return forecast,ref,receipt['completed_at']


def validate_card(root,card):
    """Exact immutable association; arithmetic is rechecked before first lock."""
    if not protected(card):return None
    forecast=pipeline.load(root,card['cutoff_forecast_ref'],'forecasts')
    if (forecast['status']!='ISSUER_PREPARATION' or forecast['role']!=card['forecast_role']
            or forecast['game_id']!=card['game_id'] or forecast['fit_ref']!=card['fit_artifact_ref']
            or forecast['calibration_ref']!=card['calibration_ref']):
        raise ValueError('Cutoff card/calculation identity differs')
    if any(card[k]!=forecast[k] for k in ('projection','contributions','why')):
        raise ValueError('Cutoff card differs from committed calculation')
    if timestamp(card['cutoff_at'])!=pipeline.time_of(forecast['game']):raise ValueError('Cutoff card deadline differs')
    if (timestamp(card['kickoff_at'])!=pipeline.time_of(forecast['game'])+dt.timedelta(minutes=75)
            or int(card['season'])!=int(forecast['game']['season']) or int(card['week'])!=int(forecast['game']['week'])):
        raise ValueError('Cutoff card schedule identity differs')
    receipt=json.loads((Path(root)/pipeline.BASE/'scoring-receipts'/(card['cutoff_forecast_ref']['sha256']+'.json')).read_bytes())
    if (receipt['forecast_ref']!=card['cutoff_forecast_ref'] or receipt['status']!='COMMITTED_PREDEADLINE'
            or timestamp(card['issued_at'])!=timestamp(receipt['completed_at'])
            or timestamp(card['issued_at'])>=pipeline.time_of(forecast['game'])):
        raise ValueError('Card issuance differs from scoring commit')
    if card['status'] in ('LOCKED','FINAL') and card['forecast_role']!='FINAL_ELIGIBLE':
        raise ValueError('Provisional card cannot be locked or graded')
    return forecast


def issuance_receipt(root,card):
    validate_card(root,card)
    from .bundle import resolve,PROTECTED
    body=resolve(root,card['forecast_bundle_ref'],'bundles')
    if body['forecast']!={**{k:card[k] for k in PROTECTED},**protected(card)}:
        raise ValueError('Issuance bundle differs from card')
    ref=card['forecast_bundle_ref'];path=Path(root)/RECEIPTS/(ref['sha256']+'.json')
    if path.exists():
        return verify_receipt(root,card)
    committed=timestamp(pipeline.now())
    if committed>=timestamp(card['cutoff_at']) or committed<timestamp(card['issued_at']):
        raise ValueError('Immutable issuance bundle missed deadline')
    body={'schema':'cutoff-card-issuance-v1','forecast_bundle_ref':ref,
          'cutoff_forecast_ref':card['cutoff_forecast_ref'],'committed_at':committed.isoformat(),
          'state':'DURABLE_PREDEADLINE_CARD'}
    save(path,body,immutable=True)
    return body


def verify_receipt(root,card):
    ref=card['forecast_bundle_ref']
    body=json.loads((Path(root)/RECEIPTS/(ref['sha256']+'.json')).read_bytes())
    if (body.get('schema')!='cutoff-card-issuance-v1' or body.get('state')!='DURABLE_PREDEADLINE_CARD'
            or body['forecast_bundle_ref']!=ref or body['cutoff_forecast_ref']!=card['cutoff_forecast_ref']
            or timestamp(body['committed_at'])>=timestamp(card['cutoff_at'])
            or timestamp(body['committed_at'])<timestamp(card['issued_at'])):
        raise ValueError('Invalid predeadline issuance receipt')
    return body


def before_lock(root,card,*,cache=None):
    if not protected(card):return
    forecast=validate_card(root,card)
    pipeline.lockable(forecast,card['cutoff_at'])
    verify_receipt(root,card)
    pipeline.verify_forecast(root,card['cutoff_forecast_ref'],cache=cache)


def chronology(root,card):
    forecast=validate_card(root,card)
    prepared=pipeline.load(root,forecast['preparation_ref'],'preparations')
    return {'status':'RECORDED_CUTOFF_INPUTS','forecast_role':forecast['role'],
            'state_lineage':forecast['state_lineage'],'preparation_ref':forecast['preparation_ref'],
            'schedule_evidence':prepared['schedule_evidence'],
            'stadium_configuration':'Exact retained DTO; historical vintage not independently qualified',
            'calibration':'UNCHANGED_LEGACY_CALIBRATION','point_semantics':'LEGACY_RIDGE_CENTER'}
