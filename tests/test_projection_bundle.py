import copy
import datetime as dt
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from engine.projection import bundle
from engine.projection.distribution import residual_distribution
from engine.projection.finals import grade_once
from engine.projection.lineage import bind, calibration_for
from engine.projection.model import hash_value
from engine.projection.scoring import FEATURES, artifact_payload, prepare_pair, calculate
from engine.projection.scoring_process import score_batch
from engine.projection_v3.card import make_card
from scripts.projection_v3_publish import lock_card


def fixture(root):
    shapes = {key:residual_distribution([-12,-8,-5,-2,0,2,5,8,12], '1'*64)
              for key in ('team_points','margin','total')}
    def artifact_file(name, value):
        data=bundle.raw(value);sha=hashlib.sha256(data).hexdigest()
        path=root/'work/projection-v3'/f'{name}-{sha}.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
        return {'path':str(path.relative_to(root)),'sha256':sha}
    shape_ref=artifact_file('residuals',shapes)
    fit={'groups':['calibration','elo'],'names':['baseline','elo','elo_difference'],
         'means':[22.,1500.,0.],'scales':[2.,50.,30.],'coefficients':[.1,.2,.3],
         'intercept':2.,'penalty':10.,'training_hash':'2'*64}
    artifact={'version':'fixture.w1','fit':fit,'groups':fit['groups'],'selected':['none',10],
              'inactive':[],'shapes':shape_ref}
    ref=artifact_file('fit',artifact)
    rows={}
    for side, team, offense, defense, baseline in [('home','IND',2.4,2.,22.),('away','BAL',2.2,2.1,21.5)]:
        features={name:None for name in FEATURES}
        features.update(baseline=baseline,elo=1500.,elo_difference=0.,drives=10.,opponent_drives=10.,off_off_ppd=offense,def_off_ppd=defense)
        rows[side]={'team':team,'game_id':'fixture','features':features,'metadata':{},'source_hashes':['1'*64],
                    'actual_points':99.,'game':{'spread_line':99.,'total_line':88.,'home_score':77.}}
    game={'game_id':'fixture','season':2026,'week':1,'home_team':'IND','away_team':'BAL',
          'kickoff_at':'2026-09-27T17:00:00+00:00','cutoff_at':'2026-09-27T15:45:00+00:00'}
    card=bind(make_card(game,rows,artifact,shapes,'2026-09-27T15:40:00+00:00'),ref,artifact)
    return ref,artifact,shapes,rows,game,card


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.ref,self.artifact,self.shapes,self.rows,self.game,self.card=fixture(self.root)


