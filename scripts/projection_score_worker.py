"""One batch, existing arithmetic, no source I/O after imports and stdin read."""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine.projection.scoring import calculate, exact


def deny_source_io(event, args):
    # Accidental-access guard, not a sandbox against malicious native extensions.
    if (event in {'open','os.listdir','os.scandir','os.system','os.fork','os.posix_spawn','ctypes.dlopen'}
        or event.startswith(('socket.', 'subprocess.', 'os.exec', 'os.spawn'))):
        raise PermissionError('Scoring worker source I/O forbidden')


def main():
    payload = json.loads(sys.stdin.buffer.read())
    sys.addaudithook(deny_source_io)
    exact(payload, {'artifact','shapes','requests'})
    out = {}
    for request in payload['requests']:
        gid = request['game_id']
        if gid in out: raise ValueError('Duplicate scoring request')
        out[gid] = calculate(payload['artifact'], payload['shapes'], request)
    print(json.dumps(out, sort_keys=True, separators=(',', ':'), allow_nan=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not leak input contents or private parent state into scheduler logs.
        print('Scoring contract failed: ' + type(error).__name__, file=sys.stderr)
        raise SystemExit(1)
