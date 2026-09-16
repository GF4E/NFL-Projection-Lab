import unittest,copy,json
from engine.board_v7 import metadata,summary
from engine.projection.distribution import residual_distribution
class BoardV7(unittest.TestCase):
 def setUp(self):
  self.shapes={'team_points':residual_distribution(list(range(-10,11)),'fixture')}
  self.g={'game_id':'fixture','status':'FINAL','evidence':'AS_ISSUED','freeze_time':'2026-09-01T00:00:00Z','projection':{'away_points':20.25,'home_points':27.5,'intervals':{'margin':{'50':[0,10],'80':[-5,15]},'total':{'50':[30,50],'80':[20,60]}}},'final':{'away_points':25,'home_points':50}}
 def test_issuing_distribution_exact_and_immutable(self):
  before=copy.deepcopy(self.g);m=metadata(self.g,self.shapes);self.assertEqual(self.g,before);self.assertEqual(m['teams']['away']['error'],4.75);self.assertFalse(m['teams']['home']['hits']['80']);self.assertEqual(m['distribution_hash'],self.shapes['team_points']['sha256'])
 def test_no_lock_excluded_not_zero(self):
  self.g['freeze_time']=None;m=metadata(self.g,self.shapes);self.assertIsNone(m['teams']['away']['error']);self.assertEqual(summary([self.g],{'fixture':m})['eligible80'],0)
 def test_current_publication_counts(self):
  b=json.load(open('outputs/projection-v3/board.json'));e=json.load(open('outputs/board-v7/evidence.json'));self.assertEqual(b['content_sha256'],e['board_sha256']);s=summary(b['games'],e['games']);self.assertEqual(s,e['trust']);self.assertEqual(sum(s['pit']),s['teams'])