class ScoringBoundaryTests(Fixture):
    def test_isolated_worker_matches_existing_arithmetic_and_explanation(self):
        request=prepare_pair(self.rows)
        actual=score_batch(self.artifact,self.shapes,[request])['fixture']
        self.assertEqual(actual,{key:self.card[key] for key in ('projection','contributions','why')})
        self.assertEqual(score_batch(self.artifact,self.shapes,[prepare_pair(dict(reversed(list(self.rows.items()))))])['fixture'],actual)

    def test_raw_labels_and_market_fields_never_cross_adapter(self):
        before=prepare_pair(self.rows)
        changed=copy.deepcopy(self.rows)
        for row in changed.values():
            row['actual_points']=-999.;row['game']={'home_score':234,'away_score':765,'spread_line':-20.,'total_line':2.}
            row['features']['market']=45.;row['features']['actual_points']=88.
            row['metadata']['total_line']={'label':'sentinel','source_hashes':['f'*64]}
        self.assertEqual(before,prepare_pair(changed))
        encoded=json.dumps(before)
        for field in ('actual_points','home_score','away_score','spread_line','total_line','market','sentinel'):
            self.assertNotIn(field,encoded)

    def test_worker_rejects_extra_fields_at_every_numeric_boundary(self):
        request=prepare_pair(self.rows)
        for location in ('request','row','feature','metadata','fit','shape'):
            with self.subTest(location=location):
                r=copy.deepcopy(request);a=artifact_payload(self.artifact);s=copy.deepcopy(self.shapes)
                target={'request':r,'row':r['rows']['home'],'feature':r['rows']['home']['features'],
                        'metadata':r['rows']['home']['metadata'],'fit':a['fit'],'shape':s['team_points']}[location]
                target['spread_line']=42.
                with self.assertRaises((ValueError,TypeError)):
                    calculate(a,s,r)

    def test_fit_dimension_and_nonfinite_fail_instead_of_zip_truncation(self):
        for mutate in (lambda a:a['fit']['coefficients'].pop(),lambda a:a['fit']['scales'].__setitem__(0,0.),
                       lambda a:a['fit']['means'].__setitem__(0,float('nan'))):
            a=copy.deepcopy(self.artifact);mutate(a)
            with self.assertRaises(ValueError): score_batch(a,self.shapes,[prepare_pair(self.rows)])

    def test_future_market_feature_in_model_does_not_expand_allowlist(self):
        a=copy.deepcopy(self.artifact);a['fit']['names'][0]='spread_line'
        with self.assertRaises(ValueError): artifact_payload(a)

    def test_source_io_guard_in_separate_process(self):
        root=Path(__file__).resolve().parents[1]
        code="""import sys,socket,subprocess
from scripts.projection_score_worker import deny_source_io
sys.addaudithook(deny_source_io)
for operation in [lambda:open('outputs/projection-v3/final-feed.json'),lambda:socket.socket(),lambda:subprocess.run(['true'])]:
 try: operation()
 except PermissionError: pass
 else: raise AssertionError('source access succeeded')
print('three denied')
"""
        result=subprocess.run([sys.executable,'-B','-c',code],cwd=root,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip(),'three denied')

    def test_changed_residual_hash_fails_and_does_not_fallback(self):
        self.shapes['team_points']['counts']['0']+=1
        with self.assertRaises(ValueError): score_batch(self.artifact,self.shapes,[prepare_pair(self.rows)])

    def test_worker_timeout_has_no_in_process_fallback(self):
        with patch('engine.projection.scoring_process.subprocess.run',side_effect=subprocess.TimeoutExpired('worker',60)), patch('engine.projection_v3.card.project') as fallback:
            with self.assertRaises(subprocess.TimeoutExpired): score_batch(self.artifact,self.shapes,[prepare_pair(self.rows)])
            fallback.assert_not_called()

    def test_mismatched_prepared_hash_stops_before_scoring_or_publication(self):
        from scripts import projection_v3_publish as publisher, projection_learning
        work=self.root/'work/projection-v3'
        (work/'current-ref.json').write_text(json.dumps({'sha256':'e'*64,'fit':self.ref}))
        (work/'current-features.json.gz').write_bytes(b'wrong capture')
        with patch.multiple(publisher,ROOT=self.root,WORK=work,OUT=self.root/'outputs'), patch.object(publisher,'read',return_value=self.shapes), patch.object(projection_learning,'active_artifact_with_ref',return_value=(self.ref,self.artifact)), patch.object(publisher,'score_batch') as scorer:
            with self.assertRaisesRegex(ValueError,'Prepared input hash mismatch'): publisher.run()
            scorer.assert_not_called()
        self.assertFalse((self.root/'outputs').exists())

    def test_no_secret_environment_or_parallel_workers(self):
        with patch('engine.projection.scoring_process.subprocess.run') as run:
            run.return_value.returncode=0;run.return_value.stdout='{"fixture":{}}'
            score_batch(self.artifact,self.shapes,[prepare_pair(self.rows)])
        env=run.call_args.kwargs['env']
        self.assertEqual(env,{'OPENBLAS_NUM_THREADS':'1','OMP_NUM_THREADS':'1','MKL_NUM_THREADS':'1'})
        self.assertEqual(run.call_count,1)


