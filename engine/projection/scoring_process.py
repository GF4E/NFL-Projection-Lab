"""Sequential isolated scoring; provider credentials never enter the child."""
import json
from pathlib import Path
import subprocess
import sys
from .scoring import artifact_payload


def score_batch(artifact, shapes, requests):
    if not requests: return {}
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run([sys.executable, '-I', '-B', str(root/'scripts/projection_score_worker.py')],
        input=json.dumps({'artifact':artifact_payload(artifact), 'shapes':shapes, 'requests':requests},
                         sort_keys=True, separators=(',', ':'), allow_nan=False),
        text=True, capture_output=True, timeout=60, cwd=root,
        env={'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
    if result.returncode:
        raise ValueError('Isolated football scoring failed; no fallback')
    output = json.loads(result.stdout)
    if set(output) != {request['game_id'] for request in requests}:
        raise ValueError('Incomplete scoring batch')
    return output
