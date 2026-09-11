"""Offline transport/capture/lock/grade drill in an isolated named artifact set."""
import argparse
import datetime as dt
from email.utils import format_datetime
import io
import json
from pathlib import Path
import sys
from unittest.mock import patch
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine import t75_capture
from engine.model_pick import lock
from engine.pick_store import put, read_pinned, sha
from engine.t75_report import score_files, scorecard


def run(output):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Use a new isolated experiment directory')
    fixture = json.loads((ROOT/'work/model-pick-v1/synthetic-v1/inputs.json').read_text())
    config = json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text())
    for path, digest in config['code_hashes'].items():
        if sha((ROOT/path).read_bytes()) != digest:
            raise ValueError('Frozen code hash mismatch')
    shape = read_pinned(config['distribution'])
    game = fixture['game']
    group = {**game, 'id': 'SYNTHETIC_CLOUD_MIGRATION', 'games': [game]}
    start = dt.datetime.fromisoformat(game['capture_at'].replace('Z', '+00:00'))
    response = io.BytesIO(json.dumps([fixture['event']]).encode())
    response.headers = {'date': format_datetime(start+dt.timedelta(seconds=5)), 'x-requests-last': '2'}
    # A mock substitutes transport AND clock. No network connection or real key.
    with patch.object(t75_capture.urllib.request, 'urlopen', return_value=response) as transport, \
         patch.object(t75_capture, 'now', side_effect=[start, start+dt.timedelta(seconds=5)]):
        receipt = t75_capture.capture(group, output/'capture', output/'synthetic-budget.jsonl', 'SYNTHETIC_NOT_A_KEY')
    record = lock(game, fixture['event'], receipt, shape, config, fixture['freeze_at'])
    record['evidence'] = 'SYNTHETIC_OFFLINE_NOT_A_LIVE_CAPTURE'
    path = output/'T75-picks.json'; put(path, record)
    grades = score_files([path], fixture['results'], shape, output/'grades')
    put(output/'scorecard.json', scorecard([record], grades))
    assert receipt['status'] == 'CAPTURED' and record['status'] == 'LOCKED'
    assert len(record['picks']) == 2 and len(grades) == 2
    assert transport.call_count == 1
    summary = {'experiment': str(output), 'evidence': record['evidence'], 'capture_status': receipt['status'],
               'lock_status': record['status'], 'picks': len(record['picks']), 'grades': len(grades),
               'pick_sha256': sha(path.read_bytes()), 'provider_calls': 0, 'odds_api_credits_spent': 0,
               'synthetic_quota_settlement': 2, 'frozen_code_hashes_verified': len(config['code_hashes'])}
    put(output/'experiment.json', summary)
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--output', required=True)
    print(json.dumps(run(parser.parse_args().output), indent=2))