class BundleTests(Fixture):
    def setUp(self):
        super().setUp()
        self.code={'commit':'a'*40,'files':{'fixture.py':'b'*64},'environment':{'python':'fixture'}}
        with patch.object(bundle,'capture_code',return_value=self.code):
            self.release=bundle.release_for(self.root,self.ref,self.artifact)
        self.request=prepare_pair(self.rows)
        self.bound=bundle.attach(self.root,self.card,self.request,self.release,{'sha256':'c'*64,'fit':self.ref})

    def test_exact_reproduction_from_bundle_and_pinned_release(self):
        b=bundle.verify_card(self.root,self.bound)
        result=score_batch(self.artifact,self.shapes,[b['input']])['fixture']
        self.assertEqual(result,{k:b['forecast'][k] for k in result})
        self.assertEqual(calibration_for(self.bound,self.root)[0],self.shapes)

    def test_refit_does_not_relabel_or_regrade_original(self):
        path=self.root/'grades/fixture.json'
        cutoff=dt.datetime.fromisoformat(self.game['cutoff_at'])
        locked=lock_card(self.bound,None,self.shapes,cutoff)
        graded=grade_once(locked,path,{'away_score':31,'home_score':41},root=self.root)
        original=path.read_bytes()
        a=copy.deepcopy(self.artifact);a['version']='fixture.w2';a['fit']['intercept']+=100
        data=bundle.raw(a);sha=hashlib.sha256(data).hexdigest();r={'path':f'work/projection-v3/fit-{sha}.json','sha256':sha};(self.root/r['path']).write_bytes(data)
        with patch.object(bundle,'capture_code',return_value=self.code): newer=bundle.release_for(self.root,r,a)
        self.assertNotEqual(newer,self.release)
        again=grade_once(locked,path,{'away_score':0,'home_score':0},root=self.root)
        self.assertEqual(again,graded);self.assertEqual(path.read_bytes(),original)
        self.assertEqual(bundle.resolve(self.root,newer,'releases')['release_parent'],self.release)
        self.assertEqual(bundle.verify_card(self.root,again)['release_ref'],self.release)

    def test_card_tampering_and_missing_reference_fail_closed(self):
        for key in ('projection','contributions','why','issued_at','fit_sha256'):
            card=copy.deepcopy(self.bound);card[key]=None
            with self.subTest(key=key),self.assertRaises(ValueError): bundle.verify_card(self.root,card)
        for key in ('forecast_bundle_ref','release_ref'):
            card=copy.deepcopy(self.bound);del card[key]
            with self.assertRaises(ValueError): calibration_for(card,self.root)

    def test_missing_bundle_or_calibration_cannot_downgrade_to_legacy(self):
        for ref in (self.bound['forecast_bundle_ref'],self.bound['calibration_ref']):
            path=self.root/ref['path'];data=path.read_bytes();path.write_bytes(b'corrupt')
            with self.assertRaises(ValueError): calibration_for(self.bound,self.root)
            path.write_bytes(data)

    def test_unchanged_release_and_bundle_reuse_exact_bytes(self):
        paths={str(p):p.stat().st_mtime_ns for p in self.root.rglob('*') if p.is_file()}
        with patch.object(bundle,'capture_code',return_value=self.code):
            self.assertEqual(bundle.release_for(self.root,self.ref,self.artifact),self.release)
        again=bundle.attach(self.root,self.card,self.request,self.release,{'sha256':'c'*64,'fit':self.ref})
        self.assertEqual(again,self.bound)
        self.assertEqual({str(p):p.stat().st_mtime_ns for p in self.root.rglob('*') if p.is_file()},paths)

    def test_failed_bundle_commit_returns_no_card_reference(self):
        with patch.object(bundle,'write_bytes',side_effect=OSError('disk full')):
            with self.assertRaises(OSError): bundle.attach(self.root,self.card,self.request,self.release,{'sha256':'d'*64})
        self.assertNotIn('forecast_bundle_ref',self.card)
        bundle.verify_card(self.root,self.bound)

    def test_traversal_and_incompatible_schema_rejected(self):
        bad={**self.release,'path':'../'+self.release['path']}
        with self.assertRaises(ValueError): bundle.resolve(self.root,bad,'releases')
        r=bundle.resolve(self.root,self.release,'releases');r['output_schema']='unknown'
        ref=bundle.store(self.root,'releases',r)
        b=bundle.resolve(self.root,self.bound['forecast_bundle_ref'],'bundles');b['release_ref']=ref
        card={**self.bound,'release_ref':ref,'forecast_bundle_ref':bundle.store(self.root,'bundles',b)}
        with self.assertRaises(ValueError): bundle.verify_card(self.root,card)

    def test_uncommitted_code_cannot_acquire_an_issuing_manifest(self):
        (self.root/'fixture.py').write_bytes(b'changed')
        with patch.object(bundle,'CODE_PATHS',('fixture.py',)), patch.object(bundle.subprocess,'check_output',side_effect=['a'*40,b'committed']):
            with self.assertRaises(ValueError): bundle.capture_code(self.root)

    def test_unknown_chronology_is_not_invented(self):
        b=bundle.verify_card(self.root,self.bound)
        self.assertIsNone(b['chronology']['state_cutoff'])
        self.assertIsNone(b['chronology']['source_first_seen_times'])
        self.assertIn('NOT_QUALIFIED',b['chronology']['status'])


if __name__=='__main__':unittest.main()
