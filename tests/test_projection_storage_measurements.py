import copy,datetime as dt,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from engine.projection import storage_measurements as m

NOW=dt.datetime(2026,9,23,18,tzinfo=dt.timezone.utc)
def disk(n=1000,identity=1):return {'filesystems':{k:{'free_bytes':n,'free_inodes':100,'total_bytes':2000,'filesystem_id':identity+i} for i,k in enumerate(('root','artifacts'))}}
class MeasurementsTests(unittest.TestCase):
 def test_first_observation_per_bucket_and_hour_bound(self):
  with tempfile.TemporaryDirectory() as d:
   first=m.observe(d,disk(),NOW.isoformat());again=m.observe(d,disk(900),(NOW+dt.timedelta(seconds=60)).isoformat())
   self.assertEqual(first,again)
   for i in range(1,13):m.observe(d,disk(1000-i),(NOW+dt.timedelta(seconds=i*300)).isoformat())
   self.assertEqual(len(list(Path(d).glob('????-??-??T??.json'))),2)
   self.assertEqual(m.read(d)['filesystems']['root'][0]['samples'],13)
 def test_lost_cursor_write_recovers_same_durable_hour(self):
  with tempfile.TemporaryDirectory() as d:
   real=m.save
   def fail(p,v):
    if p.name=='latest.json':raise OSError('uncertain')
    return real(p,v)
   with patch.object(m,'save',side_effect=fail),self.assertRaises(OSError):m.observe(d,disk(),NOW.isoformat())
   result=m.observe(d,disk(900),(NOW+dt.timedelta(seconds=1)).isoformat())
   self.assertEqual(result['sample']['filesystems']['root']['free_bytes'],1000)
   self.assertEqual(len(json.loads((Path(d)/'2026-09-23T18.json').read_text())['samples']),1)
 def test_clock_rollback_and_full_disk_never_claim_success(self):
  with tempfile.TemporaryDirectory() as d:
   m.observe(d,disk(),NOW.isoformat())
   with self.assertRaises(ValueError):m.observe(d,disk(),(NOW-dt.timedelta(hours=1)).isoformat())
   with patch.object(m,'save',side_effect=OSError('disk full')),self.assertRaises(OSError):m.observe(d,disk(),(NOW+dt.timedelta(minutes=5)).isoformat())
 def test_net_and_gross_are_distinct_and_gaps_split_quality(self):
  rows=[]
  for i,n in enumerate((1000,900,950,800)):
   t=NOW+dt.timedelta(seconds=i*300);rows.append({'bucket':int(t.timestamp())//300,'observed_at':t.isoformat(),**disk(n)})
  result=m.summarize(rows)['filesystems']['root'][0]
  self.assertEqual(result['net_consumption_bytes'],200);self.assertEqual(result['positive_sampled_depletion_bytes'],250)
  self.assertTrue(result['rate_is_extrapolated']);self.assertEqual(result['daily_status'],'INSUFFICIENT_CONTINUOUS_DAY')
  rows[-1]['filesystems']['root']['filesystem_id']=3
  self.assertEqual(len(m.summarize(rows)['filesystems']['root']),2)
 def test_day_requires_real_span_no_gap_and_never_qualifies_headroom(self):
  rows=[]
  for i in range(289):
   t=NOW+dt.timedelta(seconds=i*300);rows.append({'bucket':int(t.timestamp())//300,'observed_at':t.isoformat(),**disk(1000-i)})
  result=m.summarize(rows);self.assertEqual(result['filesystems']['root'][0]['daily_status'],'OBSERVED_AT_LEAST_ONE_DAY');self.assertFalse(result['headroom_qualified'])
  del rows[1:4];self.assertEqual(m.summarize(rows)['filesystems']['root'][0]['daily_status'],'INSUFFICIENT_CONTINUOUS_DAY')
 def test_bad_identity_and_duplicate_buckets_rejected(self):
  value=disk();value['filesystems']['root']['filesystem_id']=None
  with tempfile.TemporaryDirectory() as d,self.assertRaises(ValueError):m.observe(d,value,NOW.isoformat())
  row={'bucket':int(NOW.timestamp())//300,'observed_at':NOW.isoformat(),**disk()}
  with self.assertRaises(ValueError):m.summarize([row,copy.deepcopy(row)])
 def test_misdated_hour_or_forged_bucket_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   m.observe(d,disk(),NOW.isoformat());p=Path(d)/'2026-09-23T18.json';value=json.loads(p.read_bytes())
   value['samples'][0]['bucket']+=1;p.write_text(json.dumps(value))
   with self.assertRaises(ValueError):m.read(d)
   with self.assertRaises(ValueError):m.observe(d,disk(),(NOW+dt.timedelta(minutes=5)).isoformat())
 def test_monitor_names_collection_failure_without_masking_other_faults(self):
  from engine.projection.watchdog import assess_host
  sample={'epoch':NOW.isoformat(),'storage':{'free_bytes':0,'free_inodes':0,'headroom_qualified':False},'storage_measurement':{'state':'FAILED'},'services':{},'source':{}}
  codes={x['code'] for x in assess_host(sample,None,NOW)}
  self.assertTrue({'STORAGE_MEASUREMENT_FAILED','STORAGE_EXHAUSTED','STORAGE_HEADROOM_UNQUALIFIED'}<=codes)
