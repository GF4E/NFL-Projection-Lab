"""Display-only book table. No network, fitting, or projection writes."""
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BOOKS = [('williamhill_us', 'Caesars'), ('betmgm', 'BetMGM')]
def stamp(s):
    return dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
def digest(b):
    return hashlib.sha256(b).hexdigest()
def complete(offers, home, away):
    def val(book, market, side):
        vals = {float(o['line']) for o in offers if o.get('book') == book and o.get('market') == market and o.get('side') == side and isinstance(o.get('line'), (int, float)) and math.isfinite(o['line'])}
        return next(iter(vals)) if len(vals) == 1 else None
    for key, label in BOOKS:
        h, a, over, under = [val(key, m, s) for m, s in [('spreads', home), ('spreads', away), ('totals', 'Over'), ('totals', 'Under')]]
        if None not in (h, a, over, under) and h == -a and over == under and over > 0 and all(v*2 == int(v*2) for v in (h,a,over)):
            return {'book': label, 'home_handicap': int(h) if h.is_integer() else h, 'total': int(over) if over.is_integer() else over}
    return None

def run(root=ROOT):
    root=Path(root); records=[]
    for path in sorted((root/'outputs/iron-man-v1/markets').glob('*.json')):
        b=path.read_bytes();x=json.loads(b);g=x.get('game',{});v=complete(x.get('offers',[]),g.get('home_team'),g.get('away_team'))
        if v: records.append((g.get('game_id'),x.get('captured_at'),g.get('cutoff_at'),v,path,b))
    # Legacy captures already carry an immutable capture time and actual book DTOs.
    for kind in ('live','locks','grades'):
        for path in sorted((root/f'outputs/game-card-v3/{kind}').glob('*.json')):
            b=path.read_bytes();x=json.loads(b);m=x.get('market') or {};offers=[]
            for book, row in m.get('books',{}).items():
                for market in ('spreads','totals'):
                    for side, quote in row.get(market,{}).items():
                        if quote:offers.append({'book':book,'market':market,'side':side,'line':quote.get('line')})
            v=complete(offers,x.get('home'),x.get('away'))
            if v:records.append((x.get('game_id'),m.get('capture_time'),x.get('scheduled_cutoff'),v,path,b))
    games={};now=dt.datetime.now(dt.timezone.utc)
    for gid,at,cut,v,path,b in records:
        if not gid or not at or not cut:continue
        try:
            if stamp(at)>now or stamp(at)>=stamp(cut):continue
        except (ValueError,TypeError):continue
        v={**v,'captured_at':at,'cutoff_at':cut,'source_path':str(path.relative_to(root)),'source_sha256':digest(b)}
        old=games.get(gid)
        if old is None or (stamp(at),v['book']=='Caesars',v['source_path'])>(stamp(old['captured_at']),old['book']=='Caesars',old['source_path']):games[gid]=v
    payload={'schema':'board-v8-market-display','version':'board-v8-market-v1','games':dict(sorted(games.items())),'credits_spent':0}
    body=json.dumps(payload,sort_keys=True,separators=(',',':')).encode();sha=digest(body)
    folder=root/'outputs/board-v8-market';folder.mkdir(exist_ok=True,parents=True)
    archive=folder/f'{sha}.json'
    if not archive.exists():archive.write_bytes(body)
    (folder/'latest.json').write_text(json.dumps({**payload,'content_sha256':sha},sort_keys=True)+'\n')
    return {**payload,'content_sha256':sha}
if __name__=='__main__':
    result=run();print(json.dumps({'games':len(result['games']),'sha256':result['content_sha256'],'credits_spent':0}))
