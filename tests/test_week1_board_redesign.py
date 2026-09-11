import copy
import csv
import tempfile
import unittest
from pathlib import Path
from engine.board_summary import summary
from engine.board_bridge import build
from engine.user_bets import record
from engine.slip_grade import settle
from engine.slip_ingest import schedules
from engine.pick_store import read_pinned
import json

class RedesignTests(unittest.TestCase):
    def test_actual_sf_lock_and_first_grades_are_visible(self):
        b=build();g=next(g for g in b['games'] if g['game_id']=='2026_01_SF_LA')
        self.assertEqual(g['status'],'FINAL');self.assertEqual(g['final_score'],{'home':7,'away':27})
        self.assertEqual(g['verdicts']['spreads']['grade'],'W');self.assertEqual(g['verdicts']['totals']['grade'],'L')
        self.assertEqual(g['verdicts']['spreads']['line'],3.5)
        self.assertEqual(g['verdicts']['spreads']['state'],'HARD PASS')
        self.assertEqual(g['consensus']['spreads']['line'],-4)
        self.assertEqual(g['best_captured']['spreads']['price'],-102)
    def test_summary_is_pooled_by_pick_not_mean_of_means(self):
        r=summary([{'outcome':'W','clv_cents':1},{'outcome':'L','clv_cents':3},{'outcome':'P','clv_cents':None}])
        self.assertEqual((r['wins'],r['losses'],r['pushes']),(1,1,1));self.assertEqual(r['mean_clv_cents'],2)
        self.assertIsNone(summary([])['mean_clv_cents'])
    def test_reported_bet_unknown_metadata_and_idempotence(self):
        game=next(g for g in schedules() if g['game_id']=='2026_01_SF_LA')
        log=Path(tempfile.mkdtemp(prefix='board-bet-'))/'log.csv'
        for _ in range(2):record(game,game['home_team'],-3,-120,'williamhill_us','unit test',log=log)
        with log.open() as f:rows=list(csv.DictReader(f))
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]['placed_at'],'');self.assertEqual(rows[0]['stake'],'')
        c=json.loads(Path('work/model-pick-v1/runtime-config.json').read_text())
        r=settle(rows[0],{'final':True,'home_score':7,'away_score':27,'spread_line':3.5,'total_line':47.5,'source_sha256':'test'},read_pinned(c['distribution']))
        self.assertEqual(r['outcome'],'L');self.assertIsNone(r['clv_cents']);self.assertIsNone(r['profit'])
