"""Audit-only duplicate sensitivity; primary benchmark remains unchanged."""
import collections,csv,json
from pathlib import Path
from scripts.benchmark_gap import ROOT,OUT,summary

def run():
 rows=json.loads((OUT/'per-game.json').read_text());reg=json.loads((OUT/'registration.json').read_text());files=reg['files'];control=next(p for p in files if 'deployed-oof' in p);sp=next(p for p in files if 'schedules-' in p);np=next(p for p in files if 'nfelo-historic' in p)
 d={r['game_id']:r for r in json.loads((ROOT/control).read_text())};s={r['game_id']:r for r in csv.DictReader((ROOT/sp).open())};b={r['game_id']:r for r in json.loads(next((ROOT/'work/projection-v3').glob('baseline-oof-bb7a7f0a*.json')).read_text())};by=collections.defaultdict(list)
 for r in csv.DictReader((ROOT/np).open()):by[r['game_id']].append(r)
 variants={};dups=[]
 for name,index in [('first_source_row',0),('last_source_row',-1)]:
  records=list(rows)
  for gid,options in by.items():
   if len(options)<2 or gid not in d or not 2021<=d[gid]['season']<=2025:continue
   g=d[gid];actual=g['actual_home']-g['actual_away'];r={'game_id':gid,'season':g['season'],'week':g['week'],'actual_margin':actual,'deployed_margin':g['home']-g['away'],'nfelo_margin':-float(options[index]['home_line_pre_regression']),'closing_margin':float(s[gid]['spread_line']),'baseline_margin':b[gid]['home']-b[gid]['away'],'duplicate_choice':name}
   for model in ['deployed','nfelo','closing','baseline']:r[model+'_loss']=abs(actual-r[model+'_margin'])
   records.append(r)
   if index==0:dups.append({'game_id':gid,'nfelo_home_margin_alternatives':[-float(x['home_line_pre_regression']) for x in options]})
  variants[name]=summary(records);(OUT/f'audit-{name}-per-game.json').write_text(json.dumps(sorted(records,key=lambda r:r['game_id']),indent=2)+'\n')
 result={'status':'SECONDARY_AUDIT_RECONSTRUCTION','variants':variants,'duplicated_games':dups};(OUT/'audit-reconstruction.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
 # Descriptive cross-tabs, no regressions or feature selection.
 cross={}
 for dimension in ['season','favorite_band','roof']:
  group=collections.defaultdict(list)
  for r in rows:group[str(r[dimension])+' / '+r['qb_change']].append(r)
  cross[dimension]={k:summary(v) for k,v in sorted(group.items())}
 (OUT/'qb-cross-tabs.json').write_text(json.dumps(cross,indent=2)+'\n')
if __name__=='__main__':run()
