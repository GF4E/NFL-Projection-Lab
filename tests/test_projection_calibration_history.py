import copy
import unittest
from engine.projection.model import hash_value
from engine.projection import calibration_history as calibration

METHOD = 'a' * 64
OTHER = 'b' * 64


def fixture():
    manifest = {'method_sha256': METHOD, 'available_at': '2014-09-01T00:00:00+00:00',
                'training_game_ids': ['earlier'], 'last_label_available_at': '2014-01-01T00:00:00+00:00'}
    digest = hash_value(manifest)
    rows = [dict(game_id='2014_g1', season=2014, home=20.25, away=18.25, actual_home=24, actual_away=21,
                 issuance_at='2014-09-07T16:45:00+00:00', label_available_at='2014-09-08T00:00:00+00:00',
                 fit_evidence_sha256=digest),
            dict(game_id='2015_g2', season=2015, home=24.5, away=21.5, actual_home=21, actual_away=27,
                 issuance_at='2015-09-07T16:45:00+00:00', label_available_at='2015-09-08T00:00:00+00:00',
                 fit_evidence_sha256=digest)]
    kwargs = dict(expected_game_ids=['2014_g1', '2015_g2'], donor_method_sha256=METHOD,
                  point_method_sha256=METHOD, relation='OWN_LINEAGE', target_season=2016,
                  fitted_at='2016-08-01T00:00:00+00:00', cadence='OFFSEASON',
                  source_refs=[{'path': 'fixture.json', 'sha256': 'c' * 64}])
    return rows, {digest: manifest}, kwargs


