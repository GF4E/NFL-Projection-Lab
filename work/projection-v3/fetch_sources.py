import concurrent.futures,datetime,hashlib,json,pathlib,urllib.request
R=pathlib.Path(__file__).resolve().parents[2];W=R/'work/projection-v3';D=W/'raw';D.mkdir(exist_ok=True)
existing=json.loads((R/'work/harvest-elo-v2/sources/manifest.json').read_text())['records']+json.loads((R/'outputs/iron-man-v1/source-manifest.json').read_text());by={pathlib.Path(x['path']).name.split('-')[0]+'.parquet':x for x in existing};by.update({x['name']:x for x in existing if x.get('name')})
jobs=[]
for tag in ['pbp','depth_charts','injuries']:
 for a in json.loads((W/(tag+'-release.json')).read_text()):
  y=int(a['name'].split('_')[-1].split('.')[0])
  if y>2026 or (tag=='depth_charts' and y<2009):continue
  jobs.append((tag,a))
def fetch(job):
 tag,a=job;n=a['name'];old=by.get(n)
 if old and (R/old['path']).exists():return dict(old,kind=tag,name=n,reused=True)
 p=D/n
 try:
  if not p.exists():
   with urllib.request.urlopen(a['url'],timeout=60) as response:p.write_bytes(response.read())
  return dict(kind=tag,name=n,path=str(p.relative_to(R)),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),url=a['url'],received_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),reused=False)
 except Exception as e:return dict(kind=tag,name=n,status='UNAVAILABLE',error=type(e).__name__)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 rows=list(pool.map(fetch,jobs))
(W/'raw-manifest.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'sources':len(rows),'failed':[r for r in rows if r.get('status')]}))
