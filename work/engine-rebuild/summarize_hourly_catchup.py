"""Independent arithmetic and source archive for a completed catch-up replay."""
import datetime as dt
import gzip
import hashlib
import json
from pathlib import Path
from check_prompt_evidence import metrics

ROOT=Path(__file__).resolve().parents[2]
FOLDER=ROOT/'work/engine-rebuild/hourly-catchup'


def read(ref):
    data=(ROOT/ref['path']).read_bytes()
    assert hashlib.sha256(data).hexdigest()==ref['sha256'],ref['path']
    return json.loads(gzip.decompress(data) if ref['path'].endswith('.gz') else data)


def main():
    ref=json.loads((FOLDER/'current-ref.json').read_bytes());body=read(ref)
    assert body['authoritative'] is False and len(body['games'])==2639
    strict_ref=json.loads((ROOT/'work/engine-rebuild/common-pipeline/current-ref.json').read_bytes())
    strict=read(strict_ref);strict_games={r['game_id']:r for r in strict['games']}
    permutation=json.loads((FOLDER/'permutation.json').read_bytes())
    assert permutation['status']=='PASS' and permutation['replay_ref']==ref
    by_season={}
    for year in range(2016,2026):
        rows=[r for r in body['games'] if r['season']==year]
        by_season[str(year)]={**metrics(rows),
            'changed_vs_strict_tuesday':sum(any(abs(r[s]-strict_games[r['game_id']][s])>1e-9 for s in ('home','away')) for r in rows),
            'catchup_refits':body['by_season'][str(year)]['catchup_refits']}
    report={'replay_ref':ref,'control':body['control'],'status':'NON_AUTHORITATIVE_RECONSTRUCTION',
            'pooled':metrics(body['games']),'by_season':by_season,
            'strict_tuesday_reference':strict_ref,'permutation':permutation,
            'fit_latency_boundary_games':body['forecasts_inside_fit_latency_window'],
            'historical_source_availability':body['historical_availability']}
    (FOLDER/'summary.json').write_text(json.dumps(report,indent=2)+'\n')
    files={}
    for item in body['code']:
        data=(ROOT/item['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest()==item['sha256'],item['path']
        files[item['path']]=data.decode()
    archive=gzip.compress(json.dumps({'replay_ref':ref,'checkout_commit':body['checkout_commit'],
        'files':files},sort_keys=True,separators=(',',':')).encode(),mtime=0)
    digest=hashlib.sha256(archive).hexdigest();archive_path=FOLDER/('source-'+digest+'.json.gz')
    if archive_path.exists():assert archive_path.read_bytes()==archive
    else:archive_path.write_bytes(archive)
    source_ref={'path':str(archive_path.relative_to(ROOT)),'sha256':digest}
    (FOLDER/'source-ref.json').write_text(json.dumps(source_ref,indent=2)+'\n')
    m=report['pooled']
    lines=['# SERIES — hourly catch-up reconstruction', '',
        '**NON-AUTHORITATIVE. No statistical gate or production activation.**', '',
        'Generated '+dt.datetime.now(dt.timezone.utc).isoformat()+'. Replay: `'+ref['path']+'`, SHA256 `'+ref['sha256']+'`.',
        'Code: shared cutoff preparation, approved Elo/efficiency state and calibration/Elo ridge with fixed penalty 10. '
        'Weights refit from retained pregame rows. Each forecast identifies its own exact fit hash; there is no single fit for the series. '
        'Checkout `'+body['checkout_commit']+'`; exact source bytes are hash-verified in `source-ref.json`.', '',
        'The host learning timer is Tuesday 06:00 Pacific; the job named daily dispatches hourly. '
        'The replay keeps those policies separate from Friday/Monday/Tuesday assimilation. '
        'Historical source arrival, closeout publication and calculation latency are simulated, not observed. '
        'Final/PBP availability is assumed at kickoff plus four hours and the fit becomes available ten minutes after dispatch. '
        'The preserved HFA deployed-lineage series remains the sole authoritative control until the corrected issuing path is qualified and activated.', '',
        '| Season | Games | Team MAE | Bias (projection − actual) | Actual-on-projected slope | Projected SD | Catch-up refits | Changed vs strict Tuesday |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    for year,r in by_season.items():
        lines.append(f"| {year} | {r['games']} | {r['team_mae']:.6f} | {r['team_bias_projection_minus_actual']:+.6f} | {r['actual_on_projected_slope_with_intercept']:.6f} | {r['projected_population_sd']:.6f} | {r['catchup_refits']} | {r['changed_vs_strict_tuesday']} |")
    lines.extend([f"| Pooled | {m['games']} | {m['team_mae']:.6f} | {m['team_bias_projection_minus_actual']:+.6f} | {m['actual_on_projected_slope_with_intercept']:.6f} | {m['projected_population_sd']:.6f} | {sum(r['catchup_refits'] for r in by_season.values())} | {sum(r['changed_vs_strict_tuesday'] for r in by_season.values())} |", '',
        'Population SD; slope includes an intercept. All games retain paired team rows. No historical probability/interval scores are claimed: own-lineage calibration warmup remains unqualified.', '',
        f"Verified {body['calendar_forecasts_checked']} forecast cutoffs; early/duplicate observations: {body['early_or_duplicate_observations']}. "
        f"Feature maximum difference from the earlier cutoff renderer: {body['common_feature_max_difference']}. "
        f"Reversed-row refits: {permutation['fits_checked']}; exact point difference: {permutation['maximum_point_difference']}. "
        f"Independent augmented-solve maximum coefficient difference: {permutation['independent_augmented_solve_max_coefficient_difference']:.3g}; point difference: {permutation['independent_augmented_solve_max_point_difference']:.3g}.", '',
        f"Forecasts within the assumed zero-to-ten-minute fit latency window: {len(body['forecasts_inside_fit_latency_window'])}. "
        'An empty set establishes invariance between those two latency endpoints for this replay; it does not establish historical provider arrival, compute or publication time.', '',
        f"Replay duration {body['elapsed_seconds']:.2f} seconds; peak resident bytes {body['peak_rss_bytes']}. One worker; 45-minute and 4-GiB ceilings. No provider requests or new spending.", '',
        'Confidence: high in the shared numerical chronology behavior tested across all ten seasons and alternate row order, with an independent solve. Lower to medium if qualified source vintages or a production dispatch trace changes the eligible set. Full production readiness and improved predictive accuracy are unproved.'])
    (FOLDER/'SERIES.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'replay':ref,'pooled':m,'changed_vs_strict':sum(r['changed_vs_strict_tuesday'] for r in by_season.values()),
                      'source_archive':source_ref},indent=2))


if __name__=='__main__':main()
