"""Offline empirical market residual model. No provider calls or fitting at inference."""
import csv
import hashlib
import json
import math
from collections import Counter
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'work/market-distribution-v1/model.json'

def integer(x):
    """Nearest integer, exact halves away from zero; no smoothing."""
    return int(math.copysign(math.floor(abs(x)+.5), x))

def build(source, output):
    source, output = Path(source), Path(output).resolve()
    raw = source.read_bytes()
    values = {'margin': [], 'total': []}
    seasons = Counter()
    ids = set()
    for r in csv.DictReader(raw.decode().splitlines()):
        if not 2015 <= int(r['season']) <= 2025 or r['game_type'] != 'REG':
            continue
        try:
            home, away = float(r['home_score']), float(r['away_score'])
        except ValueError:
            continue
        if not all(math.isfinite(x) for x in (home, away)):
            continue
        if r['game_id'] in ids:
            raise ValueError('Duplicate game')
        ids.add(r['game_id']); seasons[r['season']] += 1
        for target, actual, field in [('margin', home-away, 'spread_line'), ('total', home+away, 'total_line')]:
            try: line = float(r[field])
            except ValueError: continue
            if math.isfinite(line): values[target].append(actual-line)
    artifact = {'version': 1, 'population': 'REG 2015-2025; reconstructed historical lines, not as-issued T60',
                'source_sha256': hashlib.sha256(raw).hexdigest(), 'season_counts': dict(sorted(seasons.items())),
                'integer_rule': 'nearest integer; half points away from zero; exact residual counts retained separately',
                'spread_convention': 'nflverse positive = home favored; inference accepts home handicap (negative = home favored)', 'targets': {}}
    for target, residuals in values.items():
        if not residuals: raise ValueError('Empty training target')
        counts = Counter(map(integer, residuals))
        artifact['targets'][target] = {'n': len(residuals), 'counts': dict(sorted(counts.items())),
                                      'exact_residual_counts': dict(sorted(Counter(residuals).items()))}
    encoded = (json.dumps(artifact, indent=2, sort_keys=True)+'\n').encode()
    sha = hashlib.sha256(encoded).hexdigest()
    output.mkdir(parents=True, exist_ok=True)
    destination = output / (sha+'.json')
    if destination.exists() and destination.read_bytes() != encoded: raise ValueError('Immutable model changed')
    if not destination.exists(): destination.write_bytes(encoded)
    return {'path': str(destination.relative_to(ROOT)), 'sha256': sha}

class Distribution:
    def __init__(self, counts):
        mass = sum(counts.values())
        if mass <= 0 or any(v < 0 for v in counts.values()): raise ValueError('Invalid mass')
        self.pmf = {int(k): v/mass for k,v in sorted(counts.items())}
    def cdf(self, x): return sum(p for k,p in self.pmf.items() if k <= x)
    def probability(self, line, over=True):
        push = self.pmf.get(line, 0.)
        win = sum(p for k,p in self.pmf.items() if (k > line if over else k < line))
        return {'win': win, 'push': push, 'loss': max(0.,1-win-push), 'conditional_win': win/(1-push) if push < 1 else None}
    def interval(self, level):
        def quantile(q):
            mass = 0.
            for k,p in sorted(self.pmf.items()):
                mass += p
                if mass >= q-1e-12: return k
            return max(self.pmf)
        return quantile((1-level)/2), quantile((1+level)/2)

class MarketDistribution:
    def __init__(self, artifact, consensus_spread, consensus_total):
        self.margin = self.shift(artifact['targets']['margin'], -float(consensus_spread), False)
        self.total = self.shift(artifact['targets']['total'], float(consensus_total), True)
    @staticmethod
    def shift(target, center, nonnegative):
        counts = Counter()
        for residual, count in target['counts'].items():
            value = integer(center)+int(residual)
            counts[max(0,value) if nonnegative else value] += count
        return Distribution(counts)
    def spread(self, handicap, home=True):
        return self.margin.probability(-float(handicap) if home else float(handicap), over=home)
    def totals(self, line, over=True): return self.total.probability(float(line), over)
    def moneyline(self, home=True): return self.margin.probability(0, over=home)
    def teaser(self, line, market='spreads', home=True, over=True):
        if market == 'spreads': return self.spread(float(line)+6, home)
        if market == 'totals': return self.totals(float(line)-6 if over else float(line)+6, over)
        raise ValueError('Teasers support spreads and totals only')

