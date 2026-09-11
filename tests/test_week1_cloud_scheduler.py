"""Infrastructure safety: never dispatch when ownership cannot be proved."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts import cloud_scheduler as scheduler


class CloudOwnershipTests(unittest.TestCase):
    def test_cloud_owner_excludes_mac(self):
        record = {'state': 'ACTIVE', 'owner': 'digitalocean:123'}
        self.assertTrue(scheduler.permitted(record, 'digitalocean:123'))
        self.assertFalse(scheduler.permitted(record, 'mac-fallback'))

    def test_no_implicit_expiry_or_missing_owner_takeover(self):
        for record in ({}, {'state': 'RELEASED', 'owner': 'mac-fallback'},
                       {'owner': 'mac-fallback'}, {'state': 'ACTIVE'}):
            self.assertFalse(scheduler.permitted(record, 'mac-fallback'))

    def test_yield_does_not_touch_worker_or_publication(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(scheduler, 'OUT', Path(tmp)), \
             patch.object(scheduler, 'ownership', return_value={'state': 'ACTIVE', 'owner': 'cloud'}), \
             patch.object(scheduler, 'worker') as work, patch.object(scheduler, 'publish_artifacts') as publish:
            self.assertEqual(scheduler.run('capture', 'mac-fallback')['state'], 'YIELD_TO_OWNER')
            work.assert_not_called(); publish.assert_not_called()

    def test_unreachable_remote_never_dispatches(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(scheduler, 'OUT', Path(tmp)), \
             patch.object(scheduler, 'ownership', side_effect=OSError), patch.object(scheduler, 'worker') as work:
            with self.assertRaises(OSError): scheduler.run('capture', 'cloud')
            work.assert_not_called()

    def test_publication_failure_prevents_next_worker(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(scheduler, 'OUT', Path(tmp)), \
             patch.object(scheduler, 'ownership', return_value={'state': 'ACTIVE', 'owner': 'cloud'}), \
             patch.object(scheduler, 'synchronize'), patch.object(scheduler, 'publish_artifacts', side_effect=OSError), \
             patch.object(scheduler, 'worker') as work:
            with self.assertRaises(OSError): scheduler.run('capture', 'cloud')
            work.assert_not_called()

    def test_allowed_artifact_scope(self):
        self.assertTrue(scheduler.allowed('outputs/model-pick-v1/budget.jsonl'))
        self.assertTrue(scheduler.allowed('work/model-pick-v1/daily/2026-09-11/complete.json'))
        self.assertFalse(scheduler.allowed('.env.cloud'))
        self.assertFalse(scheduler.allowed('engine/model_pick.py'))
        self.assertFalse(scheduler.allowed('work/model-pick-v1/runtime-config.json'))


if __name__ == '__main__': unittest.main()
