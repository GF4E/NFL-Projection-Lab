import unittest
from scripts.e1_current import issued_graded_cards

class IssuedComparisonTests(unittest.TestCase):
    def test_pending_and_retrospective_cards_never_enter_issued_comparison(self):
        graded={'game_id':'issued','evidence':'AS_ISSUED','grades':{'PROJECTION':{'actual':{'home_points':20}}}}
        board={'games':[{'game_id':'pending','evidence':'AS_ISSUED','grades':None},
                        {'game_id':'missing','evidence':'AS_ISSUED'},
                        {'game_id':'retro','evidence':'RETROSPECTIVE','grades':graded['grades']},graded]}
        self.assertEqual(issued_graded_cards(board),[graded])
