"""Capture publication/revision metadata from already reviewed primary URLs."""
import concurrent.futures,datetime,hashlib,json
from pathlib import Path
import requests
from bs4 import BeautifulSoup
O=Path(__file__).resolve().parents[1]/'work/e-qb-change-review-v2'
def capture(r):
 z=dict(r)
 try:
  res=requests.get(r['url'],timeout=25);z.update(http_status=res.status_code,response_sha256=hashlib.sha256(res.content).hexdigest());m=[]
  for tag in BeautifulSoup(res.content,'html.parser').find_all('script',type='application/ld+json'):
   try:v=json.loads(tag.string or tag.get_text())
   except Exception:continue
   for a in v if isinstance(v,list) else [v]:
    if isinstance(a,dict) and a.get('datePublished'):m.append({k:a.get(k) for k in ['headline','datePublished','dateModified']})
  z['structured_metadata']=m
 except Exception as e:z['error']=str(e)
 return z
if __name__=='__main__':
 rows=json.loads((O/'primary-announcements.json').read_text())
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:out=list(pool.map(capture,rows))
 (O/'primary-metadata.json').write_text(json.dumps(out,indent=2)+'\n')
 print('captured',len(out))
