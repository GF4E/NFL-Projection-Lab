import copy
import hashlib
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from engine.projection import weekly_diagnostics as d
from engine.projection.distribution import residual_distribution, summarize
from engine.projection.grade import grade
from engine.projection.model import hash_value


def write_ref(root, name, value):
    path=root/'work/projection-v3'/name;path.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(value,sort_keys=True).encode();path.write_bytes(raw)
    return {'path':str(path.relative_to(root)),'sha256':hashlib.sha256(raw).hexdigest()}


def fixture(root, gid='2026_01_A_H', week=1, home=20., away=17., ah=24, aa=10):
    shapes={k:residual_distribution([-8,-3,0,1,5], 'fixture') for k in ('team_points','margin','total')}
    sr=write_ref(root,'shapes.json',shapes);fit={'fixture':True}
    fr=write_ref(root,'fit.json',{'version':'fixture','fit':fit,'shapes':sr})
    pred=summarize(away,home,shapes)
    card={'game_id':gid,'season':2026,'week':week,'home':'H','away':'A','evidence':'AS_ISSUED','version':'fixture',
          'projection':pred,'grades':{'PROJECTION':grade(pred,aa,ah)},'fit_artifact_ref':fr,'fit_sha256':hash_value(fit),'calibration_ref':sr}
    for kind in ('grades','locks'):
        p=root/f'outputs/projection-v3/{kind}/{gid}.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(card))
    return card,shapes


