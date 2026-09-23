import copy
import gzip
import hashlib
import json
import unittest
from pathlib import Path

from engine.projection import training_evidence as e


class TrainingEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.card = {'game_id':'2026_01_BAL_LV', 'home':'LV', 'away':'BAL', 'evidence':'AS_ISSUED',
            'issued_at':'2026-09-13T17:00:00Z', 'freeze_time':'2026-09-13T19:10:00Z',
            'projection':{'home_points':23., 'away_points':21.}}
        self.fit = {'names':['baseline'], 'means':[20.], 'scales':[2.], 'coefficients':[1.],
                    'intercept':1., 'groups':['calibration']}
        self.rows = [{'game_id':self.card['game_id'], 'row_id':self.card['game_id']+':'+team,
            'team':team, 'opponent':opponent, 'home':home, 'actual_points':None,
            'game':{'game_id':self.card['game_id'], 'home_team':'LV', 'away_team':'BAL',
                    'home_score':'', 'away_score':''}, 'features':{'baseline':base}}
            for team,opponent,home,base in [('OAK','BAL',True,64/3), ('BAL','OAK',False,20)]]

    def inspect(self, **kw):
        return e.inspect(self.card,self.rows,self.fit,source_kind='GIT_HASHED_CACHE',
                         recorded_at=kw.pop('recorded_at','2026-09-13T18:00:00Z'),**kw)

    def test_matching_cache_does_not_upgrade_chronology(self):
        result=self.inspect()
        self.assertFalse(result['eligible_for_new_cutoff_refit'])
        self.assertFalse(result['digest_recorded_before_declared_issuance'])
        self.assertEqual(result['physical_input_availability'],'NOT_RECORDED')
        self.assertEqual(result['scheduled_state_receipt'],'NOT_RECORDED')

    def test_row_order_and_existing_aliases(self):
        original=self.inspect(); self.rows.reverse()
        self.assertEqual(original,self.inspect())

    def test_tampered_point_or_feature_rejected(self):
        for field in ('point','feature'):
            with self.subTest(field=field):
                self.setUp()
                if field=='point':self.card['projection']['home_points']+=0.01
                else:self.rows[0]['features']['baseline']+=0.01
                with self.assertRaisesRegex(ValueError,'reproduce'):self.inspect()

    def test_duplicate_side_and_unpaired_rows_rejected(self):
        for rows in ([self.rows[0]], [self.rows[0],self.rows[0]], self.rows+[self.rows[0]]):
            with self.subTest(count=len(rows)), self.assertRaisesRegex(ValueError,'two distinct'):
                e.paired(rows,self.card)

    def test_wrong_team_rejected_even_if_points_match(self):
        self.rows[0]['team']='KC'
        with self.assertRaisesRegex(ValueError,'identity'):self.inspect()

    def test_labels_rejected(self):
        for field in ('actual_points','home_score','away_score'):
            with self.subTest(field=field):
                self.setUp()
                if field=='actual_points':self.rows[0][field]=0
                else:self.rows[0]['game'][field]='0'
                with self.assertRaisesRegex(ValueError,'Outcome embedded'):self.inspect()

    def test_retrospective_never_becomes_pregame(self):
        self.card['evidence']='RETROSPECTIVE'
        with self.assertRaisesRegex(ValueError,'Retrospective'):self.inspect()

    def test_equality_or_late_commit_is_not_prelock(self):
        for value in (self.card['freeze_time'],'2026-09-14T00:00:00Z',None):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError,'pre-lock'):
                self.inspect(recorded_at=value)

    def test_naive_time_and_late_issuance_rejected(self):
        with self.assertRaisesRegex(ValueError,'timezone'):self.inspect(recorded_at='2026-09-13T18:00:00')
        self.card['issued_at']=self.card['freeze_time']
        with self.assertRaisesRegex(ValueError,'before its lock'):self.inspect()

    def test_cache_byte_hash_and_duplicate_rows(self):
        raw=gzip.compress(json.dumps(self.rows).encode(),mtime=0)
        manifest={'sha256':hashlib.sha256(raw).hexdigest()}
        self.assertEqual(e.verify_cache(raw,manifest),self.rows)
        with self.assertRaisesRegex(ValueError,'digest'):e.verify_cache(raw+b'x',manifest)
        raw=gzip.compress(json.dumps(self.rows+[self.rows[0]]).encode(),mtime=0)
        with self.assertRaisesRegex(ValueError,'Nonunique'):
            e.verify_cache(raw,{'sha256':hashlib.sha256(raw).hexdigest()})

    def test_lock_embedded_rows_have_no_invented_commit_clock(self):
        result=e.inspect(self.card,self.rows,self.fit,source_kind='FROZEN_LOCK_FEATURES')
        self.assertIsNone(result['recorded_at'])
        self.assertIsNone(result['digest_recorded_before_declared_issuance'])

    def test_no_input_mutation(self):
        original=copy.deepcopy((self.card,self.rows,self.fit))
        self.inspect()
        self.assertEqual(original,(self.card,self.rows,self.fit))

    def test_nonfinite_forecast_on_either_side_rejected(self):
        for side in ('home','away'):
            with self.subTest(side=side):
                self.setUp();self.card['projection'][side+'_points']=float('nan')
                with self.assertRaisesRegex(ValueError,'reproduce'):self.inspect()

    def test_retained_cumulative_inventory_and_all_original_points(self):
        from engine.projection.lineage import read_artifact
        root=Path(__file__).resolve().parents[1]
        ref=json.loads((root/'work/engine-rebuild/training-input-audit/current-ref.json').read_text())
        raw=(root/ref['path']).read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),ref['sha256'])
        audit=json.loads(gzip.decompress(raw))
        self.assertEqual(audit['population_games'],32)
        self.assertEqual(audit['source_counts'],{'GIT_HASHED_CACHE':12,'FROZEN_LOCK_FEATURES':18,'RETROSPECTIVE_NOT_PREGAME':2})
        self.assertEqual(audit['new_cutoff_training_games_qualified'],0)
        for record in audit['records']:
            self.assertFalse(record['eligible_for_new_cutoff_refit'])
            if record['qualification']=='RETROSPECTIVE_NOT_PREGAME':continue
            source=record['source'];lock=(root/source['lock_ref']['path']).read_bytes()
            self.assertEqual(hashlib.sha256(lock).hexdigest(),source['lock_ref']['sha256'])
            card=json.loads(lock);rows=list(record['rows'].values())
            if source['kind']=='GIT_HASHED_CACHE':
                meta=(root/source['manifest_ref']['path']).read_bytes()
                self.assertEqual(hashlib.sha256(meta).hexdigest(),source['manifest_ref']['sha256'])
                cache=e.verify_cache((root/source['feature_ref']['path']).read_bytes(),json.loads(meta))
                self.assertEqual(e.paired(cache,card),record['rows'])
            else:self.assertEqual(card['learning_features'],record['rows'])
            result=e.inspect(card,rows,read_artifact(root,record['fit_ref'])['fit'],
                source_kind=source['kind'],recorded_at=record['recorded_at'])
            for key,value in result.items():self.assertEqual(value,record[key])


if __name__=='__main__':unittest.main()
