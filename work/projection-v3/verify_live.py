import getpass,urllib.request,json,pathlib,datetime,hashlib,gzip
from engine.projection_v3.qualify import read
from engine.projection_v3.card import project
from engine.projection.train import paired
w=pathlib.Path('work/projection-v3');token=getpass.getpass('Site verification credential: ')
u='https://nfl-projection-lab-2026.psoiawesome.chatgpt.site/api/projection-board'
def fetch(url):return urllib.request.urlopen(urllib.request.Request(url,headers={'OAI-Sites-Authorization':token,'User-Agent':'Mozilla/5.0'}),timeout=30).read()
raw=fetch(u+'?refresh=1');live=json.loads(raw);local=json.loads(pathlib.Path('outputs/projection-v3/board.json').read_text());default=json.loads(fetch(u));print('live',live['version'],'games',len(live['games']),'matches',live['games']==local['games'],'scorecards',live['scorecards']==local['scorecards'],'default',default['version'])
assert live['version']==local['version'] and live['games']==local['games'] and live['scorecards']==local['scorecards']
r={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'version':live['version'],'matching_games':len(live['games']),'versioned_scorecards_match':True,'artifact_sha256':hashlib.sha256(raw).hexdigest(),'default_version':default['version'],'credits_spent':0};(w/'verification/live-api.json').write_text(json.dumps(r,indent=2)+'\n')
rows=json.loads(gzip.decompress((w/'features-cloud-parity.json.gz').read_bytes()));pairs=paired(rows);a=read(json.loads((w/'fit-ref.json').read_text()));shapes=read(a['shapes']);diff=[]
for g in live['games']:
 if g['version']==a['version']:
  p,t=project(pairs[g['game_id']],a,shapes,g.get('forecast'));diff.extend(abs(p[k]-g['projection'][k]) for k in ['away_points','home_points','margin','total','home_win_probability'])
print('parity',max(diff),'checked_scalars',len(diff));assert max(diff)<1e-10
(w/'verification/parity.json').write_text(json.dumps({'max_difference':max(diff),'checked_scalars':len(diff),'source':'cloud current feature rows, frozen fit and cloud-issued predictions','version':a['version']},indent=2)+'\n')
