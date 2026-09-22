"""Constructed counterexamples for prompt review; not NFL measurements."""
import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo
# Higher expected points need not imply a >50% win probability.
home={0:.6,10:.4};away=3
mean_home=sum(x*p for x,p in home.items());p_home_win=sum(p for x,p in home.items() if x>away)
assert mean_home>away and p_home_win<.5
# Medians do not generally add, even for independent team outcomes.
sum_pmf={0:.36,10:.48,20:.16}
def median(pmf):
 c=0
 for x,p in sorted(pmf.items()):
  c+=p
  if c>=.5:return x
assert median(home)+median(home)!=median(sum_pmf)
# Wrong source timezone changes the UTC cutoff eligibility by three hours.
t=dt.datetime(2026,9,20,16,25)
eastern=t.replace(tzinfo=ZoneInfo('America/New_York')).astimezone(dt.timezone.utc)
wrong=t.replace(tzinfo=ZoneInfo('America/Los_Angeles')).astimezone(dt.timezone.utc)
assert (wrong-eastern).total_seconds()==10800
# Changing only uncertainty cannot improve point MAE.
y=[3,41,20];control=[24.2,27.57,22.8];candidate=control.copy()
mae=lambda p:sum(abs(a-b) for a,b in zip(p,y))/len(y)
assert mae(candidate)==mae(control)
result={'scope':'Constructed counterexamples, not observed NFL outcomes or production validation','higher_mean_without_majority_win':{'home_mean':mean_home,'away_mean':away,'home_win_probability':p_home_win},'median_sum':{'sum_of_medians':median(home)*2,'median_of_sum':median(sum_pmf)},'timezone':{'documented_eastern_to_utc':eastern.isoformat(),'incorrect_stadium_local_to_utc':wrong.isoformat(),'difference_hours':3},'uncertainty_only_point_mae_change':mae(candidate)-mae(control)}
Path(__file__).with_name('counterexamples.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
