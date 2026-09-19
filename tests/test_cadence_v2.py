import unittest
from datetime import datetime,timedelta
from engine.forecast_system import cadence
from engine.forecast_system.calendar import PACIFIC
class CadenceTests(unittest.TestCase):
 def game(self,gid,day,hour):
  k=datetime(2026,9,day,hour,tzinfo=PACIFIC)
  return {'game_id':gid,'season':2026,'issuance_at':(k-timedelta(minutes=75)).isoformat(),'assimilation_available_at':(k+timedelta(hours=4)).isoformat()}
 def test_thursday_sunday(self):
  games=[self.game('thursday',17,17),self.game('sunday',20,10)]
  lineage=cadence.plan(games);self.assertEqual(cadence.audit(games,lineage),2)
  sunday=next(b for b in lineage if any(g['game_id']=='sunday' for g in b['forecasts']))
  self.assertEqual(datetime.fromisoformat(sunday['cutoff']).astimezone(PACIFIC).weekday(),4)
  self.assertEqual(sunday['incorporated'],['thursday'])
 def test_strict_boundary_and_dst(self):
  for month,day in [(3,9),(11,2)]:
   exact=datetime(2026,month,day,6,tzinfo=PACIFIC)
   self.assertLess(cadence.cutoff_before(exact),exact);self.assertGreater(cadence.next_cutoff(exact),exact)
 def test_three_per_week_no_duplicates(self):
  games=[self.game('one',17,17),self.game('two',28,17)];b=cadence.plan(games)
  days=[datetime.fromisoformat(x['cutoff']).astimezone(PACIFIC) for x in b]
  self.assertEqual([d.weekday() for d in days if datetime(2026,9,21,tzinfo=PACIFIC)<=d<datetime(2026,9,28,tzinfo=PACIFIC)],[0,1,4]);cadence.audit(games,b)
  with self.assertRaises(ValueError):cadence.plan(games+games)
if __name__=='__main__':unittest.main()
