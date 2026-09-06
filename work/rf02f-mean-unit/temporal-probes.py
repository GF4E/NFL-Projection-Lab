"""Independent RF-02F temporal probes using invented games only."""
import hashlib
import json
from pathlib import Path
import resource
import sys
import time
import unittest

REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
sys.path.insert(0, str(REPO / 'scripts'))
import numpy as np
from research_score_models import GameContext, HistoricalResult, MeanTrajectory
from research_score_split_models import make_split_trajectory, split_setting_grid, SPLIT_VARIANTS

TEAMS = tuple('T%02d' % i for i in range(32))
SETTING = {'ks': .2, 'kp': .05, 'retention': .75}
PINS = {
    'scripts/research_score_models.py': '8b2c59c28e080c3da22ba5b8ed608faaf340292873a0c11cb319820a481fe3bd',
    'scripts/research_score_split_models.py': '1826dc343e8fb41154cd572b621a7847a9cfa6bce243b5eeb70661ae7fbb5f48',
    'tests/research-score-split/test_mean_unit.py': '622c7f2f97da6c7f49bbc050ad6d7b583cd3da474b0eeb318dcbb21be6cf3799',
}


def hashes():
    return {name: hashlib.sha256((REPO / name).read_bytes()).hexdigest() for name in PINS}


def g(name, year, week, h=0, a=1):
    return GameContext(name, year, week, TEAMS[h], TEAMS[a])


def r(game, h, a):
    return HistoricalResult(game, h, a)


def center(a):
    return a - a.mean()


def increment(setting, original, scores, h, a, year=2019):
    # Independent S/P-coordinate reference, followed by O/D conversion.
    eh, ea = scores[0] - original[0], scores[1] - original[1]
    factor = .5 if year == 2020 else 1.
    ds, dp = np.zeros(32), np.zeros(32)
    ds[h] += setting['ks'] * factor * (eh - ea) / 2
    ds[a] -= setting['ks'] * factor * (eh - ea) / 2
    dp[h] += setting['kp'] * factor * (eh + ea) / 2
    dp[a] += setting['kp'] * factor * (eh + ea) / 2
    return (ds + dp) / 2, (ds - dp) / 2


def ready(variant='full', setting=None):
    m = make_split_trajectory(setting or SETTING, TEAMS, variant)
    a, b = g('warm', 2019, 1), g('first', 2019, 2)
    m.forecast_origin(2019, 1, [], [a])
    ar = r(a, 10, 10)
    m.forecast_origin(2019, 2, [ar], [b])
    return m, ar, r(b, 18, 6)


