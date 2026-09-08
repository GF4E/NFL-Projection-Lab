"""Offline replay/verification of the named T60-weather integration record."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine.harvest import ROOT,digest
from engine.live_weather import qualified,timestamp
p=ROOT/'work/t60-weather-v1/experiment.json';r=json.loads(p.read_text())
for path,sha in r['pins'].items():
 assert digest(ROOT/path)==sha,path
for f in r['current_forecasts']:
 assert timestamp(f['forecast_run_initialized_at'])<=timestamp(f['forecast_issued_at'])<=timestamp(f['request_at'])<=timestamp(f['received_at'])
 assert f['evidence']=='CURRENT_PREVIEW_NOT_T60'
print(json.dumps({'experiment':'t60-weather-v1','hashes':'PASS','forecast_chronology':'PASS','backfilled':False,'credits_spent':0}))
