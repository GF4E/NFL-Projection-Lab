"""Canonical parity and crash/retry invariants of large evidence retention."""
import hashlib
import json
import math
from pathlib import Path
import random
import tempfile
import unittest
from unittest.mock import patch
from engine.projection import calibration_json as codec, storage


class CalibrationJSONTests(unittest.TestCase):
    def test_canonical_bytes_and_hash_match_existing_encoder(self):
        rng = random.Random(719)
        values = [None, [], {}, [True, False, -0., 1e-300, 1e300],
            {'é': 'escaped\n\t" Ω 😀', 'tuple': (1, 2), 'long': 'abc'*100000},
            {str(i): [rng.uniform(-1e9, 1e9), rng.randrange(-100000, 100000)] for i in range(1000)}]
        for value in values:
            raw = json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
            self.assertEqual(b''.join(codec.chunks(value)), raw)
            self.assertEqual(codec.digest(value), hashlib.sha256(raw).hexdigest())
            self.assertEqual(b''.join(codec.chunks(value, newline=True)), raw+b'\n')

    def test_invalid_numbers_never_create_a_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'record.json'
            for v in (math.nan, math.inf, -math.inf):
                with self.assertRaises(ValueError): codec.save(p, {'invalid': v})
                self.assertFalse(p.exists())

    def test_read_shares_only_immutable_values_and_preserves_data(self):
        value = {'fits': [{'training_game_ids': ['long-game-identifier']*1000} for _ in range(5)]}
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'record.json'
            codec.save(p, value)
            loaded = codec.load(p)
            self.assertEqual(loaded, value)
            a, b = loaded['fits'][:2]
            self.assertIsNot(a['training_game_ids'], b['training_game_ids'])
            self.assertIs(a['training_game_ids'][0], b['training_game_ids'][0])
            a['training_game_ids'][0] = 'changed'
            self.assertEqual(b['training_game_ids'][0], 'long-game-identifier')

    def test_immutable_retry_matches_storage_bytes_without_rewrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            p, q = Path(tmp)/'stream.json', Path(tmp)/'old.json'
            value = {'records': list(range(10000))}
            storage.save(q, value, immutable=True)
            self.assertEqual(codec.save(p, value), 'COMMITTED')
            self.assertEqual(p.read_bytes(), q.read_bytes())
            stamp = p.stat().st_mtime_ns
            self.assertEqual(codec.save(p, value), 'UNCHANGED')
            self.assertEqual(p.stat().st_mtime_ns, stamp)
            with self.assertRaisesRegex(ValueError, 'Frozen'): codec.save(p, {'different': True})
            self.assertEqual(p.read_bytes(), q.read_bytes())

    def test_multiple_files_share_strings_but_never_mutable_containers(self):
        value = {'long-non-interned-key': [{'training_game_ids': ['long-game-identifier']*3}]}
        with tempfile.TemporaryDirectory() as tmp:
            p, q = Path(tmp)/'one.json', Path(tmp)/'two.json'
            codec.save(p, value)
            codec.save(q, value)
            strings = {}
            first = codec.load(p, strings=strings)
            second = codec.load(q, strings=strings)
            self.assertEqual(first, value)
            self.assertEqual(second, value)
            self.assertIs(next(iter(first)), next(iter(second)))
            a = first['long-non-interned-key'][0]['training_game_ids']
            b = second['long-non-interned-key'][0]['training_game_ids']
            self.assertIsNot(a, b)
            self.assertIs(a[0], b[0])
            strings.clear()  # Pool is only an optimization, never authority.
            self.assertEqual(codec.digest(first), codec.digest(second))
            a[0] = 'changed'
            self.assertEqual(b, ['long-game-identifier']*3)

    def test_before_commit_crash_and_disk_full_leave_no_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'record.json'
            with patch.object(codec.os, 'fsync', side_effect=OSError('disk full')), self.assertRaises(OSError):
                codec.save(p, {'a': 1})
            self.assertFalse(p.exists())
            self.assertEqual(list(Path(tmp).iterdir()), [])
            self.assertEqual(codec.save(p, {'a': 1}), 'COMMITTED')

    def test_after_commit_sync_failure_is_recovered_by_same_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'record.json'
            with patch.object(storage, '_sync_directory', side_effect=OSError('lost sync')), self.assertRaises(OSError):
                codec.save(p, {'a': 1})
            original = p.read_bytes()
            self.assertEqual(codec.save(p, {'a': 1}), 'UNCHANGED')
            self.assertEqual(p.read_bytes(), original)
            self.assertEqual(len(list(Path(tmp).iterdir())), 1)

    def test_mutation_between_hashing_and_staging_cannot_publish(self):
        real = codec.chunks
        calls = 0
        value = {'a': 1}
        def changed(*args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 2: value['a'] = 2
            yield from real(*args, **kwargs)
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'record.json'
            with patch.object(codec, 'chunks', side_effect=changed), self.assertRaisesRegex(ValueError, 'changed during staging'):
                codec.save(p, value)
            self.assertFalse(p.exists())

    def test_nonregular_destination_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'link'
            p.symlink_to('missing')
            with self.assertRaisesRegex(ValueError, 'regular file'): codec.save(p, {})


if __name__ == '__main__': unittest.main()
