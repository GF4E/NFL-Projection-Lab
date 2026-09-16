"""Publish step only: replace the deploy tree with validated build output.
Credentials arrive on a non-echoing terminal and live only in child Git env.
No source checkout is copied, no force push, and no manual mirror editing.
"""
import argparse,hashlib,json,os,subprocess,tarfile,tempfile,termios,sys
from pathlib import Path

def validate_archive(path):
 with tarfile.open(path,'r:gz') as tar:
  files={}
  for item in tar.getmembers():
   name=item.name
   if item.isdir():continue
   if not item.isfile() or not name.startswith('dist/') or '..' in Path(name).parts:raise ValueError('Non-build archive entry: '+name)
   if any(part in ('src','tests','engine','outputs','work','node_modules') for part in Path(name).parts) or Path(name).suffix in ('.ts','.tsx','.py','.csv','.parquet','.map'):raise ValueError('Source or data file in build output: '+name)
   data=tar.extractfile(item).read()
   if any(term in data.lower() for term in [b'pff_private_column_canary',b'grades_offense',b'grades_defense',b'grades_pass_block',b'grades_run_block']):raise ValueError('PFF column content in output: '+name)
   files[name]=hashlib.sha256(data).hexdigest()
  if 'dist/server/index.js' not in files or 'dist/.openai/hosting.json' not in files:raise ValueError('Incomplete build')
 return files

def main():
 if sys.argv[1:]==['--stamp']:
  source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
  if subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0]!=source:raise ValueError('Source must be pushed first')
  if subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],text=True).strip():raise ValueError('Source must be clean')
  Path('dist/client/build-provenance.json').write_text(json.dumps({'source_commit':source,'repository':'https://github.com/GF4E/NFL-Projection-Lab','publication':'generated build output only'},sort_keys=True)+'\n')
  print('Build stamped from pushed source '+source);return
 p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--source',required=True);p.add_argument('--remote',required=True);p.add_argument('--branch',default='main');p.add_argument('--receipt',required=True);args=p.parse_args()
 files=validate_archive(args.archive)
 with tarfile.open(args.archive,'r:gz') as tar:
  if json.load(tar.extractfile('dist/client/build-provenance.json'))['source_commit']!=args.source:raise ValueError('Archive source stamp mismatch')
 root=Path.cwd();source=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
 if source!=args.source:raise ValueError('Source HEAD differs')
 remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0]
 if remote!=source:raise ValueError('Source main not pushed')
 if subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],text=True).strip():raise ValueError('Tracked source changes after build')
 with tempfile.TemporaryDirectory(prefix='nfl-deploy-build-') as tmp:
  repo=Path(tmp);subprocess.run(['git','init','-q',str(repo)],check=True)
  # No credential in argv, persistent config, file, log, or shell history.
  terminal=termios.tcgetattr(sys.stdin);hidden=terminal[:];hidden[3]&=~termios.ECHO;termios.tcsetattr(sys.stdin,termios.TCSANOW,hidden)
  print('READY_FOR_EPHEMERAL_CREDENTIAL',flush=True)
  credential=json.loads(sys.stdin.readline());termios.tcsetattr(sys.stdin,termios.TCSANOW,terminal)
  if credential['auth_mode'] not in ('bearer','http_extra_header'):raise ValueError('Unsupported credential mode')
  env={**os.environ,'GIT_TERMINAL_PROMPT':'0','GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'http.extraHeader','GIT_CONFIG_VALUE_0':'Authorization: Bearer '+credential['token']}
  def git(*cmd):return subprocess.check_output(['git','-C',str(repo),*cmd],env=env,stderr=subprocess.PIPE,text=True).strip()
  git('fetch','--depth=1',args.remote,args.branch);parent=git('rev-parse','FETCH_HEAD')
  with tarfile.open(args.archive,'r:gz') as tar:tar.extractall(repo,filter='data')
  git('add','--','dist');tree=git('write-tree')
  message='deploy: build output from main '+source
  env.update(GIT_AUTHOR_NAME='NFL publish step',GIT_AUTHOR_EMAIL='publish@localhost',GIT_COMMITTER_NAME='NFL publish step',GIT_COMMITTER_EMAIL='publish@localhost')
  commit=git('commit-tree',tree,'-p',parent,'-m',message)
  git('update-ref','refs/heads/'+args.branch,commit)
  git('push',args.remote,commit+':refs/heads/'+args.branch)
  if git('ls-remote',args.remote,'refs/heads/'+args.branch).split()[0]!=commit:raise ValueError('Mirror head mismatch')
  record={'source_commit':source,'deploy_commit':commit,'deploy_parent':parent,'commit_message':message,'repository_of_record':'https://github.com/GF4E/NFL-Projection-Lab.git','mirror_policy':'build-output-only; generated only by publish step','archive_sha256':hashlib.sha256(Path(args.archive).read_bytes()).hexdigest(),'files':files,'checks':'PASS; no source files, raw data, engine artifacts, source maps or PFF column canaries'}
  Path(args.receipt).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:record[k] for k in ('source_commit','deploy_commit','archive_sha256','checks')}))
if __name__=='__main__':main()
