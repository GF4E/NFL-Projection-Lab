"""Offline replay of the named football-evidence-v1 prospective research example."""
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from engine.football_evidence import forecast


def main():
    base = ROOT/'work/football-evidence-v1'
    experiment = json.loads((base/'experiment.json').read_text())
    for name, expected in experiment['sha256'].items():
        if hashlib.sha256((ROOT/name).read_bytes()).hexdigest() != expected:
            raise ValueError('Pinned input changed: '+name)
    inputs = json.loads((base/'inputs.json').read_text())
    result = forecast(inputs['game'], inputs['state'], inputs['evidence'], inputs['config'], inputs['as_of'])
    expected = json.loads((base/'prediction.json').read_text())
    if result != expected:
        raise ValueError('Replay differs from the named prospective experiment')
    print(json.dumps({'experiment': experiment['experiment_id'], 'offline_replay': 'PASS',
                      'status': result['status'], 'promotion': 'NOT_REQUESTED_OR_PERFORMED',
                      'credits_spent': 0}, indent=2))


if __name__ == '__main__': main()
