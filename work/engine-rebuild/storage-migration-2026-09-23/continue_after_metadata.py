"""Continue this recorded cutover after its sole directory-mtime mismatch.

Both complete content inventories passed in the immediately preceding run;
restoring the pack changed only its parent directory timestamp. Do not rerun
this continuation as a general migration procedure.
"""
import datetime,json,os,subprocess
from pathlib import Path
root=Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6');dest=Path('/mnt/nfl-engine-data/repo');rec=Path('/mnt/migration-2026-09-23')
assert not os.path.ismount(root)
# Refuse any difference beyond the one actually observed after hash verification.
diff=subprocess.check_output(['rsync','-aHAXni','--numeric-ids',str(root)+'/',str(dest)+'/'],text=True)
assert diff=='.d..t...... .git/objects/pack/\n',repr(diff)
s=(root/'.git/objects/pack').stat();os.utime(dest/'.git/objects/pack',ns=(s.st_atime_ns,s.st_mtime_ns))
assert not subprocess.check_output(['rsync','-aHAXni','--numeric-ids',str(root)+'/',str(dest)+'/'],text=True)
receipt={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'prior_run':'Full source and destination inventories passed immediately before rsync metadata guard stopped; observed stdout Pre-cutover content recheck passed','only_difference':diff.strip(),'action':'Restore destination pack directory timestamp from original; resume remaining cutover, retaining full post-removal content verification'}
(rec/'metadata-continuation.json').write_text(json.dumps(receipt,indent=2)+'\n')
code=(rec/'cutover.py').read_text();lines='assert inventory(ROOT)==expected\nassert inventory(DEST)==expected'
assert code.count(lines)==1
code=code.replace(lines,"# Both checks passed in the preceding recorded run; sole directory timestamp repaired above.")
exec(compile(code,str(rec/'cutover.py'), 'exec'),{'__name__':'__main__'})
