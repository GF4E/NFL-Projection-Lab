import copy
import datetime as dt
import unittest
from engine.board_bridge import project, verdict, teaser_leg

NOW = dt.datetime(2026, 9, 10, 0, 0, tzinfo=dt.timezone.utc)
GAME = dict(game_id='sample', season=2026, week=1, home_team='Seattle Seahawks', away_team='New England Patriots', home_abbr='SEA', away_abbr='NE', kickoff_at='2026-09-10T00:20:00Z')
PICK = dict(market='spreads', side='Seattle Seahawks', line=-3, price=-110, book='betmgm', fair_probability=.65, EV=.1, price_edge_cents=12, edge_source='price', filtered_subset=True)
RECORD = dict(game=GAME, status='LOCKED', version='test', freeze_timestamp='2026-09-09T23:05:00Z', picks=[PICK, {**PICK, 'market':'totals', 'side':'Under', 'line':44.5}])

class BoardBridgeTests(unittest.TestCase):
    def test_play_is_only_locked_executed_book_filter(self):
        self.assertEqual(verdict(RECORD,'spreads')['state'],'PLAY')
        for changes in ({'book':'pinnacle'}, {'filtered_subset':False}, {'fair_probability':.59}, {'price_edge_cents':9}):
            r=copy.deepcopy(RECORD);r['picks'][0].update(changes)
            self.assertNotEqual(verdict(r,'spreads')['state'],'PLAY')
    def test_wong_and_total_crossings(self):
        for line in (-7.5,-8.5,1.5,2.5):
            self.assertEqual(teaser_leg({**PICK,'line':line})[1],[3,7])
        self.assertEqual(teaser_leg({**PICK,'line':-6})[1],[])
        self.assertEqual(teaser_leg({'market':'totals','line':40.5,'side':'Under'}),(46.5,[41,44]))
        self.assertEqual(teaser_leg({'market':'totals','line':51.5,'side':'Over'}),(45.5,[47,51]))
    def test_tease_requires_actual_frozen_ticket_price(self):
        r=copy.deepcopy(RECORD);r['picks'][0].update(line=-8,filtered_subset=False)
        self.assertEqual(verdict(r,'spreads')['state'],'HARD PASS')
        q=dict(book='fanduel',points=6,legs=2,market='spreads',side=PICK['side'],line=-8,price=-110,source_sha256='a'*64,issued_at='2026-09-09T23:00:00Z')
        r['teaser_quotes']=[q]
        v=verdict(r,'spreads');self.assertEqual(v['state'],'TEASE');self.assertEqual(v['partner_status'],'NEEDS_PARTNER')
        q['price']=-120;self.assertEqual(verdict(r,'spreads')['state'],'HARD PASS')
        q['price']=-110;q['issued_at']='2026-09-09T23:06:00Z'
        self.assertEqual(verdict(r,'spreads')['state'],'HARD PASS')
    def test_missed_final_never_invents_grade(self):
        r={**RECORD,'status':'MISSED','picks':[],'reason':'LATE'}
        b=project([GAME],[r],[],{'abc':{'sample':dict(home_score=13,away_score=10)}},'abc','test',NOW)
        g=b['games'][0];self.assertEqual(g['status'],'FINAL');self.assertEqual(g['lock_status'],'MISSED')
        self.assertIsNone(g['freeze_time']);self.assertEqual(g['margin'],3);self.assertEqual(g['total'],23)
        for v in g['verdicts'].values():self.assertEqual(v['availability'],'MISSED');self.assertIsNone(v['grade'])
    def test_stale_has_no_verdict(self):
        g=project([GAME],[RECORD],[],{},None,'test',NOW+dt.timedelta(hours=1))['games'][0]
        self.assertEqual(g['status'],'STALE')
        self.assertTrue(all(v['state'] is None for v in g['verdicts'].values()))
    def test_final_grades_use_first_source_and_map_push(self):
        for outcome,expected in [('W','W'),('L','L'),('P','PUSH')]:
            grades=[dict(version='test',game_id='sample',market=m,kind='actual',outcome=outcome,result_source='first') for m in ('spreads','totals')]
            feeds={'first':{'sample':dict(home_score=13,away_score=10)},'new':{'sample':dict(home_score=99,away_score=0)}}
            g=project([GAME],[RECORD],grades,feeds,'new','test',NOW)['games'][0]
            self.assertEqual(g['final_score']['home'],13)
            self.assertEqual(g['verdicts']['spreads']['grade'],expected)
    def test_missing_first_source_fails(self):
        grade=dict(version='test',game_id='sample',market='spreads',kind='actual',outcome='W',result_source='missing')
        with self.assertRaises(ValueError):project([GAME],[RECORD],[grade],{},None,'test',NOW)