def wong(line):
    line = float(line)
    return -8.5 <= line <= -7.5 or 1.5 <= line <= 2.5

@lru_cache(maxsize=8)
def load(path, sha):
    raw = (ROOT/path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != sha: raise ValueError('Model hash mismatch')
    return json.loads(raw)

def forecast(consensus_spread, consensus_total, reference=None):
    ref = reference or json.loads(REGISTRY.read_text())
    return MarketDistribution(load(ref['path'], ref['sha256']), consensus_spread, consensus_total)

def enrich(rows):
    from engine.pricing import qualifies, price_edge, EXECUTION
    ref = json.loads(REGISTRY.read_text())
    centers = {}
    for row in rows:
        if row['market'] in ('spreads','totals') and row['side'] in (row['home_team'],'Over'):
            centers.setdefault(row['event_id'], {})[row['market']] = row['consensus_fair_line']
    models = {}
    for event, center in centers.items():
        if all(center.get(k,'') != '' for k in ('spreads','totals')):
            models[event] = forecast(center['spreads'], center['totals'], ref)
    for row in rows:
        consensus_pass = row['filter_pass']
        row.update(model_fair_probability='', model_edge_cents='', model_push_probability='', model_win_probability='',
                   model_status='UNSUPPORTED_PLAYER_PROP' if row['market'].startswith('player_') else 'MISSING_CONSENSUS_LINES',
                   model_code_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), model_artifact_sha256=ref['sha256'], model_artifact_path=ref['path'], model_consensus_spread='',model_consensus_total='',
                   consensus_filter_pass=consensus_pass, model_filter_pass=False, filter_source='consensus' if consensus_pass else 'none',
                   wong_teaser=False, teaser_leg_probability='',teaser_push_probability='')
        model = models.get(row['event_id'])
        if not model or row['market'] not in ('spreads','totals','h2h'): continue
        home = row['side'] == row['home_team']; over = row['side'] == 'Over'
        if row['market'] == 'spreads': result = model.spread(row['line'],home)
        elif row['market'] == 'totals': result = model.totals(row['line'],over)
        elif row['side'] == 'Draw':
            p = model.moneyline()['push']; result = {'win':p,'push':0.,'conditional_win':p}
        else:
            result = model.moneyline(home)
            if row['probability_basis'] == 'three_way_including_draw': result = {**result,'conditional_win':result['win'],'push':0.}
        p = result['conditional_win']
        valid = p is not None and 0 < p < 1
        passed = valid and qualifies(p,row['book_price']) and row['executed_book'] in EXECUTION
        row.update(model_fair_probability=p if p is not None else '',model_probability=p if p is not None else '',
                   model_edge_cents=price_edge(p,row['book_price']) if valid else '',model_push_probability=result['push'],model_win_probability=result['win'],
                   model_status='EMPIRICAL_RECONSTRUCTED_HISTORY',model_filter_pass=passed,
                   model_consensus_spread=centers[row['event_id']]['spreads'],model_consensus_total=centers[row['event_id']]['totals'],
                   filter_pass=consensus_pass or passed,board_eligible=consensus_pass or passed,
                   filter_source='both' if passed and consensus_pass else 'model' if passed else 'consensus' if consensus_pass else 'none')
        row['probability_source']='consensus_plus_empirical_residual_model'
        if row['market'] in ('spreads','totals'):
            teaser = model.teaser(row['line'],row['market'],home,over)
            row['teaser_leg_probability']=teaser['win']; row['teaser_push_probability']=teaser['push']
            row['wong_teaser']=row['market']=='spreads' and wong(row['line'])
    return rows

if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--grade',action='store_true')
    parser.add_argument('--t60',nargs='+')
    parser.add_argument('--results')
    parser.add_argument('--picks')
    parser.add_argument('--closing',help='Optional closing pricing CSV, same executed book and exact line')
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    if not args.grade or not all((args.t60,args.results,args.picks)): parser.error('--grade requires --t60, --results and --picks')
    from engine.market_grade import grade
    print(json.dumps(grade(args.t60,args.results,args.picks,args.closing,args.output),indent=2))
