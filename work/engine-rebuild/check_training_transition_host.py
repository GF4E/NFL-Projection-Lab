"""Actual Linux service-runtime qualification; all writes stay in disposable tmpfs."""
import base64,gzip,hashlib,io,json,shlex,subprocess,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
files={str(p.relative_to(ROOT)):p.read_bytes()
       for folder in ('engine','scripts') for p in (ROOT/folder).rglob('*.py') if '__pycache__' not in p.parts}
for name in ('test_projection_training_ledger.py','test_projection_cutoff_state.py','test_projection_cutoff_pipeline.py',
             'test_projection_cutoff_publication.py','test_projection_bundle.py'):
    path='tests/'+name;files[path]=(ROOT/path).read_bytes()
ref=json.loads((ROOT/'work/engine-rebuild/training-transition/current-ref.json').read_bytes())
body=json.loads(gzip.decompress((ROOT/ref['path']).read_bytes()))
for r in [ref,body['base_ref'],*body['preparations']]:files[r['path']]=(ROOT/r['path']).read_bytes()
archive=io.BytesIO()
with tarfile.open(fileobj=archive,mode='w:gz') as tar:
    for name,data in files.items():
        item=tarfile.TarInfo(name);item.size=len(data);item.mtime=0;tar.addfile(item,io.BytesIO(data))
