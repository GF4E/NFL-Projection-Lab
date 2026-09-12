import copy
import json
import tempfile
import unittest
from pathlib import Path
from engine.ticket_ledger import leg_grade, ticket_grade, run
from engine.week1_projection import score_consistency

class TicketTests(unittest.TestCase):
    def setUp(self):
        self.leg={'game_id':'g','market':'spread','side':'H','home_abbr':'H','settlement_line':-3,'week':1}
        self.game={'status':'FINAL','final_score':{'home':24,'away':21},'verdicts':{}}
        self.ticket={'id':'demo','type':'single','price':-120,'stake_cents':5000,'record_class':'paper','legs':[self.leg]}
    def test_single_push_and_price_profit(self):
        self.assertEqual(leg_grade(self.leg,self.game)['outcome'],'PUSH')
        self.assertEqual(ticket_grade(self.ticket,[{'outcome':'PUSH'}])['profit_cents'],0)
        self.assertEqual(ticket_grade(self.ticket,[{'outcome':'WIN'}])['profit_cents'],4167)
    def test_parlay_and_teaser_are_ticket_grades_not_summed_leg_wins(self):
        for typ in ('parlay','teaser'):
            t={**self.ticket,'type':typ,'price':260}
            self.assertEqual(ticket_grade(t,[{'outcome':'WIN'},{'outcome':'LOSS'}])['profit_cents'],-5000)
            self.assertEqual(ticket_grade(t,[{'outcome':'WIN'},{'outcome':'WIN'}])['profit_cents'],13000)
            self.assertEqual(ticket_grade(t,[{'outcome':'WIN'},{'outcome':'PUSH'}])['outcome'],'SETTLEMENT_REVIEW')
            self.assertEqual(ticket_grade(t,[None,{'outcome':'WIN'}])['outcome'],'PENDING')
    def test_teaser_total_and_away_settlement(self):
        l={**self.leg,'settlement_line':3,'side':'A'};self.assertEqual(leg_grade(l,self.game)['outcome'],'PUSH')
        l.update(market='total',side='Under',settlement_line=50);self.assertEqual(leg_grade(l,self.game)['outcome'],'WIN')
    def test_first_grade_and_ticket_survive_replay(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);out=root/'outputs';(out/'model-pick-v1').mkdir(parents=True);(out/'human-tickets-v1/tickets').mkdir(parents=True)
            p=out/'model-pick-v1/board.json';p.write_text(json.dumps({'content_sha256':'abc','games':[dict(self.game,game_id='g')]}));(out/'human-tickets-v1/tickets/demo.json').write_text(json.dumps(self.ticket));run(root);first=(out/'human-tickets-v1/ticket-grades/demo.json').read_bytes();self.game['final_score']['home']=50;p.write_text(json.dumps({'content_sha256':'def','games':[dict(self.game,game_id='g')]}));run(root);self.assertEqual((out/'human-tickets-v1/ticket-grades/demo.json').read_bytes(),first)
    def test_consistency_for_every_side_and_market(self):
        projection={'status':'AVAILABLE','expected_margin':3,'expected_total':49}
        game={'home_team':'H','away_team':'A'}
        for side,line,state in [('H',-3.5,'OPPOSES'),('A',3.5,'SUPPORTS'),('H',-3,'PUSH')]:
            self.assertEqual(score_consistency(projection,{'market':'spreads','side':side,'line':line},game)['state'],state)
        for side,line,state in [('Over',50,'OPPOSES'),('Under',50,'SUPPORTS'),('Over',49,'PUSH')]:
            self.assertEqual(score_consistency(projection,{'market':'totals','side':side,'line':line},game)['state'],state)

if __name__=='__main__':unittest.main()
