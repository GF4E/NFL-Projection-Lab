import copy
import datetime as dt
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from engine.projection import observations as obs

NOW=dt.datetime(2026,9,22,19,tzinfo=dt.timezone.utc)


def fixture():
    game={'game_id':'g1','game_type':'REG','season':'2026','week':'2','gameday':'2026-09-20',
          'gametime':'13:00','home_team':'BAL','away_team':'BUF','home_score':'24','away_score':'20',
          'location':'Home','stadium_id':'fixture','roof':'outdoors','source_hash':'schedule'}
    rows=[]
    for team,opponent in [('BAL','BUF'),('BUF','BAL')]:
        row={k:None for k in obs.STAT_FIELDS}
        row.update(game_id='g1',team=team,opponent=opponent,season=2026,week=2,date='2026-09-20',
                   drives=10,plays_per_drive=6,off_ppd=2.,fg_points=3,turnovers_lost=1,source_hash='stats')
        row.update({k:0 for k in obs.STAT_FIELDS if k.startswith('fg_') and k!='fg_points'})
        rows.append(row)
    return [game],rows


class ObservationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.games,self.stats=fixture()
        self.clock=patch.object(obs,'now',return_value=NOW);self.clock.start();self.addCleanup(self.clock.stop)

    def source(self,name,rows):
        data=obs.raw(rows);identity=obs.sha(data);p=self.root/f'work/projection-v1/data/{name}-{identity}.json'
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        return {'path':str(p.relative_to(self.root)),'sha256':identity}

    def manifest(self):
        return {'schedule':self.source('schedule',self.games),'team_games':self.source('team-games',self.stats),
                'prepared_at':'1900-01-01T00:00:00Z'}

    def test_capture_binds_real_collection_clock_and_paired_facts(self):
        manifest=self.manifest();ref=obs.capture(self.root,manifest);snapshot,records=obs.load(self.root,ref)
        self.assertEqual(len(records),1);r=records['g1']
        self.assertEqual(r['collected_at'],NOW.isoformat());self.assertEqual(r['sources']['schedule'],manifest['schedule'])
        self.assertEqual(r['game']['home_score'],24.);self.assertEqual(len(r['statistics']),2)
        self.assertIsNone(r['previous'])

    def test_unchanged_facts_reuse_first_receipt_despite_new_source_metadata(self):
        first=obs.capture(self.root,self.manifest());before={str(p):p.read_bytes() for p in (self.root/obs.BASE).rglob('*') if p.is_file()}
        self.games[0]['source_hash']='new file';self.stats.reverse();self.stats[0]['source_hash']='new file'
        with patch.object(obs,'now',return_value=NOW+dt.timedelta(days=1)):
            self.assertEqual(obs.capture(self.root,self.manifest()),first)
        self.assertEqual(before,{str(p):p.read_bytes() for p in (self.root/obs.BASE).rglob('*') if p.is_file()})

    def test_revision_links_old_observation_and_preserves_historical_snapshot(self):
        first=obs.capture(self.root,self.manifest());_,old=obs.load(self.root,first)
        self.games[0]['home_score']='25'
        with patch.object(obs,'now',return_value=NOW+dt.timedelta(hours=1)):
            second=obs.capture(self.root,self.manifest())
        _,new=obs.load(self.root,second)
        self.assertEqual(new['g1']['previous'],old['g1']['reference'])
        self.assertEqual(obs.load(self.root,first)[1]['g1']['game']['home_score'],24.)
        self.assertEqual(new['g1']['game']['home_score'],25.)

    def test_missing_pair_future_result_and_final_absence_are_not_invented(self):
        self.stats=[];ref=obs.capture(self.root,self.manifest());snapshot,records=obs.load(self.root,ref)
        self.assertFalse(records);self.assertEqual(snapshot['unknown'][0]['reason'],'TEAM_STATISTICS_UNAVAILABLE')
        games,stats=fixture();games[0]['gameday']='2026-09-23'
        records,unknown=obs.material(games,stats,NOW)
        self.assertFalse(records);self.assertEqual(unknown[0]['reason'],'COMPLETION_PROXY_NOT_REACHED')
        games[0]['home_score']='';self.assertEqual(obs.material(games,stats,NOW),({},[]))

    def test_missing_statistics_still_records_final_revisions_and_validates_scores(self):
        self.stats=[];first=obs.capture(self.root,self.manifest())
        self.games[0]['source_hash']='changed metadata'
        self.assertEqual(obs.capture(self.root,self.manifest()),first)
        self.games[0]['home_score']='25'
        with patch.object(obs,'now',return_value=NOW+dt.timedelta(hours=1)):
            second=obs.capture(self.root,self.manifest())
        self.assertNotEqual(first,second)
        self.assertNotEqual(obs.load(self.root,first)[0]['unknown'],obs.load(self.root,second)[0]['unknown'])
        self.games[0]['home_score']='nan'
        with self.assertRaisesRegex(ValueError,'score'):obs.capture(self.root,self.manifest())

    def test_required_kicking_count_is_not_imputed_to_zero(self):
        self.stats[0]['fg_short_attempts']=None
        with self.assertRaisesRegex(ValueError,'count unavailable'):obs.capture(self.root,self.manifest())
        self.assertIsNone(obs.current(self.root))

    def test_market_and_target_identity_columns_cannot_enter_receipts(self):
        self.games[0].update(spread_line=777,total_line=999,home_qb_id='SECRET_TARGET_ID')
        self.stats[0]['market_field']='SECRET_MARKET_VALUE'
        ref=obs.capture(self.root,self.manifest());_,records=obs.load(self.root,ref)
        encoded=obs.raw(records)
        for value in (b'spread_line',b'total_line',b'SECRET_TARGET_ID',b'SECRET_MARKET_VALUE'):
            self.assertNotIn(value,encoded)

    def test_wrong_hash_duplicate_pair_and_nonfinite_statistic_fail_closed(self):
        manifest=self.manifest();(self.root/manifest['schedule']['path']).write_text('[]')
        with self.assertRaisesRegex(ValueError,'hash mismatch'):obs.capture(self.root,manifest)
        self.stats[1]=copy.deepcopy(self.stats[0])
        with self.assertRaisesRegex(ValueError,'Paired'):obs.capture(self.root,self.manifest())
        _,stats=fixture();stats[0]['drives']=float('nan')
        with self.assertRaisesRegex(ValueError,'statistic'):obs.material(self.games,stats,NOW)
        self.assertFalse((self.root/obs.POINTER).exists())

    def test_batch_failure_retry_keeps_original_durable_clock(self):
        manifest=self.manifest();real=obs.store
        with patch.object(obs,'store',side_effect=OSError('disk full')):
            with self.assertRaises(OSError):obs.capture(self.root,manifest)
        self.assertIsNone(obs.current(self.root))
        with patch.object(obs,'now',return_value=NOW+dt.timedelta(hours=2)):
            ref=obs.capture(self.root,manifest)
        self.assertEqual(obs.load(self.root,ref)[1]['g1']['collected_at'],NOW.isoformat())

    def test_pointer_failure_and_lost_response_preserve_first_receipt(self):
        manifest=self.manifest();real=obs.save
        def fail(path,value,immutable=False):
            if str(path).endswith('current-ref.json'):raise OSError('pointer failure')
            return real(path,value,immutable)
        with patch.object(obs,'save',side_effect=fail),self.assertRaises(OSError):obs.capture(self.root,manifest)
        self.assertIsNone(obs.current(self.root))
        def uncertain(path,value,immutable=False):
            result=real(path,value,immutable)
            if str(path).endswith('current-ref.json'):raise OSError('lost response')
            return result
        with patch.object(obs,'save',side_effect=uncertain),self.assertRaises(OSError):obs.capture(self.root,manifest)
        committed=obs.current(self.root)
        with patch.object(obs,'now',return_value=NOW+dt.timedelta(days=1)):
            self.assertEqual(obs.capture(self.root,manifest),committed)
        self.assertEqual(obs.load(self.root)[1]['g1']['collected_at'],NOW.isoformat())

    def test_corrupt_batch_and_pending_clock_are_not_silently_repaired(self):
        manifest=self.manifest()
        with patch.object(obs,'store',side_effect=OSError('fixture')):
            with self.assertRaises(OSError):obs.capture(self.root,manifest)
        path=next((self.root/obs.BASE/'transactions').glob('*.json'));envelope=json.loads(path.read_bytes())
        envelope['body']['collected_at']='1900-01-01T00:00:00Z';path.write_bytes(obs.raw(envelope))
        with self.assertRaisesRegex(ValueError,'transaction hash'):obs.capture(self.root,manifest)

    def test_corrupt_committed_batch_fails_and_keeps_pointer(self):
        ref=obs.capture(self.root,self.manifest());snapshot,_=obs.load(self.root,ref)
        entry=snapshot['index']['g1'];path=self.root/entry['batch']['path'];path.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'object hash mismatch'):obs.capture(self.root,self.manifest())
        self.assertEqual(obs.current(self.root),ref)

    def test_cached_preparation_captures_receipts_without_changing_feature_bytes(self):
        from engine.projection import prepared
        from scripts import projection_v3_prepare as script
        for name in ('engine/projection/features.py','engine/projection_v3/personnel.py','scripts/projection_v3_sources.py'):
            target=self.root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes((script.ROOT/name).read_bytes())
        manifest=self.manifest();p=self.root/'work/projection-v1/source-manifest.json';p.write_bytes(obs.raw(manifest))
        for name,value in [('config/stadiums.json',{'stadiums':[]}),('outputs/iron-man-v1/source-manifest.json',[])]:
            p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(obs.raw(value))
        fit={'path':'fit.json','sha256':'a'*64};p=self.root/'work/in-season-learning-v1/active-fit-ref.json'
        p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(obs.raw(fit))
        rows=[{'game_id':'g1','home':h,'features':{'baseline':22.}} for h in (False,True)]
        data=gzip.compress(obs.raw(rows),mtime=0)
        prepared.commit(self.root,data,{'sha256':obs.sha(data),'fit':fit,'signature':'fixture'})
        with patch.object(script,'ROOT',self.root),patch.object(script,'read',return_value={'selected':['none',10]}),patch.object(script,'hash_value',return_value='fixture'),patch.object(script,'build',side_effect=AssertionError('cached features rebuilt')):
            self.assertEqual(script.prepare(),rows)
        actual,metadata,saved=prepared.load(self.root)
        self.assertEqual(saved,data);self.assertEqual(actual,rows)
        self.assertEqual(metadata['observation_snapshot_ref'],obs.current(self.root))

    def test_withdrawn_final_is_named_and_original_receipt_is_preserved(self):
        first=obs.capture(self.root,self.manifest());self.games[0]['home_score']=''
        second=obs.capture(self.root,self.manifest());snapshot,records=obs.load(self.root,second)
        self.assertEqual(snapshot['unknown'],[{'game_id':'g1','reason':'PREVIOUS_OBSERVATION_NOW_UNAVAILABLE'}])
        self.assertEqual(records['g1']['game']['home_score'],24.)
        self.assertEqual(obs.load(self.root,first)[1]['g1']['game']['home_score'],24.)

    def test_writer_contention_fails_without_mutation(self):
        with obs.writer(self.root),self.assertRaisesRegex(ValueError,'writer already active'):
            obs.capture(self.root,self.manifest())


if __name__=='__main__':unittest.main()
