import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from engine.projection.lineage import bind, calibration_for, LEGACY_REGISTRY, read_artifact
from engine.projection.model import hash_value


class ProjectionLineageTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.shape1=self.write('residuals',{'margin':[1,2]})
        self.shape2=self.write('residuals',{'margin':[5,6]})
        self.a={'version':'shared-week-name','fit':{'coefficient':1},'shapes':self.shape1}
        self.b={'version':'shared-week-name','fit':{'coefficient':2},'shapes':self.shape2}
        self.ar=self.write('fit',self.a);self.br=self.write('fit',self.b)
        self.registry([self.ar,self.br])

    def write(self,name,value):
        raw=(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n').encode()
        sha=hashlib.sha256(raw).hexdigest();p=self.root/'work/projection-v3'/f'{name}-{sha}.json'
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
        return {'path':str(p.relative_to(self.root)),'sha256':sha}

    def registry(self,refs):
        r={'versions':{'shared-week-name':refs}};r['sha256']=hash_value(r)
        p=self.root/LEGACY_REGISTRY;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r))

    def card(self,artifact=None,ref=None):
        return bind({'version':'shared-week-name','projection':{'home_points':23,'away_points':20}},ref or self.br,artifact or self.b)

    def test_exact_reference_ignores_same_version_different_fit(self):
        card=self.card();before=copy.deepcopy(card)
        shapes,evidence=calibration_for(card,self.root)
        self.assertEqual(shapes,{'margin':[5,6]});self.assertEqual(evidence['status'],'EXACT_ARTIFACT_REFERENCE')
        self.assertEqual(card,before)

    def test_current_pointer_change_cannot_change_lock_distribution(self):
        card=self.card();self.write('unrelated-current-fit',self.a)
        self.assertEqual(calibration_for(card,self.root)[0],{'margin':[5,6]})
        (self.root/self.ar['path']).write_text('corrupt unrelated old fit')
        self.assertEqual(calibration_for(card,self.root)[0],{'margin':[5,6]})

    def test_corrupt_or_missing_exact_reference_never_falls_back(self):
        card=self.card();(self.root/self.br['path']).write_text('changed')
        with self.assertRaisesRegex(ValueError,'hash'):calibration_for(card,self.root)
        card['fit_artifact_ref']={'path':'work/projection-v3/missing.json','sha256':'0'*64}
        with self.assertRaises(FileNotFoundError):calibration_for(card,self.root)

    def test_body_calibration_and_version_mismatch_fail(self):
        for key,value in [('fit_sha256',hash_value(self.a['fit'])),('calibration_ref',self.shape1),('version','other')]:
            card=self.card();card[key]=value
            with self.subTest(key=key),self.assertRaises(ValueError):calibration_for(card,self.root)

    def test_legacy_body_hash_selects_correct_component_not_first_version(self):
        shapes,evidence=calibration_for({'version':'shared-week-name','fit_sha256':hash_value(self.b['fit'])},self.root)
        self.assertEqual(shapes,{'margin':[5,6]})
        self.assertEqual(evidence['status'],'LEGACY_EXACT_COMPONENTS')
        self.assertEqual(evidence['original_artifact_reference'],'NOT_RECORDED')

    def test_legacy_ambiguity_never_guesses(self):
        with self.assertRaisesRegex(ValueError,'Ambiguous'):calibration_for({'version':'shared-week-name'},self.root)
        a2={**self.a,'shapes':self.shape2};self.registry([self.ar,self.write('fit',a2)])
        with self.assertRaisesRegex(ValueError,'Ambiguous'):
            calibration_for({'version':'shared-week-name','fit_sha256':hash_value(self.a['fit'])},self.root)

    def test_legacy_unique_reconstruction_is_labeled_and_registry_frozen(self):
        self.registry([self.ar]);card={'version':'shared-week-name'}
        _,evidence=calibration_for(card,self.root)
        self.assertEqual(evidence['status'],'LEGACY_UNIQUE_FIT_RECONSTRUCTION')
        self.assertEqual(card,{'version':'shared-week-name'})
        p=self.root/LEGACY_REGISTRY;r=json.loads(p.read_text());r['versions']['shared-week-name']=[self.br];p.write_text(json.dumps(r))
        with self.assertRaisesRegex(ValueError,'registry hash'):calibration_for(card,self.root)

    def test_unapproved_paths_do_not_read_arbitrary_files(self):
        for name in ['/tmp/secret','../../secret','.cloud-private/secret','work/projection-v3/../../../secret']:
            with self.subTest(name=name),self.assertRaises(ValueError):read_artifact(self.root,{'path':name,'sha256':'0'*64})

    def test_calibration_blob_is_hash_verified(self):
        (self.root/self.shape2['path']).write_text('altered calibration')
        with self.assertRaisesRegex(ValueError,'hash'):calibration_for(self.card(),self.root)

    def test_partial_exact_references_cannot_downgrade_to_legacy(self):
        for field in ('fit_artifact_ref','calibration_ref'):
            card=self.card();card.pop(field)
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'Incomplete'):calibration_for(card,self.root)
