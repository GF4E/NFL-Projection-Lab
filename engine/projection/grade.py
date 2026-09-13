"""Accuracy-only scoring; caller selects the evaluation records."""
import math
import statistics


def coverage_flag(observed,nominal):
    return abs(observed-nominal)>0.03+1e-12


def grade(prediction,away_points,home_points):
    actual={'away_points':away_points,'home_points':home_points,'margin':home_points-away_points,'total':home_points+away_points}
    return {'actual':actual,'errors':{k:actual[k]-prediction[k] for k in actual},'interval_hits':{k:{level:lo<=actual[k]<=hi for level,(lo,hi) in intervals.items()} for k,intervals in prediction['intervals'].items()}}


def score(rows):
    if not rows:return {'n':0,'metrics':None}
    errors={k:[r['errors'][k] for r in rows] for k in ('away_points','home_points','margin','total')}
    errors['team_points']=errors.pop('away_points')+errors.pop('home_points')
    metrics={k:{'n':len(e),'mae':statistics.mean(abs(x) for x in e),'sigma':statistics.stdev(e) if len(e)>1 else None} for k,e in errors.items()}
    for target in ('margin','total'):
        metrics[target]['coverage']={}
        for level in ('50','80'):
            observed=statistics.mean(r['interval_hits'][target][level] for r in rows)
            metrics[target]['coverage'][level]={'rate':observed,'flag':coverage_flag(observed,int(level)/100)}
    return {'n':len(rows),'metrics':metrics}
