"""Explicit free forecast refresh. No odds transport or selection calls."""
import csv
import datetime as dt
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.live_weather_v2 import capture
from engine.live_picks import analysis, overwrite
from engine.pick_store import read_pinned
from engine.teaser_prices import load
from engine.pricing import timestamp as datetime_from
from scripts.model_pick_runner import latest


def run():
    config=json.loads((ROOT/'work/model-pick-v1/runtime-config.json').read_text())
    shape=read_pinned(config['distribution']);rows=[]
    for path in sorted((ROOT/'outputs/model-pick-v1/live').glob('*.json')):
        record=json.loads(path.read_text());game=record['game']
        if (record['status']!='LIVE' or game['week']!=1 or
                datetime_from(game['cutoff_at']) <= dt.datetime.now(dt.timezone.utc) or
                (ROOT/'outputs/model-pick-v1/locks'/game['game_id']/'T75-picks.json').exists()):continue
        record['teaser_prices']=load(ROOT)
        if game['roof'] in ('open','outdoors'):
            folder=ROOT/'work/teaser-wind-fix-v1/forecasts'/game['game_id']
            record['forecast']=capture(game,folder)
            overwrite(folder/'forecast.json',record['forecast'])
            record['weather_refreshed_at']=record['forecast']['received_at']
        ref=latest(f'state-{game["season"]}-{game["week"]}.json')
        # Preserve the prior movement comparison; weather-only is not an odds capture.
        old=record['analysis'];fresh=analysis(record,None,shape,read_pinned(ref) if ref else None)
        fresh['sentences'][:4]=old['sentences'][:4]
        for market in ('spreads','totals'):fresh['measured'][market]['movement']=old['measured'][market]['movement']
        record['analysis']=fresh
        # Only scheduled captures build paper-pick previews; this explicit repair
        # refresh changes forecast/analysis and never creates a log entry.
        overwrite(path,record)
        f=record['forecast']
        rows.append({'game':game['away_abbr']+' at '+game['home_abbr'],'game_id':game['game_id'],'kickoff_at':game['kickoff_at'],'roof':game['roof'],'wind_mph':f.get('wind_mph',''),'temperature_c':f.get('temperature_c',''),'precip_mm':f.get('precip_mm',''),'status':f['status'],'wind_rule':fresh['measured']['wind_rule'],'forecast_run':f.get('forecast_run_initialized_at',''),'availability_upper_bound':f.get('forecast_issued_at',''),'request_at':f.get('request_at',''),'source_sha256':f.get('source_sha256','')})
    dest=ROOT/'work/teaser-wind-fix-v1/wind-table.csv'
    with dest.open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');writer.writeheader();writer.writerows(rows)
    print(json.dumps({'forecast_games':sum(r['status']=='FORECAST' for r in rows),'odds_credits':0,'table':str(dest)}))


if __name__=='__main__':run()
