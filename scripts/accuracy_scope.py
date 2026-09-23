"""Validate statistical experiment objectives; diagnostics are never selection inputs."""
import re

FORBIDDEN = ('ats', 'coverrate', 'overunder', 'marketrelative', 'breakeven',
             'spreadline', 'totalline', 'closingline', 'openline', 'clv', 'roi', 'profit')


def normalized(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())


def validate(registration):
    gate = registration.get('gate', {})
    primary = gate.get('primary', registration.get('primary_metric', 'team_points_MAE')) if isinstance(gate, dict) else registration.get('primary_metric','team_points_MAE')
    calibration_exception = (registration.get('experiment') == 'E-CAL-LINEAGE'
                             and registration.get('gate_policy') == 'calibration_lineage_v1'
                             and registration.get('point_tolerance') == 1e-12
                             and normalized(primary) == 'teampointscrps')
    if normalized(primary) not in ('teampointsmae', 'teammae', 'teamscoremae') and not calibration_exception:
        raise ValueError('Statistical engine requires team-points MAE primary except registered E-CAL-LINEAGE')
    def check(value):
        if isinstance(value, dict):
            for k,v in value.items():check(k);check(v)
        elif isinstance(value, (list,tuple)):
            for item in value:check(item)
        elif isinstance(value,str):
            words=normalized(value)
            if any((bool(re.search(r'(^|[^a-z])ats([^a-z]|$)',value.lower())) if token=='ats' else token in words) for token in FORBIDDEN):
                raise ValueError('Market-relative selection is outside statistical engine scope')
    for key in ('gate','objective','selection_metric','ranking_metric','tuning_metric'):
        if key in registration:check(registration[key])
    return 'ACTUAL_SCORE_ACCURACY_ONLY'
