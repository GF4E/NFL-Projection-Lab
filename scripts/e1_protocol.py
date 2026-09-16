"""Fixed E1 lineage, population and reporting conventions. No fitting."""
import hashlib,json
from collections import Counter
import numpy as np


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def validate_addendum(addendum,parent,expected_hash):
    content={k:v for k,v in addendum.items() if k!='sha256'}
    if canonical_hash(content)!=addendum['sha256'] or addendum['sha256']!=expected_hash:
        raise ValueError('Preregistration addendum hash mismatch')
    if addendum['original_registration_sha256']!=parent['sha256']:
        raise ValueError('Addendum belongs to another experiment')
    if not addendum['candidates_gate_metrics_population_unchanged']:
        raise ValueError('A method or gate change requires separate authorization')
    ids=[i['id'] for i in addendum['items']]
    if len(ids)!=len(set(ids)):raise ValueError('Duplicate sweep items')
    for item in addendum['items']:
        if item['tier'] not in (1,2,3):raise ValueError('Unknown severity tier')
        if not all(item.get(k) for k in ('decision','reason','source')):raise ValueError('Incomplete convention')
        if item['tier']==2 and not item.get('alternative'):raise ValueError('Tier 2 needs explicit alternative')
    # Tier 2 review is deliberately nonblocking for fitting. Evidence preflight
    # separately resolves the concrete B01 prerequisite before any comparison.
    return [i for i in addendum['items'] if i['tier']==2]


def validate_population(rows,expected_game_ids):
    scored=[r for r in rows if 2016<=r['season']<=2025]
    counts=Counter(r['game_id'] for r in scored)
    if set(counts)!=set(expected_game_ids) or any(n!=2 for n in counts.values()):
        raise ValueError('Registered scored population changed')
    sides={gid:set() for gid in counts}
    for row in scored:sides[row['game_id']].add(row['home'])
    if any(side!={True,False} for side in sides.values()):raise ValueError('Missing home/away pairing')
    return len(counts)


def influence(control,challenger,game_ids):
    """Descriptive leave-one-game-out sensitivity; both teams already paired."""
    c=np.asarray(control,dtype=float);k=np.asarray(challenger,dtype=float)
    if c.shape!=k.shape or c.ndim!=1 or len(c)!=len(game_ids) or len(c)<2:
        raise ValueError('Identical paired game losses required')
    denominator=c.sum()-c
    values=np.divide(k.sum()-k,denominator,out=np.full_like(c,np.nan),where=denominator!=0)
    improvements=1-values
    valid=np.flatnonzero(np.isfinite(improvements))
    if not len(valid):return dict(minimum=None,maximum=None,reporting_only=True)
    low=min(valid,key=lambda i:(improvements[i],game_ids[i]));high=min(valid,key=lambda i:(-improvements[i],game_ids[i]))
    return dict(minimum=float(improvements[low]),maximum=float(improvements[high]),
                omitted_game_at_minimum=game_ids[low],omitted_game_at_maximum=game_ids[high],
                reporting_only=True,used_for_selection=False)
