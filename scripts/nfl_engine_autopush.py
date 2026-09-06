"""Git-only branch-constrained autosave with staged credential/size checks."""
import datetime, os, re, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REMOTE='https://github.com/GF4E/NFL-Projection-Lab.git'
ENV={**os.environ,'GIT_TERMINAL_PROMPT':'0'}
def git(*args):
    return subprocess.check_output(['/usr/bin/git','-C',str(ROOT),*args],env=ENV)
def guard():
    patterns=[re.compile(x) for x in [rb'(?i)(?:api[_-]?key|authorization|x-api-key)["\s:=]+(?:bearer\s+)?["\s]*[A-Za-z0-9_\-]{20,}',rb'(?i)[?&]apiKey=[a-z0-9]{20,}',rb'\b(?:ghp_|github_pat_|sk_live_)[A-Za-z0-9_]{15,}',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']]
    for item in git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split(b'\0'):
        if not item: continue
        name=item.decode()
        size=int(git('cat-file','-s',':'+name))
        if size>50_000_000: raise RuntimeError('Staged file over 50 MB: '+name)
        data=git('show',':'+name)
        if any(p.search(data) for p in patterns): raise RuntimeError('Credential pattern in staged file: '+name)
    return True

def main():
    if '--check' in sys.argv:
        guard(); print('PASS staged credential and size checks'); return
    if git('symbolic-ref','--short','HEAD').strip()!=b'engine-v2': raise RuntimeError('Refusing non-engine-v2 branch')
    if git('remote','get-url','origin').decode().strip()!=REMOTE: raise RuntimeError('Unexpected origin')
    if not git('status','--porcelain').strip(): return
    # Gitignore cannot express file size. Add explicit untracked paths before staging.
    additions=[]
    for item in git('ls-files','--others','--exclude-standard','-z').split(b'\0'):
        if not item: continue
        name=item.decode(); p=ROOT/name
        if p.is_file() and p.stat().st_size>50_000_000:
            if any(c in name for c in '\n\r*?['): raise RuntimeError('Oversized path requires manual ignore')
            additions.append('/'+name)
    if additions:
        with (ROOT/'.gitignore').open('a') as f: f.write('\n# Automatic size exclusions\n'+'\n'.join(additions)+'\n')
    if git('diff','--name-only','--diff-filter=D').strip(): raise RuntimeError('Deletion requires owner approval')
    git('add','--all')
    if git('diff','--cached','--name-only','--diff-filter=D').strip(): raise RuntimeError('Staged deletion requires owner approval')
    guard()
    if not git('diff','--cached','--name-only').strip(): return
    git('commit','-m','chore(autosave): '+datetime.date.today().isoformat())
    output=git('push','origin','HEAD:refs/heads/engine-v2')
    print(datetime.datetime.now().isoformat(), 'autosave pushed',output.decode().strip())
if __name__=='__main__': main()
