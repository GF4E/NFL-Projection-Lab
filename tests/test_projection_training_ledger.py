import copy
import gzip
import json
from unittest.mock import patch

import test_projection_cutoff_publication as helpers
from test_projection_cutoff_state import game,statistics
from engine.projection import training_ledger as ledger,cutoff_pipeline as p,cutoff_state as cs,observations as obs
from engine.projection.storage import save
from scripts import projection_v3_publish as publisher
from engine.forecast_system.calendar import timestamp


class Base(helpers.PublicationTests):
    pass
for name in vars(helpers.PublicationTests):
    if name.startswith('test_'):setattr(Base,name,None)


class TrainingLedgerTests(Base):
    def test_streamed_cache_preserves_fitting_fields_and_rejects_bad_framing(self):
        rows=[{'row_id':str(i),'features':{'baseline':float(i)},'metadata':{'long':'x'*70000},
               'personnel':{'status':'UNKNOWN'},'state_lineage':{'role':'HISTORICAL_RECONSTRUCTION'}} for i in range(3)]
        raw=obs.raw({'schema':'retained-pregame-training-v1','rows':rows})
        self.assertEqual(ledger.historical_rows(gzip.compress(raw)),[ledger.fit_row(r) for r in rows])
        for malformed in (raw[:-2],raw.replace(b'v1',b'v2'),raw.replace(b'},{',b'}{'),raw+b'garbage'):
            with self.subTest(malformed=malformed[-40:]),self.assertRaises(ValueError):
                ledger.historical_rows(gzip.compress(malformed))

    def test_compacted_rows_leave_ridge_identity_and_forecasts_unchanged(self):
        self.setup_ledger();body=p.load(self.root,self.ledger_ref,'training')
        rows=p.load(self.root,body['base_ref'],'training')['rows']
        for index,row in enumerate(rows):row['actual_points']=20.+index
        from engine.projection_v3.model import fit,predict
        before=fit(rows,p.GROUPS,10);after=fit([ledger.fit_row(r) for r in rows],p.GROUPS,10)
        self.assertEqual(before,after)
        self.assertEqual([predict(before,r['features']) for r in rows],[predict(after,r['features']) for r in rows])

    def setup_ledger(self):
        self.setup_publisher()
        warm=game('warm','2026-09-03','20:30');retro=game('retro','2026-09-06','13:00')
        future=game('later','2026-09-14','20:30')
        games=[warm,retro,self.g,{**self.target,'home_score':24.,'away_score':20.},future]
        sources={'schedule':self.source('schedule',games),
            'team_games':self.source('team-games',[r for g in games for r in statistics(g)]),
            'stadiums':self.write('config/test-stadiums.json',{'stadiums':[]})}
        # A small hash-pinned historical base stands in for the prior qualified replay.
        rows=copy.deepcopy(self.prepared()['rows'])
        for row in rows:
            row.update(game_id='base',row_id='base:'+row['team'],season=2025,week=18)
            row['game'].update(game_id='base',season=2025,week=18,gameday='2025-12-28')
            issue=p.time_of(row['game']);cut=p.cutoff_before(issue)
            row['state_lineage'].update(role='HISTORICAL_RECONSTRUCTION',cutoff_at=cut.isoformat(),
                required_cutoff=cut.isoformat(),prepared_at=issue.isoformat())
        base=gzip.compress(obs.raw({'schema':'retained-pregame-training-v1','rows':rows}),mtime=0)
        method=cs.method(self.root,self.fit_ref)
        replay={'retained_training_cache':{'path':'private-cache','sha256':obs.sha(base)},'training_rows':2,
            'sources':{**sources,'active_method':self.fit_ref},'code':[{'path':k,'sha256':v} for k,v in method['code'].items()]}
        replay_ref=self.write('work/replay.json',replay)
        base_ref=ledger.retain_base(self.root,base,replay)
        audit_ref=self.write('work/audit.json',{'population_games':1,'records':[{'game_id':'retro','evidence':'RETROSPECTIVE'}]})
        self.ledger_ref=ledger.create(self.root,replay_ref=replay_ref,base_ref=base_ref,
            legacy_audit_ref=audit_ref,method_ref=self.fit_ref,at='2026-09-15T14:00:00Z')
        return p.load(self.root,self.ledger_ref,'training')

    def changed(self,body):return p.store(self.root,'training',body)

    def test_reconstruction_keeps_population_and_never_invents_recorded_clocks(self):
        body=self.setup_ledger();rows=ledger.history(self.root,self.ledger_ref)
        self.assertEqual(len(rows),4)
        receipt=body['reconstruction_receipts'][0]
        self.assertEqual(receipt['incorporated_games'],['warm'])
        self.assertEqual(receipt['availability'],'ASSUMED_NOT_RECORDED')
        recent=[r for r in rows if r['game_id']=='retro']
        self.assertTrue(all(r['state_lineage']['role']=='HISTORICAL_RECONSTRUCTION' for r in recent))
        self.assertTrue(all('state_ref' not in r['state_lineage'] for r in recent))
        self.assertTrue(all(r['actual_points'] is None for r in rows))

    def test_source_row_reordering_preserves_numerical_reconstruction(self):
        body=self.setup_ledger();before,_=ledger.reconstruct(self.root,body)
        for kind in ('schedule','team_games'):
            values=ledger.read(self.root,body['sources'][kind]);values.reverse()
            body['sources'][kind]=self.source(kind,values)
        after,_=ledger.reconstruct(self.root,body)
        self.assertEqual(before,after)

    def test_later_outcome_cannot_change_earlier_features(self):
        body=self.setup_ledger();before,_=ledger.reconstruct(self.root,body)
        schedule=ledger.read(self.root,body['sources']['schedule'])
        for g in schedule:
            if g['game_id']!='warm':g.update(home_score=99.,away_score=0.)
        body['sources']['schedule']=self.source('schedule',schedule)
        after,_=ledger.reconstruct(self.root,body)
        self.assertEqual(before,after)

    def test_hash_valid_corrupted_preparation_is_rejected(self):
        body=self.setup_ledger();prep=p.load(self.root,body['preparations'][0],'preparations')
        prep['rows'][0]['features']['baseline']+=1
        body['preparations'][0]=p.store(self.root,'preparations',prep)
        with self.assertRaisesRegex(ValueError,'does not reconstruct'):
            ledger.history(self.root,self.changed(body))

    def test_missing_legacy_game_and_mixed_method_rejected(self):
        body=self.setup_ledger();body['reconstructed_games']=[]
        with self.assertRaisesRegex(ValueError,'Legacy population'):ledger.history(self.root,self.changed(body))
        body=p.load(self.root,self.ledger_ref,'training');body['method']['elo_hfa']['2026']+=1
        with self.assertRaisesRegex(ValueError,'method differs'):ledger.history(self.root,self.changed(body))

    def test_labels_duplicate_rows_and_unknown_roles_rejected(self):
        self.setup_ledger();rows=ledger.history(self.root,self.ledger_ref)
        for mode in ('label','duplicate','role','baseline'):
            bad=copy.deepcopy(rows)
            if mode=='label':bad[0]['actual_points']=0
            elif mode=='duplicate':bad.append(bad[0])
            elif mode=='baseline':bad[0]['features']['baseline']=None
            else:bad[0]['state_lineage']['role']='PROVISIONAL'
            with self.subTest(mode=mode),self.assertRaises(ValueError):ledger.paired_rows(bad)

    def test_original_live_lock_appends_without_changing_prior_rows(self):
        self.setup_ledger();before=ledger.history(self.root,self.ledger_ref)
        publisher.run(timestamp('2026-09-13T15:01:00Z'))
        publisher.run(timestamp('2026-09-13T15:45:00Z'))
        path='outputs/projection-v3/locks/sun.json';raw=(self.root/path).read_bytes()
        lock_ref={'path':path,'sha256':obs.sha(raw)}
        ref=ledger.append_locks(self.root,self.ledger_ref,[lock_ref],at='2026-09-15T14:01:00Z')
        rows=ledger.history(self.root,ref)
        self.assertEqual([r for r in rows if r['game_id']!='sun'],before)
        self.assertEqual(len(rows),6)
        self.assertEqual(ledger.append_locks(self.root,ref,[lock_ref],at='2026-09-16T14:01:00Z'),ref)
        self.assertEqual((self.root/path).read_bytes(),raw)
        bad=p.load(self.root,ref,'training');bad.update(parent=ref,recorded_locks=[])
        with self.assertRaisesRegex(ValueError,'dropped or revised'):
            ledger.history(self.root,self.changed(bad))
        with self.assertRaisesRegex(ValueError,'revision rejected'):
            ledger.append_locks(self.root,ref,[{**lock_ref,'sha256':'0'*64}],at='2026-09-16T14:01:00Z')

    def test_unlocked_or_unbundled_rows_cannot_enter_recorded_training(self):
        body=self.setup_ledger();card=publisher.run(timestamp('2026-09-13T15:01:00Z'))['games'][0]
        ref=self.write('outputs/projection-v3/locks/sun.json',card)
        body['recorded_locks']=[ref];body['training_games'].append('sun')
        with self.assertRaisesRegex(ValueError,'as-issued lock'):ledger.history(self.root,self.changed(body))

    def test_proxy_equality_excludes_even_a_known_final(self):
        body=self.setup_ledger();schedule=ledger.read(self.root,body['sources']['schedule'])
        exact=game('equal','2026-09-04','05:00');schedule.append(exact)
        stats=ledger.read(self.root,body['sources']['team_games'])+statistics(exact)
        body['sources']['schedule']=self.source('schedule',schedule)
        body['sources']['team_games']=self.source('team-games',stats)
        _,receipts=ledger.reconstruct(self.root,body)
        self.assertEqual(receipts[0]['incorporated_games'],['warm'])

    def test_recorded_refitter_invokes_ledger_and_rejects_cumulative_gap(self):
        state,training,closed=self.recorded_refit_inputs()
        rows=p.load(self.root,training,'training')['rows']
        ref=p.store(self.root,'training',{'schema':ledger.SCHEMA,'created_at':'2026-09-15T13:01:00Z'})
        with patch.object(ledger,'history',return_value=rows) as load:
            with patch.object(p,'refit',side_effect=AssertionError('Must stop before fit')):
                with self.assertRaisesRegex(ValueError,'cumulative closeout population'):
                    p.refit_recorded(self.root,state,ref,self.fit_ref,closed,at='2026-09-15T13:02:00Z')
        load.assert_called_once()

    def test_refit_cannot_use_a_ledger_created_after_its_frozen_start(self):
        state,training,closed=self.recorded_refit_inputs()
        ref=p.store(self.root,'training',{'schema':ledger.SCHEMA,'created_at':'2026-09-15T13:02:00Z'})
        with patch.object(ledger,'history',side_effect=AssertionError('Must reject before reading rows')):
            with self.assertRaisesRegex(ValueError,'unavailable at refit start'):
                p.refit_recorded(self.root,state,ref,self.fit_ref,closed,at='2026-09-15T13:02:00Z')

    def test_base_hash_corruption_is_rejected(self):
        body=self.setup_ledger();path=self.root/body['base_ref']['path']
        path.write_bytes(path.read_bytes()+b'x')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):ledger.history(self.root,self.ledger_ref)
