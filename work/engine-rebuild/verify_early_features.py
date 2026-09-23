"""Verify real warmup source-order invariance and cutoff membership."""
import datetime as dt
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from engine.projection import cutoff_features as features
from engine.forecast_system.calendar import schedule_kickoff, timestamp
from check_calibration_sources import load, ref


def run():
    summary = load(ref('work/engine-rebuild/early-features-verification.json'))
    artifact = load(summary['artifact'])
    source = load(artifact['sources']['inputs'])
    active = load(source['sources']['active_fit'])
    hfa = dict(active['elo_hfa'], **{k: v['value'] for k, v in source['elo_hfa'].items()})
    reversed_result = features.build(list(reversed(source['team_games'])), list(reversed(source['schedule'])),
                                     load(artifact['sources']['stadiums']), elo_hfa=hfa,
                                     mode='HISTORICAL_RECONSTRUCTION', minimum_season=2012)
    original_rows = {r['row_id']: r for r in artifact['rows']}
    for r in reversed_result['rows']:
        previous = original_rows[r['row_id']]
        if any(r[k] != previous[k] for k in previous if k != 'issuance_at'):
            raise ValueError('Source row order changes warmup features')
    if len(reversed_result['rows']) != len(original_rows) or reversed_result['lineage'] != artifact['lineage']:
        raise ValueError('Source order changes population or states')
    # Independent set construction from raw schedule clocks, without using the
    # builder's eligibility entries as expected values.
    completions = {g['game_id']: schedule_kickoff(g['gameday'], g['gametime']) + dt.timedelta(hours=4)
                   for g in source['schedule']}
    seen = set()
    for state in artifact['lineage']:
        if seen.intersection(state['added_games']):
            raise ValueError('Repeated game')
        seen.update(state['added_games'])
        expected = {gid for gid, done in completions.items() if done < timestamp(state['cutoff_at'])}
        if seen != expected or len(seen) != state['incorporated_count']:
            raise ValueError('State membership differs from direct calendar reconstruction')
    result = {'status': 'PASS', 'source_order_unchanged_team_rows': len(original_rows),
              'independently_checked_cutoff_populations': len(artifact['lineage']),
              'verified_games': len(seen), 'feature_artifact': summary['artifact'],
              'scope': 'Source-order invariance and independent calendar sets; no model fit or accuracy gate.',
              'checker': ref(str(Path(__file__).relative_to(ROOT)))}
    (ROOT / 'work/engine-rebuild/early-features-independent-check.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    run()
