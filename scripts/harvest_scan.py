"""Read-only monthly GitHub inventory. Human review supplies the fixed rubric.

No fetched implementation is executed or installed; no experiment auto-admission.
"""
import argparse,datetime as dt,hashlib,json,sys,urllib.request,urllib.parse
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'work/harvest-scan';PT=ZoneInfo('America/Los_Angeles')
QUERIES=['NFL projection walk forward','NFL EPA team strength','NFL opponent adjustment','NFL home field','NFL quarterback value','probabilistic scoring','conformal prediction time series','post processed prediction intervals']

def closeout_ready(root,now):
 local=now.astimezone(PT)
 if local.weekday()!=1 or local.day>7:return False,'NOT_FIRST_TUESDAY'
 receipt=root/'outputs/cadence-v2/closeouts'/f'{local.date()}.json'
 if not receipt.exists():return False,'WAITING_FOR_PUBLISHED_CLOSEOUT_RECEIPT'
 try:
  r=json.loads(receipt.read_text());published=dt.datetime.fromisoformat(r['published_at'].replace('Z','+00:00'))
  if published.tzinfo is None or published>now or published.astimezone(PT).date()!=local.date() or r.get('state')!='PUBLISHED' or not r.get('all_games_graded') or not r.get('source_commit'):return False,'INVALID_CLOSEOUT_RECEIPT'
  artifacts=r.get('artifacts',{})
  if not artifacts:return False,'NO_CLOSEOUT_ARTIFACTS'
  for name,h in artifacts.items():
   p=(root/name).resolve()
   if not p.is_relative_to(root.resolve()) or hashlib.sha256(p.read_bytes()).hexdigest()!=h:return False,'CLOSEOUT_HASH_MISMATCH'
  from scripts.closeout_publish import require_published
  require_published(root,receipt,now)
 except (ValueError,KeyError,OSError):return False,'INVALID_CLOSEOUT_RECEIPT'
 return True,'READY'

def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'NFL-Projection-Lab-monthly-harvest','Accept':'application/vnd.github+json'})
 return json.load(urllib.request.urlopen(req,timeout=30))

def collect(now):
 searches=[]
 for query in QUERIES:
  url='https://api.github.com/search/repositories?q='+urllib.parse.quote(query)+'&per_page=5'
  try:
   d=get(url);searches.append({'query':query,'url':url,'results':[{'repository':r['full_name'],'url':r['html_url'],'description':r.get('description')} for r in d.get('items',[])]})
  except Exception as exc:searches.append({'query':query,'url':url,'status':'UNAVAILABLE','error_type':type(exc).__name__})
 result={'retrieved_at':now.isoformat(),'searches':searches,'review_required':True,'automatic_admission':False};payload=json.dumps(result,indent=2)+'\n';h=hashlib.sha256(payload.encode()).hexdigest();p=OUT/f'{now.astimezone(PT).date()}.discovery-{h[:12]}.json';p.write_text(payload);return p

def main():
 p=argparse.ArgumentParser();p.add_argument('--first-run-authorized',action='store_true');p.add_argument('--check-due',action='store_true');args=p.parse_args();now=dt.datetime.now(dt.timezone.utc)
 ready,reason=closeout_ready(ROOT,now)
 if args.first_run_authorized:
  if now.astimezone(PT).date()!=dt.date(2026,9,18):raise ValueError('Initial-run exception is only September 18, 2026')
  ready=True;reason='EXPLICIT_FIRST_RUN'
 if args.check_due or not ready:print(json.dumps({'ready':ready,'reason':reason}));return
 print(json.dumps({'inventory':str(collect(now)),'state':'REVIEW_REQUIRED'}))
if __name__=='__main__':main()
