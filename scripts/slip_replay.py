"""Named synthetic text/OCR/confirmation/settlement rehearsal; zero provider calls."""
import csv,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.slip_ingest import ingest,extract,schedules,REQUIRED
from engine.slip_grade import run
from engine.pick_store import put,sha

def replay():
    base=ROOT/'work/slip-ingest-v1/synthetic-v1';log=base/'pick_log.csv';games=schedules()
    text,ocr,_=extract(str(base/'slip.png'))
    initial=ingest(text,games,base/'unconfirmed.csv',ocr=ocr,private=base/'private-input')
    assert initial['status']=='NEEDS_CONFIRMATION' and not (base/'unconfirmed.csv').exists()
    # Human-confirmed synthetic fields deliberately supplied, not auto-accepted.
    fields={'game':'2026_01_SF_LA','market':'spreads','side':'Los Angeles Rams','line':'-3','price':'-110','stake':'25','stake_currency':'USD','book':'betmgm','placed_at':'2026-09-10T18:05:00-04:00'}
    saved=ingest(text,games,log,fields,REQUIRED,ocr,base/'private-input')
    duplicate=ingest((base/'slip.txt').read_text(),games,log,fields,private=base/'private-input')
    assert duplicate['status']=='already_recorded'
    result_source=b'game_id,home_score,away_score,spread_line,total_line,result,total\n2026_01_SF_LA,24,20,4,46,4,44\n'
    put(base/'finals.csv',result_source,raw=True)
    first=run(log,base/'grade',base/'finals.csv',include_model=False);second=run(log,base/'grade',base/'finals.csv',include_model=False);assert first==second
    grade=list((base/'grade/grades').glob('*.json'));assert len(grade)==1
    value=json.loads(grade[0].read_text());assert value['outcome']=='W'
    record={'experiment_id':'slip-ingest-v1/synthetic-v1','input':'SYNTHETIC_NOT_AN_EXECUTED_WAGER','screenshot_ocr':'VERIFIED_LOCAL_VISION',
            'unconfirmed_writes':0,'confirmed_rows':1,'duplicate_added_rows':0,'graded':1,'result':'W','profit_USD':value['profit'],
            'idempotent':True,'credits_spent':0,'pick_log_sha256':sha(log.read_bytes()),'grade_sha256':sha(grade[0].read_bytes()),
            'source_scorecard':first['source_scorecard']}
    put(base/'experiment.json',record);return record
if __name__=='__main__':print(json.dumps(replay(),indent=2))