class CalibrationHistoryTests(unittest.TestCase):
    def bank(self):
        rows, fits, kwargs = fixture()
        return calibration.build(rows, fits, **kwargs)

    def attach(self, bank, points=None, **change):
        points = points or dict(away_points=18.25, home_points=27.25, margin=9., total=45.5)
        kwargs = dict(expected_sha256=bank['sha256'], point_method_sha256=METHOD,
                      season=2016, issuance_at='2016-09-07T16:45:00+00:00')
        kwargs.update(change)
        return calibration.attach(points, bank, **kwargs)

    def test_paired_residuals_use_game_differences_and_sums(self):
        bank = self.bank()
        shapes = bank['shapes']
        self.assertEqual({int(k): v for k, v in shapes['team_points']['counts'].items() if v}, {-4: 1, 3: 1, 4: 1, 6: 1})
        self.assertEqual({int(k): v for k, v in shapes['margin']['counts'].items() if v}, {-9: 1, 1: 1})
        self.assertEqual({int(k): v for k, v in shapes['total']['counts'].items() if v}, {2: 1, 7: 1})
        self.assertEqual(shapes['team_points']['n'], 4)
        self.assertEqual(shapes['margin']['n'], 2)

    def test_attach_preserves_points_and_source_objects_exactly(self):
        bank = self.bank(); saved = copy.deepcopy(bank)
        points = dict(away_points=18.25, home_points=27.25, margin=9., total=45.5)
        result = self.attach(bank, points)
        self.assertEqual({k: result[k] for k in points}, points)
        self.assertEqual(bank, saved)
        for ranges in result['intervals'].values():
            self.assertLessEqual(ranges['80'][0], ranges['50'][0])
            self.assertLessEqual(ranges['50'][1], ranges['80'][1])
            self.assertTrue(all(type(v) is int for interval in ranges.values() for v in interval))

    def test_strict_wins_ties_and_tie_split_are_distinct(self):
        result = self.attach(self.bank())
        self.assertEqual(result['tie_probability'], .5)
        self.assertEqual(result['home_strict_win_probability'], .5)
        self.assertEqual(result['away_strict_win_probability'], 0.)
        self.assertEqual(result['home_win_probability'], .75)
        self.assertEqual(result['away_win_probability'], .25)

    def test_negative_support_and_distribution_mean_are_disclosed_not_repaired(self):
        points = dict(away_points=1.25, home_points=1.25, margin=0., total=2.5)
        result = self.attach(self.bank(), points)
        self.assertEqual(result['away_points'], 1.25)
        self.assertEqual(result['negative_score_mass']['away_points'], .25)
        self.assertNotEqual(result['distribution_means']['away_points'], result['away_points'])
        self.assertEqual(result['point_semantics'], 'LEGACY_RIDGE_CENTER')

    def test_source_order_is_invariant(self):
        rows, fits, kwargs = fixture()
        self.assertEqual(calibration.build(rows, fits, **kwargs), calibration.build(list(reversed(rows)), fits, **kwargs))

    def test_current_future_seasons_do_not_enter_either_refit(self):
        rows, fits, kwargs = fixture()
        future = dict(rows[-1], game_id='future', season=2016, actual_home=99)
        original = calibration.build(rows, fits, **kwargs)
        self.assertEqual(calibration.build(rows + [future], fits, **kwargs), original)
        kwargs['cadence'] = 'WEEK9'
        week9 = calibration.build(rows + [future], fits, **kwargs)
        self.assertEqual(week9['shapes'], original['shapes'])
        kwargs['expected_game_ids'].append('future')
        with self.assertRaisesRegex(ValueError, 'population'):
            calibration.build(rows + [future], fits, **kwargs)

    def test_missing_and_duplicate_population_rejected(self):
        rows, fits, kwargs = fixture()
        for broken in (rows[:1], rows + [rows[0]]):
            with self.assertRaises(ValueError):
                calibration.build(broken, fits, **kwargs)

    def test_fit_identity_availability_and_self_training_rejected(self):
        for field, value in [('method_sha256', OTHER), ('available_at', '2015-10-01T00:00:00+00:00'),
                             ('last_label_available_at', '2014-09-01T00:00:00+00:00'),
                             ('training_game_ids', ['2014_g1'])]:
            rows, fits, kwargs = fixture()
            manifest = copy.deepcopy(next(iter(fits.values()))); manifest[field] = value
            digest = hash_value(manifest)
            for r in rows: r['fit_evidence_sha256'] = digest
            with self.subTest(field=field), self.assertRaises(ValueError):
                calibration.build(rows, {digest: manifest}, **kwargs)

    def test_outcome_timing_and_integer_scores_rejected(self):
        for field, value in [('label_available_at', '2016-08-01T00:00:00+00:00'),
                             ('label_available_at', '2014-09-07T20:00:00+00:00'),
                             ('actual_home', 20.5), ('actual_home', -1), ('home', float('nan'))]:
            rows, fits, kwargs = fixture(); rows[0][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                calibration.build(rows, fits, **kwargs)

    def test_declared_legacy_donor_is_explicit(self):
        rows, fits, kwargs = fixture(); kwargs['point_method_sha256'] = OTHER
        with self.assertRaisesRegex(ValueError, 'Own-lineage'):
            calibration.build(rows, fits, **kwargs)
        kwargs['relation'] = 'DECLARED_LEGACY_DONOR'
        bank = calibration.build(rows, fits, **kwargs)
        self.attach(bank, point_method_sha256=OTHER)
        with self.assertRaisesRegex(ValueError, 'receiver'):
            self.attach(bank)

    def test_wrong_season_current_table_transplant_or_late_calibration_rejected(self):
        bank = self.bank()
        for change in ({'season': 2015}, {'season': 2026}, {'point_method_sha256': OTHER},
                       {'issuance_at': bank['fitted_at']}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.attach(bank, **change)

    def test_bank_hash_and_regenerated_counts_both_required(self):
        bank = self.bank(); old_hash = bank['sha256']
        bank['shapes']['margin']['counts']['1'] += 1
        with self.assertRaises(ValueError):
            calibration.validate(bank, expected_sha256=old_hash)
        bank['sha256'] = hash_value({k: v for k, v in bank.items() if k != 'sha256'})
        with self.assertRaisesRegex(ValueError, 'reproduce'):
            calibration.validate(bank, expected_sha256=bank['sha256'])

    def test_inconsistent_points_cannot_be_silently_repaired(self):
        with self.assertRaisesRegex(ValueError, 'inconsistent'):
            self.attach(self.bank(), dict(away_points=18.25, home_points=27.25, margin=9.01, total=45.5))

    def test_undeclared_fields_cannot_enter_donor_history(self):
        rows, fits, kwargs = fixture(); rows[0]['spread_line'] = 3.
        with self.assertRaisesRegex(ValueError, 'donor row'):
            calibration.build(rows, fits, **kwargs)
        rows, fits, kwargs = fixture(); kwargs['source_refs'] = []
        with self.assertRaisesRegex(ValueError, 'Source references'):
            calibration.build(rows, fits, **kwargs)

    def test_batch_matches_single_attachment_and_rejects_duplicate_games(self):
        bank = self.bank()
        rows = [dict(game_id=gid, season=2016, issuance_at='2016-09-07T16:45:00+00:00',
                     points=dict(away_points=18.25, home_points=27.25, margin=9., total=45.5)) for gid in ('g2', 'g1')]
        kwargs = dict(expected_sha256=bank['sha256'], point_method_sha256=METHOD)
        values = calibration.attach_many(rows, bank, **kwargs)
        self.assertEqual(values, {r['game_id']: self.attach(bank, r['points']) for r in rows})
        self.assertEqual(values, calibration.attach_many(list(reversed(rows)), bank, **kwargs))
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            calibration.attach_many(rows + [rows[0]], bank, **kwargs)


if __name__ == '__main__':
    unittest.main()
