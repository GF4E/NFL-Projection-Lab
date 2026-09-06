from pathlib import Path
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k');s=(R/'tests/research-score-split/test_preflight_unit.py').read_text()
s=s.replace('import research_score_split_preflight as p','import research_score_split_compute_preflight as p').replace('rf02f.controller-','rfcomp04.controller-').replace("'rf02f-v1-'","'rfcomp04-v1-'")
s=s.replace("        common={'version'", "        compute = self.put_raw(p.COMPUTE_PROTOCOL_PATH, b'synthetic compute protocol')\n        self.compute_sha = compute['sha256']\n        backend = self.put_raw('synthetic-runtime.bin', b'pinned private backend')\n        self.runtime_files = {str(self.root / backend['path']): backend['sha256']}\n        common={'version'")
s=s.replace("'runtime':p.RUNTIME,'historical_execution'", "'compute_protocol_sha256':self.compute_sha,'runtime_files':self.runtime_files,\n            'runtime':p.RUNTIME,'historical_execution'")
s=s.replace("'protocol':protocol,'config':cp,", "'protocol':protocol,'config':cp,'compute_protocol':compute,'runtime_files':dict(self.runtime_files),")
s=s.replace('protocol_sha=self.protocol_sha,config_sha=self.config_sha)','protocol_sha=self.protocol_sha,config_sha=self.config_sha,compute_sha=self.compute_sha,\n            runtime_files=self.runtime_files,terminal_pointers={})')
s=s.replace("p.CONFIG_PATH,p.PROTOCOL_PATH)","p.CONFIG_PATH,p.PROTOCOL_PATH,p.COMPUTE_PROTOCOL_PATH,'synthetic-runtime.bin')")
s=s.replace("self.assertEqual(len(p.CODE_FILES),66);self.assertEqual(len(set(p.CODE_FILES)),66)","self.assertEqual(len(p.CODE_FILES),79);self.assertEqual(len(set(p.CODE_FILES)),79)")
s=s.replace("'forecast','watchdog'})", "'forecast','watchdog','comp01','comp02','comp03','rf02f_terminal'})")
pos=s.index("\n\nif __name__")
s=s[:pos]+'''
    def test_old_permission_and_old_qualification_are_rejected(self):
        for where in ('acceptance','qualification'):
            f=Fixture()
            if where=='acceptance': f.acceptance['version']='rf02f.prefit-acceptance.v1'
            else: f.mutate_document(f.acceptance['qualification'],lambda x:x.update(version='rf02f.controller-qualification.v1'))
            with self.assertRaises(ValueError):f.run()

    def test_compute_protocol_and_runtime_file_review_bindings(self):
        for field,value in [('compute_protocol_sha256','0'*64),('runtime_files',{})]:
            for role in ('qualification','numerical','temporal'):
                f=Fixture();pointer=f.acceptance['qualification'] if role=='qualification' else f.acceptance['independent_reviews'][role]
                f.mutate_document(pointer,lambda x:x.update({field:value}))
                with self.subTest(field=field,role=role),self.assertRaises(ValueError):f.run()
        for field,value in [('runtime_files',{}),('compute_protocol',{'path':p.COMPUTE_PROTOCOL_PATH,'sha256':None,'bytes':1})]:
            f=Fixture();f.acceptance[field]=value
            with self.assertRaises(ValueError):f.run()

    def test_runtime_library_tamper_rejected_before_qualification(self):
        f=Fixture();f.files[f.root/'synthetic-runtime.bin']=b'changed private backend'
        with self.assertRaises(ValueError):f.run()
        self.assertNotIn(f.root/'synthetic-qualification.json',f.reads)

    def test_qualified_runtime_files_rechecked_after_science_interface(self):
        from unittest.mock import patch
        seen=[]
        def reader(path,check,**kwargs):
            check();seen.append((str(path),kwargs['expected_sha']));return b''
        with patch.object(p,'actual_runtime',return_value=p.RUNTIME),patch.object(p,'_file',side_effect=reader):
            self.assertEqual(p.validate_runtime_files(lambda:None),p.RUNTIME_FILES)
        self.assertEqual(dict(seen),p.RUNTIME_FILES)
        with patch.object(p,'actual_runtime',return_value={**p.RUNTIME,'scipy':'unqualified'}):
            with self.assertRaises(ValueError):p.validate_runtime_files(lambda:None)

    def test_missing_compute_pin_and_runtime_hash_are_fail_closed(self):
        f=Fixture();f.compute_sha=None
        with self.assertRaisesRegex(ValueError,'invalid_sha256'):f.run()
        f=Fixture();f.runtime_files[next(iter(f.runtime_files))]=None;f.acceptance['runtime_files']=f.runtime_files
        with self.assertRaisesRegex(ValueError,'invalid_sha256'):f.run()

    def test_manifest_changes_with_acceptance_identity_without_old_permission(self):
        f=Fixture();a=f.run();self.assertEqual(a['manifest']['version'],'rfcomp04.manifest.v1')
        self.assertEqual(a['manifest']['runtime_files'],f.runtime_files)
        self.assertEqual(a['manifest']['compute_protocol'],f.acceptance['compute_protocol'])
        self.assertNotEqual(a['identity'],'rf02f-v1-'+a['manifest_sha256'][:16])
''' + s[pos:]
p=R/'tests/research-score-split-compute/test_preflight.py';p.parent.mkdir(exist_ok=True);p.write_text(s)