class TemporalProbes(unittest.TestCase):
    def test_all_offdiagonals_inherit_original_origin_guard(self):
        for setting in split_setting_grid()[9:]:
            for variant in SPLIT_VARIANTS:
                m = make_split_trajectory(setting, TEAMS, variant)
                self.assertIs(type(m).forecast_origin, MeanTrajectory.forecast_origin)
                self.assertEqual(m.family, 'E2')
        a = dict(SETTING)
        m = make_split_trajectory(a, TEAMS)
        a['ks'] = .05
        self.assertEqual(m.setting, SETTING)

    def test_own_offdiagonal_mean_survives_delay_and_output_mutation(self):
        m, warm, first = ready()
        clone, _, _ = ready()
        diagonal = MeanTrajectory('E2', {'k': .2, 'retention': .75}, TEAMS)
        diagonal.forecast_origin(2019, 1, [], [warm.context])
        diagonal.forecast_origin(2019, 2, [warm], [first.context])
        target = g('delayed', 2019, 3)
        out = m.forecast_origin(2019, 3, [warm, first], [target])
        clone.forecast_origin(2019, 3, [warm, first], [target])
        diagonal.forecast_origin(2019, 3, [warm, first], [target])
        original = m.stored['delayed']['mean'].copy()
        other_original = diagonal.stored['delayed']['mean'].copy()
        self.assertFalse(np.array_equal(original, other_original))
        out['forecasts'][0]['mean'][:] = 123456.
        np.testing.assert_array_equal(m.stored['delayed']['mean'], original)
        other = g('intervening', 2019, 4, 2, 3)
        for model in (m, clone):
            model.forecast_origin(2019, 4, [first, warm], [other])
            model.forecast_origin(2019, 5, [warm, first, r(other, 100, 2)], [])
        before_o, before_d = m.offense.copy(), m.defense.copy()
        observed = (14, 20)
        oi, di = increment(SETTING, original, observed, 0, 1)
        wrong_o, wrong_d = increment(SETTING, other_original, observed, 0, 1)
        for model in (m, clone):
            model.forecast_origin(2019, 6, [r(target, *observed), warm, r(other, 100, 2), first], [])
        np.testing.assert_allclose(m.offense, center(before_o + oi), rtol=0, atol=1e-15)
        np.testing.assert_allclose(m.defense, center(before_d + di), rtol=0, atol=1e-15)
        self.assertGreater(np.max(np.abs(m.offense - center(before_o + wrong_o))), 1e-6)
        self.assertGreater(np.max(np.abs(m.defense - center(before_d + wrong_d))), 1e-6)
        np.testing.assert_array_equal(m.offense, clone.offense)
        np.testing.assert_array_equal(m.defense, clone.defense)

    def test_shuffle_delivery_uses_original_epoch_before_retention(self):
        m, warm, first = ready('shuffled_identity')
        raw = json.dumps([20260904, 'shuffle', 2019, 2], ensure_ascii=True, separators=(',', ':')).encode()
        seed = int.from_bytes(hashlib.sha256(raw).digest()[:8], 'big')
        permutation = np.random.Generator(np.random.PCG64(seed)).permutation(TEAMS)
        mapping = dict(zip(TEAMS, permutation))
        stored = m.stored['first']
        self.assertEqual((stored['context'].home, stored['context'].away),
                         (mapping[first.context.home], mapping[first.context.away]))
        h, a = TEAMS.index(stored['context'].home), TEAMS.index(stored['context'].away)
        oi, di = increment(SETTING, stored['mean'], (18, 6), h, a)
        output = m.forecast_origin(2021, 1, [first, warm], [g('future', 2021, 1)])
        np.testing.assert_allclose(m.offense, center(center(oi) * .75**2), rtol=0, atol=1e-16)
        np.testing.assert_allclose(m.defense, center(center(di) * .75**2), rtol=0, atol=1e-16)
        self.assertEqual(output['events']['delivered'], ['first'])
        self.assertTrue(output['events']['offseason_retention_applied'])

    def test_zero_coordinates_persist_over_all_settings_and_season_boundaries(self):
        contexts = [g('a', 2019, 1), g('b', 2019, 2, 0, 2), g('c', 2020, 1, 3, 4),
                    g('d', 2020, 2, 2, 3), g('e', 2022, 1, 0, 4), g('f', 2022, 2, 1, 4)]
        scores = [(10, 10), (37, 3), (7, 45), (21, 19), (50, 2), (17, 17)]
        for setting in split_setting_grid():
            for variant in ('zero_strength_update', 'zero_scoring_level_update'):
                model = make_split_trajectory(setting, TEAMS, variant)
                self.assertIsNot(type(model), MeanTrajectory)
                history = []
                for game, score in zip(contexts, scores):
                    model.forecast_origin(game.season, game.week, history, [game])
                    disabled = model.offense + model.defense if variant == 'zero_strength_update' else model.offense - model.defense
                    np.testing.assert_array_equal(disabled, np.zeros(32))
                    history.append(r(game, *score))

    def test_future_disappearance_and_target_guards_precede_state_change(self):
        attempts = [
            (2019, 2, lambda w, f: [w], [], 'origin_not_strictly_chronological'),
            (2019, 3, lambda w, f: [], [], 'duplicate_or_disappearing_input'),
            (2019, 3, lambda w, f: [w, r(g('future', 2019, 3), 2, 2)], [], 'same_week_or_future_input'),
            (2019, 3, lambda w, f: [w], [g('wrong', 2019, 4)], 'wrong_target_origin'),
            (2019, 3, lambda w, f: [w], [g('x', 2019, 3), g('x', 2019, 3)], 'duplicate_target'),
            (2019, 3, lambda w, f: [w], [g('first', 2019, 3)], 'target_identity_already_forecast'),
        ]
        for year, week, history, targets, reason in attempts:
            m, w, f = ready()
            before = (m.last_origin, m.delivered.copy(), m.offense.copy(), m.defense.copy())
            with self.assertRaisesRegex(ValueError, reason):
                m.forecast_origin(year, week, history(w, f), targets)
            self.assertEqual((m.last_origin, m.delivered), before[:2])
            np.testing.assert_array_equal(m.offense, before[2])
            np.testing.assert_array_equal(m.defense, before[3])

    def test_absorbing_failure_consumes_later_delivery_without_reset(self):
        for variant in SPLIT_VARIANTS:
            m, warm, first = ready(variant)
            m.offense[0] = np.inf
            following = g('following', 2019, 3)
            with np.errstate(invalid='ignore'):
                out = m.forecast_origin(2019, 3, [warm, first], [following])
            self.assertTrue(out['absorbing_failure'])
            later = m.forecast_origin(2022, 1, [warm, first, r(following, 17, 3)], [g('last', 2022, 1)])
            self.assertTrue(later['absorbing_failure'])
            self.assertEqual(later['forecasts'][0]['failure'], 'nonfinite_dynamic_state')
            self.assertIsNone(later['forecasts'][0]['mean'])
            self.assertIn('following', m.delivered)

    def test_nonpositive_forecast_is_not_absorbing_or_replaced_learning_input(self):
        m, warm, first = ready()
        m.offense[0] = -100.
        following = g('following', 2019, 3)
        out = m.forecast_origin(2019, 3, [warm, first], [following])
        self.assertEqual(out['forecasts'][0]['failure'], 'invalid_mean')
        self.assertFalse(out['absorbing_failure'])
        original = m.stored['following']['mean'].copy()
        self.assertLess(original[0], 0)
        oi, di = increment(SETTING, original, (17, 3), 0, 1)
        before_o, before_d = m.offense.copy(), m.defense.copy()
        m.forecast_origin(2019, 4, [warm, first, r(following, 17, 3)], [])
        np.testing.assert_allclose(m.offense, center(before_o + oi), rtol=0, atol=1e-14)
        np.testing.assert_allclose(m.defense, center(before_d + di), rtol=0, atol=1e-14)

    def test_inherited_input_authentication_and_nontransactional_error_limits(self):
        # This documents two existing caller obligations, not new guarantees.
        changed, warm, first = ready()
        clean, _, _ = ready()
        out = changed.forecast_origin(2019, 3, [r(warm.context, 30, 30), first], [g('next', 2019, 3)])
        ref = clean.forecast_origin(2019, 3, [warm, first], [g('next', 2019, 3)])
        self.assertNotEqual(out['league_mean'], ref['league_mean'])
        m, warm, first = ready()
        wrong = r(g('first', 2019, 2, 0, 2), 18, 6)
        with self.assertRaisesRegex(ValueError, 'delivered_context_mismatch'):
            m.forecast_origin(2019, 3, [warm, wrong], [])
        self.assertIn('first', m.delivered)
        self.assertEqual(m.last_origin, (2019, 2))


if __name__ == '__main__':
    assert hashes() == PINS
    started = time.monotonic()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(TemporalProbes)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    assert hashes() == PINS
    report = {'status': 'passed' if result.wasSuccessful() else 'failed', 'tests': result.testsRun,
              'failures': len(result.failures), 'errors': len(result.errors),
              'seconds_excluding_imports': time.monotonic() - started,
              'peak_rss_mib': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2,
              'source_hashes_before_and_after': PINS, 'historical_data_loaded': False,
              'historical_fit_or_score': False,
              'limitations_demonstrated': ['already_delivered_input_contents_require_caller_authentication',
                                           'delivery_validation_error_can_mutate_instance_before_raising']}
    output = Path(__file__).with_name('temporal-probe-result.json')
    with output.open('x') as f:
        json.dump(report, f, indent=2)
        f.write('\n')
    print(json.dumps(report))
    raise SystemExit(0 if result.wasSuccessful() else 1)