program='REF='+repr(ref)+'\n'+r'''
import base64,contextlib,datetime as dt,gzip,hashlib,io,json,os,platform,resource,shutil,signal,subprocess,sys,tarfile,tempfile,time,unittest
from pathlib import Path
from unittest.mock import patch
host=Path.cwd();host_commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
resource.setrlimit(resource.RLIMIT_AS,(4*1024**3,4*1024**3))
def timeout(*args):raise TimeoutError('Training verification exceeded 570 seconds')
signal.signal(signal.SIGALRM,timeout);signal.alarm(570);start=time.monotonic()
def phase(name):print(json.dumps({'phase':name,'elapsed_seconds':time.monotonic()-start}),file=sys.stderr,flush=True)
phase('START');candidate_code={}
with tempfile.TemporaryDirectory(prefix='training-ledger-',dir='/run/nfl-engine-monitor') as tmp:
    root=Path(tmp)
    with tarfile.open(fileobj=sys.stdin.buffer,mode='r|gz') as tar:
        for item in tar:
            path=root/item.name
            if not item.isfile() or not path.resolve().is_relative_to(root):raise ValueError('Invalid staged member')
            data=tar.extractfile(item).read();path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
            if item.name.endswith('.py'):candidate_code[item.name]=hashlib.sha256(data).hexdigest()
    phase('STAGED')
    os.chdir(root);sys.path.insert(0,str(root))
    from engine.projection import training_ledger as ledger,cutoff_pipeline as p,cutoff_state as cs,observations as obs
    from engine.projection.storage import save
    body=p.load(root,REF,'training')
    def copy_ref(ref):
        source=host/ref['path'];data=source.read_bytes()
        if obs.sha(data)!=ref['sha256']:raise ValueError('Captured host input hash mismatch: '+ref['path'])
        dest=root/ref['path'];dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    for ref in [body['replay_ref'],body['legacy_audit_ref'],body['method_fit_ref'],*body['sources'].values()]:copy_ref(ref)
    replay=ledger.read(root,body['replay_ref']);copy_ref(replay['sources']['active_method'])
    parent=ledger.read(root,body['method_fit_ref']);copy_ref(parent['shapes'])
    log=io.StringIO();suite=unittest.defaultTestLoader.discover(str(root/'tests'),pattern='test_projection_training_ledger.py')
    tests=unittest.TextTestRunner(stream=log,verbosity=2).run(suite)
    if not tests.wasSuccessful():raise AssertionError(log.getvalue())
    phase('FIXTURES_PASSED');verified=[]
    original_history=ledger.history
    def differences(a,b,path=''):
        if type(a)!=type(b):return [{'path':path,'old':a,'new':b}]
        if isinstance(a,dict):
            if set(a)!=set(b):return [{'path':path,'keys_old':list(a),'keys_new':list(b)}]
            return [d for k in a for d in differences(a[k],b[k],path+'/'+str(k))]
        if isinstance(a,list):
            if len(a)!=len(b):return [{'path':path,'length_old':len(a),'length_new':len(b)}]
            return [d for i,(x,y) in enumerate(zip(a,b)) for d in differences(x,y,path+'/'+str(i))]
        return [] if a==b else [{'path':path,'old':a,'new':b}]
    original_ref=REF;original_body=body
    # Linux produces its own derivative; the retained historical base is unchanged.
    REF=ledger.create(root,replay_ref=body['replay_ref'],base_ref=body['base_ref'],
        legacy_audit_ref=body['legacy_audit_ref'],method_ref=body['method_fit_ref'],at=dt.datetime.now(dt.timezone.utc))
    body=p.load(root,REF,'training');runtime_diffs=[]
    if body['reconstruction_receipts']!=original_body['reconstruction_receipts']:
        raise ValueError('Runtime changed chronology or state membership')
    for i,(a,b) in enumerate(zip(original_body['preparations'],body['preparations'])):
        runtime_diffs.extend(differences(p.load(root,a,'preparations'),p.load(root,b,'preparations'),'preparations/'+str(i)))
    if any('/features/' not in d['path'] or not isinstance(d.get('old'),float) or not isinstance(d.get('new'),float)
           or abs(d['old']-d['new'])>1e-10 for d in runtime_diffs):
        raise ValueError('Runtime reconstruction exceeds disclosed numerical reconciliation')
    phase('LINUX_DERIVATIVE_CREATED')
    def capture_history(*args,**kwargs):
        try:rows=original_history(*args,**kwargs)
        except ValueError:
            bodies,receipts=ledger.reconstruct(root,body)
            diffs=differences(body['reconstruction_receipts'],receipts,'receipts')
            for i,(saved,produced) in enumerate(zip(body['preparations'],bodies)):
                diffs.extend(differences(p.load(root,saved,'preparations'),produced,'preparations/'+str(i)))
            print(json.dumps({'reconstruction_differences':diffs}),file=sys.stderr,flush=True)
            raise
        verified.extend(rows);phase('TRAINING_VERIFIED');return rows
    manifest={k:body['sources'][k] for k in ('schedule','team_games')}
    observed=obs.capture(root,manifest)
    cutoff='2026-09-29T13:00:00Z'
    with patch.object(cs,'now',return_value=p.timestamp(cutoff)):
        state_ref=cs.advance(root,cutoff,body['method_fit_ref'],observed)
    score=root/'outputs/cadence-v2/weeks/simulated/scorecard.json'
    save(score,{'simulation':True,'games':body['reconstructed_games']},immutable=True)
    closed=root/'outputs/cadence-v2/closeouts/2026-09-29.json'
    save(closed,{'schema':'closeout-publication-v2','state':'PUBLISHED','all_games_graded':True,
        'season':2026,'week':2,'published_at':'2026-09-29T13:01:00+00:00','source_commit':host_commit,
        'publication_surface':'SIMULATED_SOURCE_ACK_NOT_LIVE_PUBLICATION',
        'artifacts':{str(score.relative_to(root)):obs.sha(score.read_bytes())}},immutable=True)
    save(closed.parent/'acknowledgments'/closed.name,{'receipt_sha256':obs.sha(closed.read_bytes()),
        'verified_remote_commit':host_commit,'confirmed_at':'2026-09-29T13:01:10+00:00',
        'publication_surface':'SIMULATED_SOURCE_ACK_NOT_LIVE_PUBLICATION'},immutable=True)
    phase('STATE_AND_SIMULATED_CLOSEOUT_READY')
    with patch.object(ledger,'history',side_effect=capture_history),patch.object(p,'now',return_value=p.timestamp('2026-09-29T13:02:05Z')):
        fitted=p.refit_recorded(root,state_ref,REF,body['method_fit_ref'],closed,at='2026-09-29T13:02:00Z')
    phase('REFIT_COMPLETE');rows=verified
    if len(rows)!=5854:raise ValueError('Full training population differs')
    result=p.read_fit(root,fitted)
    if len(result['training_games'])!=2927 or result['issued_at'] is not None:raise ValueError('Refit population or issuance differs')
    with patch.object(p,'refit',side_effect=AssertionError('Committed retry repeated arithmetic')):
        again=p.refit_recorded(root,state_ref,REF,body['method_fit_ref'],closed,at='2026-09-30T13:02:00Z')
    if again!=fitted:raise ValueError('Retry changed fit')
    # Independent augmented least-squares route, not the engine's normal equations.
    import numpy as np
    _,finals,_,_=cs.available(root,observed,p.timestamp('2026-09-29T13:02:00Z'))
    f=result['fit'];x=np.asarray([[r['features'][k] for k in f['names']] for r in rows],dtype=float)
    y=np.asarray([float(finals[r['game_id']]['home_score' if r['home'] else 'away_score'])-r['features']['baseline'] for r in rows])
    means=np.nanmean(x,axis=0);scales=np.nanstd(x,axis=0);scales=np.where(scales>0,scales,1.)
    z=np.nan_to_num((x-means)/scales);intercept=y.mean();n=len(f['names'])
    coefs=np.linalg.lstsq(np.vstack([z,np.sqrt(f['penalty'])*np.eye(n)]),np.concatenate([y-intercept,np.zeros(n)]),rcond=None)[0]
    delta=float(np.max(np.abs(coefs-np.asarray(f['coefficients']))))
    if delta>1e-10:raise ValueError('Independent ridge reconstruction differs')
    if (root/'work/in-season-learning-v1/active-fit-ref.json').exists():raise ValueError('Canary activated a fit')
    elapsed=time.monotonic()-start;rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024
    fs=os.statvfs(host)
    output={'status':'PASS','scope':'Captured real inputs; simulated future cutoff/closeout clocks and acknowledgment. No live activation or publication.',
        'host_commit':host_commit,'uid':os.getuid(),'python':platform.python_version(),'tests':tests.testsRun,
        'test_log':log.getvalue(),'ledger_ref':REF,'mac_ledger_ref':original_ref,'runtime_feature_differences':runtime_diffs,'training_rows':len(rows),'training_games':len(result['training_games']),
        'refit_ref':fitted,'independent_ridge_max_coefficient_difference':delta,
        'retry_reused_committed_fit':True,'elapsed_seconds':elapsed,'peak_rss_bytes':rss,
        'address_space_limit_bytes':4*1024**3,'root_free_bytes':fs.f_bavail*fs.f_frsize,
        'candidate_code':candidate_code,
        'retained_artifacts':{r['path']:base64.b64encode((root/r['path']).read_bytes()).decode() for r in [REF,*body['preparations']]},
        'simulated_fit_artifact':{'ref':fitted,'bytes':base64.b64encode((root/fitted['path']).read_bytes()).decode()}}
    os.chdir(host)
print(json.dumps(output))
'''
command='cd /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6 && timeout --kill-after=5s 570s runuser -u nflengine -- env OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /opt/nfl-runtime/env/bin/python -u -B -c '+shlex.quote(program)
r=subprocess.run(['ssh','-i',str(ROOT/'.cloud-private/admin_key'),'-o','BatchMode=yes','-o','ConnectTimeout=10','root@159.89.185.88',command],input=archive.getvalue(),capture_output=True,timeout=600)
r.stdout=r.stdout.decode();r.stderr=r.stderr.decode()
(ROOT/'work/engine-rebuild/host-training-transition-canary.phases.log').write_text(r.stderr)
p=ROOT/'work/engine-rebuild/host-training-transition-canary.json'
if r.returncode:
    p.with_suffix('.failure.log').write_text(r.stdout+'\n'+r.stderr)
    raise RuntimeError(r.stderr[-5000:])
body=json.loads(r.stdout)
import sys
sys.path.insert(0,str(ROOT))
from engine.projection.storage import write_bytes
for name,value in body.pop('retained_artifacts').items():
    data=base64.b64decode(value)
    if hashlib.sha256(data).hexdigest()!=Path(name).name.removesuffix('.json.gz'):raise ValueError('Returned artifact hash differs')
    write_bytes(ROOT/name,data,immutable=True)
fit=body.pop('simulated_fit_artifact');data=base64.b64decode(fit['bytes'])
if hashlib.sha256(data).hexdigest()!=fit['ref']['sha256']:raise ValueError('Returned canary fit hash differs')
write_bytes(ROOT/'work/engine-rebuild/training-transition'/('simulated-host-fit-'+fit['ref']['sha256']+'.json.gz'),data,immutable=True)
write_bytes(ROOT/'work/engine-rebuild/training-transition/linux-current-ref.json',(json.dumps(body['ledger_ref'],indent=2)+'\n').encode(),immutable=True)
p.write_text(json.dumps(body,indent=2)+'\n')
print(json.dumps({k:v for k,v in body.items() if k not in ('candidate_code','test_log','runtime_feature_differences')}))
