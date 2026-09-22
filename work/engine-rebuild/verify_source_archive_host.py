"""Read-only checks of the installed archive readers and scheduled final receipt."""
import hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
paths=['engine/projection/source_archive.py','engine/projection/finals.py','scripts/projection_watchdog.py','scripts/board_v9_publish.py','scripts/reference_lines.py']
expected={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in paths}
program='EXPECTED='+repr(expected)+'\n'+'''
import datetime,hashlib,json,os,subprocess
from pathlib import Path
from unittest.mock import patch
from engine.projection.source_archive import read_source,reference,FOLDER
from engine.projection.finals import parse
from scripts.projection_watchdog import source_snapshot
from scripts.reference_lines import load_references
from scripts import board_v9_publish
root=Path.cwd();now=datetime.datetime.now(datetime.timezone.utc)
hashes={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in EXPECTED}
assert hashes==EXPECTED
feed=json.loads((root/'outputs/projection-v3/final-feed.json').read_bytes());raw=read_source(root,feed)
operation=json.loads((root/'outputs/projection-v3/operations/final-feed.json').read_bytes())
matched=(feed.get('refresh_operation_id')==operation.get('operation_id') and hashlib.sha256(json.dumps(feed,sort_keys=True,separators=(',',':')).encode()).hexdigest()==operation.get('expected_feed_sha256'))
observer=source_snapshot(root,now,now.isoformat())
refs,metadata=load_references(root,weekly=True)
with patch.object(board_v9_publish,'save') as writer:context=board_v9_publish.run()
assert writer.call_count==1
board=json.loads((root/'outputs/projection-v3/board.json').read_bytes())
assert context['board_sha256']==board['content_sha256']
files=[p for p in (root/FOLDER).iterdir() if p.is_file()]
compressed=[p for p in files if p.name.endswith('.csv.gz')]
ref=reference(feed);stat=os.statvfs(root)
print(json.dumps({'checked_at':now.isoformat(),'host_commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
'scope':'Installed-code and scheduled-feed verification; board-context computation intercepted, no publication or provider requests. Legacy reuse is distinguished from new compressed writes.',
'source_hashes':hashes,'source_ref':ref,'explicit_reference_recorded':'source_ref' in feed,
'source_sha256':feed['source_sha256'],'source_received_at':feed['received_at'],'exact_raw_hash_verified':hashlib.sha256(raw).hexdigest()==feed['source_sha256'],
'parsed_finals':len(parse(raw)),'final_recovery_state':operation['state'],'operation_payload_matches':matched,
'observer_source_verified':observer['final_source_sha256']==feed['source_sha256'],
'context_games':len(context['games']),'context_source':context['schedule_source'],
'weekly_diagnostic_source':metadata['CLOSE'],'board_sha256':board['content_sha256'],
'legacy_csv_files':sum(p.name.endswith('.csv') for p in files),'compressed_source_files':len(compressed),
'compressed_source_bytes':sum(p.stat().st_size for p in compressed),'free_root_bytes':stat.f_bavail*stat.f_frsize,'provider_credits':0}))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -B -'
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=program,text=True,capture_output=True,timeout=60)
if r.returncode:raise RuntimeError('Archive host verification failed: '+r.stderr[-1400:])
v=json.loads(r.stdout);(ROOT/'work/engine-rebuild/host-source-archive-verification.json').write_text(json.dumps(v,indent=2)+'\n')
print(json.dumps({k:x for k,x in v.items() if k not in ('source_hashes','context_source','weekly_diagnostic_source')},indent=2))
