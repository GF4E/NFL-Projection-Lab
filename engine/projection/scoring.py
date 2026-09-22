"""Label-free input adapter and strict contract for the existing scorer.

Preparation is deliberately outside this boundary. Copying qualified names does
not establish the chronology of their source calculations.
"""
import copy
import math
import re
from engine.projection_v3.model import GROUPS
from engine.projection_v3.card import project, why

SCHEMA = 'football-scoring-input-v1'
# Explicit, reviewed list, independent of additions to the model's GROUPS.
FEATURES = frozenset('''baseline qb_epa qb_cpoe qb_career_starts qb_backup
pressure_generated pressure_allowed career_fg_short career_fg_medium career_fg_long
home_divisional home_nondivisional divisional neutral off_off_ppd def_off_ppd
off_off_ypp def_off_ypp drives opponent_drives plays_per_drive off_pass_epa
def_pass_epa off_cpoe def_cpoe off_rush_epa def_rush_epa off_rush_success
def_rush_success off_explosive def_explosive season_fg_short season_fg_medium
season_fg_long te_share rb_share momentum redzone_td return_points fg_share
turnover_margin fumble_recovery close_win_rate luck_index elo elo_difference
schedule_strength pythagorean rest_days travel_miles wind continuity referee
elo_qb_adjustment'''.split())
FIT_KEYS = {'groups','names','means','scales','coefficients','intercept','penalty','training_hash'}


def exact(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError('Scoring contract contains missing or unapproved fields')


def finite(value, nullable=False):
    if value is None and nullable:
        return
    if type(value) not in (int, float, bool) or not math.isfinite(value):
        raise ValueError('Finite numeric football input required')


def sha(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
        raise ValueError('Football source hash required')


def artifact_payload(artifact):
    """Never send the training envelope, labels or source file locations."""
    result = {'fit':copy.deepcopy(artifact['fit']), 'groups':list(artifact['groups']),
              'inactive':[{'input':x['input'], 'reason':x['reason']} for x in artifact['inactive']]}
    validate_artifact(result)
    return result


def validate_artifact(artifact):
    exact(artifact, {'fit','groups','inactive'})
    f = artifact['fit']; exact(f, FIT_KEYS)
    if (not isinstance(f['groups'], list) or f['groups'] != sorted(set(f['groups']))
        or not set(f['groups']) <= set(GROUPS) or artifact['groups'] != f['groups']):
        raise ValueError('Unapproved scoring groups')
    expected = sorted({n for g in f['groups'] for n in GROUPS[g]})
    if f['names'] != expected or not set(expected) <= FEATURES:
        raise ValueError('Unapproved scoring feature')
    for field in ('means','scales','coefficients'):
        if not isinstance(f[field], list) or len(f[field]) != len(expected):
            raise ValueError('Fit dimensions differ')
        for value in f[field]: finite(value)
    if any(s <= 0 for s in f['scales']): raise ValueError('Positive fit scales required')
    finite(f['intercept']); finite(f['penalty']); sha(f['training_hash'])
    seen = set()
    for item in artifact['inactive']:
        exact(item, {'input','reason'})
        if item['input'] not in FEATURES or item['input'] in seen or not isinstance(item['reason'], str):
            raise ValueError('Unapproved inactive feature')
        seen.add(item['input'])


def prepare_pair(pair, forecast=None):
    """Explicit projection, never recursive copying of the source row."""
    rows = {}
    for side in ('home','away'):
        row = pair[side]
        rows[side] = {'team':row['team'],
            'features':{key:row['features'].get(key) for key in sorted(FEATURES)},
            'metadata':{key:{field:copy.deepcopy(meta[field]) for field in ('label','source_hashes') if field in meta}
                        for key,meta in row['metadata'].items() if key in FEATURES},
            'source_hashes':list(row['source_hashes'])}
    request = {'schema':SCHEMA, 'game_id':pair['home']['game_id'], 'rows':rows,
               'forecast':{key:forecast[key] for key in ('wind_mph','source_sha256')} if forecast else None}
    if pair['away']['game_id'] != request['game_id']: raise ValueError('Different games in scoring pair')
    validate_pair(request)
    return request


def validate_pair(request):
    exact(request, {'schema','game_id','rows','forecast'})
    if request['schema'] != SCHEMA or not isinstance(request['game_id'], str):
        raise ValueError('Unsupported scoring contract')
    exact(request['rows'], {'home','away'})
    for row in request['rows'].values():
        exact(row, {'team','features','metadata','source_hashes'})
        if not isinstance(row['team'], str) or not re.fullmatch('[A-Z]{2,3}', row['team']):
            raise ValueError('Invalid football team')
        exact(row['features'], FEATURES)
        for value in row['features'].values(): finite(value, nullable=True)
        for name, meta in row['metadata'].items():
            if name not in FEATURES or not set(meta) <= {'label','source_hashes'}:
                raise ValueError('Unapproved football metadata')
            if 'label' in meta and not isinstance(meta['label'], str): raise ValueError('Invalid input label')
            for value in meta.get('source_hashes', []): sha(value)
        for value in row['source_hashes']: sha(value)
        finite(row['features']['baseline'])
    if request['rows']['home']['team'] == request['rows']['away']['team']:
        raise ValueError('Two distinct teams required')
    if request['forecast'] is not None:
        exact(request['forecast'], {'wind_mph','source_sha256'})
        finite(request['forecast']['wind_mph']); sha(request['forecast']['source_sha256'])
        if request['forecast']['wind_mph'] < 0: raise ValueError('Negative wind speed')


def validate_shapes(shapes):
    exact(shapes, {'team_points','margin','total'})
    for distribution in shapes.values():
        exact(distribution, {'counts','n','source_hash','rounding','sha256'})
        sha(distribution['source_hash']); sha(distribution['sha256'])
        if type(distribution['n']) is not int or distribution['n'] <= 0:
            raise ValueError('Invalid residual population')
        for value, count in distribution['counts'].items():
            if not isinstance(value, str) or not re.fullmatch('-?[0-9]+', value) or type(count) is not int or count < 0:
                raise ValueError('Invalid residual counts')
        # Validate all three, including the team distribution not used by summarize.
        from engine.projection.distribution import pmf
        pmf(distribution, 0)


def calculate(artifact, shapes, request):
    validate_artifact(artifact); validate_shapes(shapes); validate_pair(request)
    projection, terms = project(request['rows'], artifact, shapes, request['forecast'])
    return {'projection':projection, 'contributions':terms,
            'why':why(terms, request['rows'], projection, artifact['fit'])}
