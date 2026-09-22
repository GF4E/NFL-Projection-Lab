"""A real Git commit must include the receipt graph referenced by preparation."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from engine.projection import observations as obs, cutoff_worker, cutoff_state,cutoff_pipeline
from scripts import cloud_scheduler
from test_projection_observations import fixture, NOW


class ObservationPublicationTests(unittest.TestCase):
    def test_scheduler_commits_complete_prepared_observation_graph(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            def git(*args):return subprocess.check_output(['git','-C',str(root),*args],stderr=subprocess.PIPE)
            git('init','-b','engine-v2');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid')
            (root/'README.md').write_text('fixture\n');git('add','README.md');git('commit','-m','fixture')
            remote={'head':git('rev-parse','HEAD').decode().strip()}
            games,stats=fixture();manifest={}
            for key,name,rows in [('schedule','schedule',games),('team_games','team-games',stats)]:
                data=obs.raw(rows);digest=obs.sha(data);path=root/f'work/projection-v1/data/{name}-{digest}.json'
                path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
                manifest[key]={'path':str(path.relative_to(root)),'sha256':digest}
            with patch.object(obs,'now',return_value=NOW):ref=obs.capture(root,manifest)
            with patch.object(cutoff_pipeline,'now',return_value=NOW):
                schedule_ref=cutoff_pipeline.capture_schedule(root,manifest['schedule'])
            p=root/'work/projection-v3/current-ref.json';p.parent.mkdir(parents=True,exist_ok=True)
            p.write_bytes(obs.raw({'observation_snapshot_ref':ref}))
            fit_data=obs.raw({'groups':['calibration','elo'],'selected':['none',10],'elo_hfa':{'2026':65.}})
            fit={'path':'work/in-season-learning-v1/fixture.json','sha256':obs.sha(fit_data)}
            fp=root/fit['path'];fp.parent.mkdir(parents=True,exist_ok=True);fp.write_bytes(fit_data)
            with patch.object(cutoff_worker,'now',return_value=NOW):config=cutoff_worker.configure(root,'fixture',fit)
            from engine.forecast_system.calendar import timestamp
            cutoff=timestamp(config['first_cutoff'])
            with patch.object(cutoff_worker,'now',return_value=cutoff),patch.object(cutoff_state,'now',return_value=cutoff):
                self.assertEqual(cutoff_worker.run_due(root,'fixture')['state'],'COMMITTED')
            def transport(*args):
                if args[0]=='ls-remote':return (remote['head']+'\trefs/heads/engine-v2\n').encode()
                if args[0]=='push':remote['head']=git('rev-parse','HEAD').decode().strip();return b''
                return git(*args)
            with patch.object(cloud_scheduler,'ROOT',root),patch.object(cloud_scheduler,'git',side_effect=transport),patch.object(cloud_scheduler,'guard'),patch('scripts.board_v8_market_publish.run'):
                committed=cloud_scheduler.publish_artifacts()
            self.assertEqual(committed,remote['head'])
            required=[p for prefix in (obs.BASE,cutoff_state.BASE,cutoff_pipeline.BASE,'work/projection-v1/data','work/in-season-learning-v1') for p in (root/prefix).rglob('*') if p.is_file()]
            self.assertGreaterEqual(len(required),6)
            for p in required:self.assertEqual(git('show','HEAD:'+str(p.relative_to(root))),p.read_bytes())
            current=json.loads(git('show','HEAD:work/projection-v3/current-ref.json'))
            self.assertEqual(current['observation_snapshot_ref'],ref)


if __name__=='__main__':unittest.main()
