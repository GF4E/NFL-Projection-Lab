import copy
import datetime as dt
import unittest
from engine.week1_projection import project, display, winner_grade
from engine.live_picks import freeze

class ProjectionTests(unittest.TestCase):
    def setUp(self):
        self.shape={'targets':{'margin':{'counts':{0:4,3:2,-3:2}},'total':{'counts':{0:4,4:2,-4:2}}}}
        self.r={'game':{'week':1,'game_id':'demo','home_team':'H','away_team':'A','cutoff_at':'2026-09-13T15:45:00Z'},'status':'LIVE','captured_at':'2026-09-13T15:40:00Z','distribution_hash':'abc','consensus':{'spreads':{'full':{'center':3}},'totals':{'full':{'center':43}}},'picks':[{'market':'spreads','side':'A','line':7,'book':'betmgm','price':-110,'fair_probability':.55,'win':.55,'push':0,'EV':-.01,'filtered_subset':False,'edge_source':'tiebreak'}]}
        self.now='2026-09-13T15:41:00Z'
    def p(self):return project(self.r,self.shape,self.now)
    def test_score_means_full_precision(self):
        p=self.p();self.assertEqual(p['home_score'],23);self.assertEqual(p['away_score'],20);self.assertEqual(p['winner'],'H');self.assertEqual(p['tie_probability'],.25)
    def test_favorite_winner_and_underdog_cover_are_separate(self):
        self.r['projection']=self.p();g={**self.r['game'],'final_score':{'home':24,'away':20},'verdicts':{'spreads':{'grade':'W'},'totals':{'grade':None}}}
        self.r['status']='LOCKED';d=display(self.r,g,dt.datetime.fromisoformat(self.now.replace('Z','+00:00')))
        self.assertEqual(d['winner_grade'],'WIN');self.assertEqual(d['selections']['spreads']['side'],'A');self.assertEqual(d['selections']['spreads']['grade'],'W')
    def test_tie_result_and_probability(self):
        self.assertEqual(winner_grade(self.p(),self.r['game'],{'home':20,'away':20}),'PUSH')
    def test_coin_flip_deterministic(self):
        self.r['consensus']['spreads']['full']['center']=0
        self.assertTrue(self.p()['coin_flip']);self.assertEqual(self.p(),self.p())
    def test_no_late_historical_or_week2_projection(self):
        for status in ('LOCKED','MISSED'):
            r=copy.deepcopy(self.r);r['status']=status;self.assertEqual(project(r,self.shape,self.now)['status'],'UNAVAILABLE')
        self.assertEqual(project(self.r,self.shape,'2026-09-13T15:45:00Z')['status'],'UNAVAILABLE')
        self.r['game']['week']=2;self.assertEqual(self.p()['status'],'UNAVAILABLE')
    def test_missing_inputs(self):
        self.r['consensus']['totals']['full']['center']=None;self.assertEqual(self.p()['status'],'UNAVAILABLE')
    def test_negative_ev_selection_visible_and_stale_cannot_play(self):
        g={**self.r['game'],'verdicts':{'spreads':{'grade':None},'totals':{'grade':None}}}
        d=display(self.r,g,dt.datetime.fromisoformat(self.now.replace('Z','+00:00')))
        self.assertEqual(d['selections']['spreads']['betting_status'],'LEAN ONLY — filter not met');self.assertTrue(d['selections']['spreads']['negative_EV'])
        self.r['picks'][0].update(filtered_subset=True,fair_probability=.65,price_edge_cents=20)
        d=display(self.r,g,dt.datetime.fromisoformat('2026-09-13T17:00:00+00:00'))
        self.assertEqual(d['selections']['spreads']['betting_status'],'STALE — LEAN ONLY')
    def test_freeze_copies_projection_and_old_lock_is_not_recorded(self):
        self.r['projection']=self.p();f=freeze(self.r,'2026-09-13T15:45:00Z');self.assertEqual(f['projection'],self.r['projection']);self.assertEqual(f['picks'],self.r['picks'])
        self.assertEqual(winner_grade(None,self.r['game'],{'home':30,'away':20}),'not recorded')

if __name__=='__main__':unittest.main()
