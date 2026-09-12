import copy
import unittest
from engine.pick_rationale import rationale


class RationaleTests(unittest.TestCase):
    def setUp(self):
        self.r={'game':{'home_team':'Home','away_team':'Away','home_abbr':'H','away_abbr':'A'}}
        self.p={'market':'spreads','side':'Away','line':3.5,'book':'betmgm','price':-110,
                'loo_center':3,'fair_probability':.54,'EV':.03,'filtered_subset':False}

    def text(self):
        r=rationale(self.p,self.r)
        return ' '.join(r['reasons'])+' '+r['assessment']

    def test_dog_hook_explains_cushion_and_key_margin(self):
        s=self.text();self.assertIn('0.5 extra points',s);self.assertIn('wins if A loses by 3',s)

    def test_favorite_three_push_and_hook_loss(self):
        self.p.update(side='Home',line=-3)
        self.assertIn('pushes if H wins by 3',self.text())
        self.p['line']=-3.5
        self.assertIn('loses if H wins by 3',self.text())

    def test_under_and_over_reference_direction(self):
        self.p.update(market='totals',side='Under',line=44,loo_center=43)
        self.assertIn('1 extra points',self.text());self.assertIn('exactly 44 is a push',self.text())
        self.p.update(side='Over',line=42.5)
        self.assertIn('0.5 extra points',self.text());self.assertIn('above 42.5',self.text())

    def test_negative_ev_is_not_confident_and_stale_visible(self):
        self.p.update(EV=-.02,fair_probability=.51,seed='tie')
        r=rationale(self.p,self.r,True)
        self.assertIn('does not justify confidence',r['assessment'])
        self.assertIn('stale',r['assessment'])
        self.assertIn('below break-even',' '.join(r['reasons']))
        self.assertIn('tie does not add conviction',' '.join(r['reasons']))

    def test_input_unchanged_and_unknown_reference_not_invented(self):
        self.p.pop('loo_center');before=copy.deepcopy(self.p)
        self.assertNotIn('other-book reference',self.text());self.assertEqual(self.p,before)


if __name__=='__main__':unittest.main()
