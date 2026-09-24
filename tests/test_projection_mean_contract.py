"""Counterexamples for forecast meaning, independent of fitting and model scores."""
import copy
import math
import unittest
from engine.projection import mean_contract as contract


def fixture(cells=None):
    cells = cells or [(20, 10, .6), (10, 20, .3), (10, 10, .1)]
    masses = {k: {} for k in contract.TARGETS}
    for h, a, p in cells:
        for k, x in zip(contract.TARGETS, (h, a, h-a, h+a)):
            masses[k][x] = masses[k].get(x, 0.)+p
    def q(m, level):
        return next(x for x in sorted(m) if sum(p for y, p in m.items() if y <= x)+1e-14 >= level)
    points = {k: math.fsum(x*p for x, p in m.items()) for k, m in masses.items()}
    home, away, tie = [math.fsum(p for h, a, p in cells if pred(h, a)) for pred in
                       (lambda h,a:h>a, lambda h,a:h<a, lambda h,a:h==a)]
    return {'points': points, 'marginals': masses,
            'intervals': {k: {'50': [q(m,.25),q(m,.75)], '80': [q(m,.1),q(m,.9)]} for k,m in masses.items()},
            'probabilities': {'home_strict_win_probability': home, 'away_strict_win_probability': away,
                'tie_probability': tie, 'home_win_probability': home+tie/2, 'away_win_probability': away+tie/2},
            'contributions': {s: [{'input':'fixture', 'points':points[s+'_points']}] for s in ('home','away')},
            'joint': [{'home_points':h, 'away_points':a, 'probability':p} for h,a,p in cells]}