class WeeklyDiagnostics(unittest.TestCase):
    def test_independent_scoring_and_counts(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,shapes=fixture(root)
            scored=d.score_card(root,c)
            for target,row in scored['scores'].items():
                p=row['point'];y=row['actual'];center=int(math.copysign(math.floor(abs(p)+.5),p))
                values=[center+x for x in [-8,-3,0,1,5]]
                crps=sum(abs(x-y) for x in values)/5-sum(abs(x-z) for x in values for z in values)/50
                self.assertAlmostEqual(row['crps'],crps,places=12)
                for level in ('50','80'):
                    lo,hi=row[level]['lower'],row[level]['upper'];alpha=1-int(level)/100
                    score=hi-lo+2/alpha*max(lo-y,0)+2/alpha*max(y-hi,0)
                    self.assertAlmostEqual(row[level]['interval_score'],score)
            self.assertAlmostEqual(scored['winner']['brier'],(scored['winner']['probability']-1)**2)
            report=d.build(root,[c]);s=report['populations']['AS_ISSUED']['tables'][0]
            self.assertEqual(s['targets']['team_points']['n'],2)
            self.assertEqual(s['targets']['team_points']['50']['n'],2)
            self.assertEqual(s['targets']['margin']['50']['n'],1)
            self.assertEqual(sum(s['targets']['team_points']['pit_counts']),2)
            self.assertEqual(s['targets']['team_points']['mae_paired95']['status'],'INSUFFICIENT')

    def test_first_grade_over_later_board_and_no_active_fit(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,_=fixture(root);original=copy.deepcopy(c)
            c['projection']['home_points']=99;c['grades']['PROJECTION']['actual']['home_points']=100
            with patch('engine.projection_v3.model.fit',side_effect=AssertionError('No fitting')):
                r=d.build(root,[c])
            self.assertEqual(r['records'][0]['scores']['home_points']['point'],20)
            self.assertEqual(r['records'][0]['scores']['home_points']['actual'],24)
            self.assertTrue(r['records'][0]['board_differs_from_first_grade'])
            self.assertEqual(json.loads((root/'outputs/projection-v3/grades'/f"{c['game_id']}.json").read_bytes()),original)

    def test_pairing_keeps_two_teams_together(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);a,_=fixture(root,home=20,away=20,ah=20,aa=30)
            b,_=fixture(root,gid='2026_01_B_H',home=20,away=20,ah=30,aa=20)
            s=d.summarize([d.score_card(root,c) for c in (a,b)])
            self.assertEqual(s['targets']['team_points']['mae'],5)
            self.assertEqual(s['targets']['team_points']['mae_paired95']['lower95'],5)
            self.assertEqual(s['targets']['team_points']['mae_paired95']['upper95'],5)

    def test_missing_calibration_keeps_point_denominator(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,_=fixture(root)
            with patch.object(d.lineage,'calibration_for',side_effect=FileNotFoundError):r=d.build(root,[c])
            t=r['populations']['AS_ISSUED']['tables'][0]['targets']['team_points']
            self.assertEqual(t['n'],2);self.assertEqual(t['probability_n'],0);self.assertIsNone(t['crps'])
            self.assertEqual(t['shortfall']['missing_observations'],2)
            self.assertIn('needs Original calibration',d.markdown(r))

    def test_corrupt_calibration_and_original_error_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,_=fixture(root)
            with patch.object(d.lineage,'calibration_for',side_effect=ValueError('Residual hash differs')):
                with self.assertRaises(ValueError):d.build(root,[c])
            path=root/'outputs/projection-v3/grades'/f"{c['game_id']}.json"
            bad=copy.deepcopy(c);bad['grades']['PROJECTION']['errors']['home_points']+=1;path.write_text(json.dumps(bad))
            with self.assertRaisesRegex(ValueError,'error differs'):d.build(root,[c])

    def test_duplicate_malformed_lock_and_bad_identity_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,_=fixture(root)
            with self.assertRaisesRegex(ValueError,'Duplicate'):d.build(root,[c,c])
            bad=copy.deepcopy(c);bad['game_id']='../x'
            with self.assertRaisesRegex(ValueError,'Unsafe'):d.build(root,[bad])
            path=root/'outputs/projection-v3/locks'/f"{c['game_id']}.json"
            bad=copy.deepcopy(c);bad['projection']['home_points']+=1;path.write_text(json.dumps(bad))
            with self.assertRaisesRegex(ValueError,'lock/first-grade'):d.build(root,[c])

    def test_saved_interval_or_probability_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,_=fixture(root)
            for field in ('intervals','home_win_probability'):
                bad=copy.deepcopy(c)
                if field=='intervals':bad['projection']['intervals']['total']['50'][0]-=1
                else:bad['projection'][field]+=.01
                with self.assertRaises(ValueError):d.score_card(root,bad)

    def test_empty_pending_missing_grade_and_tie(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,_=fixture(root,home=20,away=20,ah=20,aa=20)
            self.assertEqual(d.build(root,[])['populations']['AS_ISSUED']['games'],0)
            p=copy.deepcopy(c);p['grades']=None
            self.assertTrue(d.build(root,[p])['records'][0]['board_differs_from_first_grade'])
            p['game_id']='2026_02_PENDING'
            self.assertEqual(d.build(root,[p])['pending_games'],[p['game_id']])
            missing=copy.deepcopy(c);missing['game_id']='2026_02_NO_GRADE'
            r=d.build(root,[missing]);self.assertEqual(len(r['shortfalls']),1)
            r=d.score_card(root,c);self.assertEqual(r['winner']['outcome'],.5)
            self.assertAlmostEqual(r['winner']['brier'],(r['winner']['probability']-.5)**2)

    def test_row_order_and_exact_lineage_strata(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);a,_=fixture(root);b,_=fixture(root,gid='2026_02_B_H',week=2)
            r=d.build(root,[a,b]);self.assertEqual(r,d.build(root,[b,a]))
            pop=r['populations']['AS_ISSUED'];self.assertEqual(pop['games'],2)
            self.assertEqual(len(pop['tables']),5);self.assertEqual(len(pop['by_lineage']),5)
            self.assertEqual(sum(x['n'] for x in pop['tables'][0]['winner']['reliability']),2)

    def test_weekly_report_integration_no_refit(self):
        from scripts import projection_learning as runtime
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);c,_=fixture(root)
            c.update(cutoff_at='2026-09-13T16:45:00Z',contributions={},learning_features={})
            work=root/'work/in-season-learning-v1';work.mkdir();(work/'reference.json').write_text('{}')
            board={'games':[c],'content_sha256':'fixture','published_at':'2026-09-14T00:00:00Z'}
            (root/'outputs/projection-v3/board.json').write_text(json.dumps(board))
            out=root/'outputs/in-season-learning-v1';out.mkdir()
            with (patch.multiple(runtime,ROOT=root,WORK=work,OUT=out),patch.object(runtime,'initialize'),patch.object(runtime,'fit',side_effect=AssertionError('No fit')),
                 patch('scripts.reference_lines.weekly_report',return_value={}),patch('scripts.reference_lines.render',return_value='DIAGNOSTIC ONLY')):
                result=runtime.report()
            self.assertEqual(result['forecast_diagnostics']['populations']['AS_ISSUED']['games'],1)
            self.assertIn('First-grade probability diagnostics',(out/'trend.md').read_text())
            self.assertEqual(json.loads((out/'trend.json').read_bytes())['forecast_diagnostics'],result['forecast_diagnostics'])
