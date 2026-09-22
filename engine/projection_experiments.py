"""Pure governance checks; eligibility never activates a method or writes a fit."""
import datetime as dt
import hashlib
import json
import math


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


CALIBRATION_GATE = 'calibration_lineage_v1'
POINT_TOLERANCE = 1e-12


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('Finite numerical gate evidence required')
    return value


def _calibration_reasons(registration, evidence):
    """Only the adopted E-CAL-LINEAGE exception; never a method activation."""
    reasons=[]
    if registration.get('point_tolerance') != POINT_TOLERANCE:
        reasons.append('POINT_TOLERANCE_NOT_REGISTERED')
    try:
        before=_number(evidence['before_team_crps']);after=_number(evidence['after_team_crps'])
        if before<=0 or after<0 or (before-after)/before<.01-1e-12:
            reasons.append('TEAM_CRPS_GATE')
        for target in ('team','margin','total'):
            for level in ('50','80'):
                cov=_number(evidence['coverage'][target][level])
                if abs(cov-int(level)/100)>.03+1e-12:
                    reasons.append('COVERAGE_GATE')
                old=_number(evidence['before_interval_score'][target][level])
                new=_number(evidence['after_interval_score'][target][level])
                if old<0 or new<0 or new>old+1e-12:
                    reasons.append('INTERVAL_SCORE_GATE')
        old=_number(evidence['before_team_mae']);new=_number(evidence['after_team_mae'])
        if old<0 or new<0 or abs(old-new)>POINT_TOLERANCE:
            reasons.append('POINT_MAE_CHANGED')
        ids=evidence['baseline_game_ids']
        rows=evidence['point_forecasts']
        if len(rows)!=len(ids) or len({r['game_id'] for r in rows})!=len(rows) or set(r['game_id'] for r in rows)!=set(ids):
            reasons.append('POINT_POPULATION_MISMATCH')
        for row in rows:
            for field in ('away','home','margin','total'):
                old=_number(row['before'][field]);new=_number(row['after'][field])
                if abs(old-new)>POINT_TOLERANCE:
                    reasons.append('POINT_FORECAST_CHANGED_OUT_OF_SCOPE')
            for side in ('before','after'):
                value=row[side]
                if abs(value['margin']-(value['home']-value['away']))>POINT_TOLERANCE or abs(value['total']-(value['home']+value['away']))>POINT_TOLERANCE:
                    reasons.append('POINT_IDENTITIES_INVALID')
    except (KeyError,TypeError,ValueError):
        reasons.append('MISSING_CALIBRATION_GATE_EVIDENCE')
    return reasons


def release_eligibility(registration, evidence, reviews):
    """Validate a registered result and two independent completed review records.

    Return an eligibility decision only. A separate explicitly invoked release
    runner must persist the weekly decision, enforce the one-method slot and
    verify deployment. No scheduler may treat this return value as activation.
    """
    reasons=[]
    body={k:v for k,v in registration.items() if k!='sha256'}
    if registration.get('sha256')!=digest(body):reasons.append('REGISTRATION_HASH_MISMATCH')
    required=('experiment','week','registered_at','candidates','training_window','tuning','tie_break','disproving_conditions','baseline_hash')
    if any(not registration.get(k) for k in required):reasons.append('INCOMPLETE_REGISTRATION')
    if not 1<=len(registration.get('candidates',[]))<=3:reasons.append('CANDIDATE_CAP')
    try:
        registered=dt.datetime.fromisoformat(registration['registered_at'])
        first=dt.datetime.fromisoformat(evidence['first_comparative_result_at'])
        if registered.tzinfo is None or first.tzinfo is None or registered>=first:reasons.append('LATE_REGISTRATION')
    except (ValueError,KeyError,TypeError):reasons.append('INVALID_CHRONOLOGY')
    if evidence.get('registration_sha256')!=registration.get('sha256'):reasons.append('WRONG_REGISTRATION')
    if evidence.get('baseline_hash')!=registration.get('baseline_hash'):reasons.append('BASELINE_CHANGED')
    if evidence.get('baseline_game_ids')!=evidence.get('candidate_game_ids') or not evidence.get('baseline_game_ids'):reasons.append('UNPAIRED_POPULATION')
    if evidence.get('population')!='HISTORICAL_DEVELOPMENT':reasons.append('MISLABELED_HISTORICAL_EVIDENCE')
    for field in ('nested_chronology_verified','candidate_specific_calibration','paired_uncertainty','current_as_issued_comparison','separation_tests_passed','immutability_tests_passed'):
        if evidence.get(field) is not True:reasons.append(field.upper())
    policy=registration.get('gate_policy','standard_point_v1')
    if policy==CALIBRATION_GATE and registration.get('experiment')=='E-CAL-LINEAGE':
        reasons.extend(_calibration_reasons(registration,evidence))
    else:
        if policy!='standard_point_v1' or registration.get('experiment')=='E-CAL-LINEAGE':
            reasons.append('UNREGISTERED_GATE_POLICY')
        try:
            before=evidence['before_team_mae'];after=evidence['after_team_mae']
            if not all(math.isfinite(v) for v in (before,after)) or before<=0 or after<0 or (before-after)/before<.01-1e-12:reasons.append('TEAM_MAE_GATE')
            coverage=evidence['coverage']
            if any(coverage[t][str(level)] is None or not math.isfinite(coverage[t][str(level)]) or abs(coverage[t][str(level)]-level/100)>.03+1e-12 for t in ('margin','total') for level in (50,80)):reasons.append('COVERAGE_GATE')
        except (KeyError,TypeError,ValueError):reasons.append('MISSING_GATE_EVIDENCE')
    if evidence.get('registered_extra_gates_passed') is not True:reasons.append('EXPERIMENT_SPECIFIC_GATE')
    if 'data_corrections' not in evidence:reasons.append('CORRECTION_DISCLOSURE_MISSING')
    if evidence.get('another_method_promoted_this_week'):reasons.append('WEEKLY_METHOD_SLOT_USED')
    if not evidence.get('rollback_fit_hash'):reasons.append('ROLLBACK_MISSING')
    if any(not evidence.get('candidate_hashes',{}).get(k) for k in ('code','configuration','data','fit')):reasons.append('CANDIDATE_LINEAGE_MISSING')
    if len(reviews)!=2 or len({r.get('reviewer') for r in reviews})!=2:reasons.append('TWO_DISTINCT_REVIEWS_REQUIRED')
    for r in reviews:
        if r.get('evidence_sha256')!=evidence.get('sha256') or not evidence.get('sha256'):reasons.append('REVIEW_WRONG_EVIDENCE')
        if len(r.get('answers',[]))!=4 or any(not a for a in r.get('answers',[])):reasons.append('INCOMPLETE_REVIEW')
        for objection in r.get('objections',[]):
            if objection.get('kind') in ('leak','double_count') and not objection.get('resolution_evidence_sha256'):
                reasons.append('UNRESOLVED_REVIEW_OBJECTION')
    evidence_body={k:v for k,v in evidence.items() if k!='sha256'}
    try:
        if evidence.get('sha256')!=digest(evidence_body):reasons.append('EVIDENCE_HASH_MISMATCH')
    except (TypeError,ValueError):reasons.append('INVALID_EVIDENCE_VALUE')
    return {'state':'BLOCKED' if reasons else 'ELIGIBLE_FOR_EXPLICIT_RELEASE','reasons':sorted(set(reasons)),
            'experiment':registration.get('experiment'),'week':registration.get('week'),'activates_method':False}