class MeanContractTest(unittest.TestCase):
    def test_complete_coherent_means_and_joint_pass_without_activation(self):
        f = fixture(); before = copy.deepcopy(f)
        result = contract.require_expected_score_contract(**f)
        self.assertTrue(result['expected_score_contract_met'])
        self.assertEqual(result['joint_status'], 'VERIFIED_SUPPLIED_JOINT')
        self.assertFalse(result['activates_method'])
        self.assertEqual(f, before)

    def test_positive_mean_can_have_minor_win_probability(self):
        f = fixture([(9,10,.7),(14,10,.3)])
        self.assertGreater(f['points']['margin'], 0)
        self.assertLess(f['probabilities']['home_strict_win_probability'], .5)
        contract.require_expected_score_contract(**f)

    def test_medians_need_not_add_when_means_do(self):
        f = fixture([(0,1,.4),(1,0,.4),(1,1,.2)])
        self.assertAlmostEqual(f['points']['total'], 1.2)
        self.assertEqual(f['intervals']['total']['50'], [1,1])
        contract.require_expected_score_contract(**f)

    def test_missing_joint_is_shortfall_not_inferred_independence(self):
        f = fixture(); f['joint'] = None
        r = contract.assess(**f)
        self.assertEqual(r['joint_status'], 'NOT_ESTABLISHED')
        self.assertEqual(r['violations'], ['JOINT_EVIDENCE_MISSING'])
        with self.assertRaisesRegex(ValueError,'JOINT_EVIDENCE_MISSING'):
            contract.require_expected_score_contract(**f)

    def test_matching_means_do_not_prove_joint_consistency(self):
        f = fixture([(0,0,.5),(2,2,.5)])
        f['marginals']['margin'] = {-2:.5,2:.5}
        f['intervals']['margin'] = {'50':[-2,2], '80':[-2,2]}
        f['probabilities'] = {'home_strict_win_probability':.5,'away_strict_win_probability':.5,
                             'tie_probability':0.,'home_win_probability':.5,'away_win_probability':.5}
        r = contract.assess(**f)
        self.assertEqual(r['violations'], ['JOINT_MARGINAL_MISMATCH:margin'])
        self.assertEqual(r['joint_status'], 'INCOMPATIBLE_WITH_SUPPLIED_JOINT')

    def test_legacy_centers_cannot_silently_be_called_means(self):
        f = fixture(); f['points']['home_points'] += .7
        r = contract.assess(**f)
        self.assertIn('POINT_IS_NOT_DISTRIBUTION_MEAN:home_points',r['violations'])
        self.assertIn('CONTRIBUTION_SUM_MISMATCH:home',r['violations'])
        self.assertIn('POINT_LINEAR_IDENTITY:total',r['violations'])

    def test_negative_support_is_reported_not_clamped(self):
        f = fixture(); f['joint'] = None
        f['marginals']['home_points'] = {-1:.4,20:.6}
        f['intervals']['home_points'] = {'50':[-1,20],'80':[-1,20]}
        before = copy.deepcopy(f)
        r = contract.assess(**f)
        self.assertIn('NEGATIVE_SCORE_SUPPORT:home_points',r['violations'])
        self.assertEqual(f,before)

    def test_rounding_or_widening_a_saved_band_fails(self):
        f = fixture(); f['intervals']['total']['50'] = [29,31]
        r = contract.assess(**f)
        self.assertIn('INTERVAL_DIFFERS_FROM_DISTRIBUTION:total:50',r['violations'])
        self.assertIn('UNNESTED_INTERVALS:total',r['violations'])

    def test_tie_split_probability_is_not_strict_win_probability(self):
        f = fixture(); f['probabilities']['home_strict_win_probability'] = .65
        self.assertIn('PROBABILITY_EVENT_MISMATCH:home_strict_win_probability',contract.assess(**f)['violations'])

    def test_missing_contributions_is_named(self):
        f = fixture(); f['contributions'] = None
        self.assertEqual(contract.assess(**f)['violations'],['CONTRIBUTION_EVIDENCE_MISSING'])

    def test_an_inactive_fact_cannot_claim_a_point_contribution(self):
        f = fixture(); f['contributions']['home'][0]['status'] = 'INACTIVE'
        self.assertIn('INACTIVE_CONTRIBUTION_NONZERO:home',contract.assess(**f)['violations'])

    def test_malformed_probabilities_support_and_joint_are_rejected(self):
        for mass in ({0:.9},{0:-.1,1:1.1},{0:float('nan')},{0:True},{'0':1},{.5:1}):
            f = fixture(); f['marginals']['home_points'] = mass
            with self.subTest(mass=mass),self.assertRaises(ValueError):contract.assess(**f)
        for cell in ({'home_points':-1,'away_points':1,'probability':1},
                     {'home_points':1,'away_points':1,'probability':float('inf')}):
            f = fixture(); f['joint'] = [cell]
            with self.assertRaises(ValueError):contract.assess(**f)
        f = fixture(); f['joint'].append(f['joint'][0])
        with self.assertRaisesRegex(ValueError,'Duplicate'):contract.assess(**f)

    def test_tolerances_are_explicit_and_do_not_hide_real_differences(self):
        f = fixture(); f['points']['home_points'] += contract.TOLERANCE/10
        r = contract.require_expected_score_contract(**f)
        self.assertEqual(r['numeric_tolerance'],contract.TOLERANCE)
        f['points']['home_points'] += contract.TOLERANCE*10
        with self.assertRaises(ValueError):contract.require_expected_score_contract(**f)

    def test_order_invariance_and_no_mutation(self):
        f = fixture(); r = contract.assess(**f)
        f['joint'].reverse()
        f['marginals'] = {k:dict(reversed(list(v.items()))) for k,v in reversed(list(f['marginals'].items()))}
        self.assertEqual(contract.assess(**f),r)

    def test_unrelated_market_or_actual_fields_cannot_enter_point_contract(self):
        for field in ('spread_line','total_line','actual_home','actual_away'):
            f = fixture(); f['points'][field] = 7
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'Four finite'):
                contract.assess(**f)


if __name__ == '__main__': unittest.main()
