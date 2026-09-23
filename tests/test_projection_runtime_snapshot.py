import copy
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from engine.projection import runtime_snapshot as rs


class RuntimeSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.source = self.base / 'runtime'
        (self.source / 'bin').mkdir(parents=True)
        self.exe = self.source / 'bin/python'
        self.exe.write_bytes(b'captured interpreter fixture')
        self.exe.chmod(0o751)
        os.utime(self.exe, ns=(1600000000000000000, 1600000000000000000))
        (self.source / 'relative').symlink_to('bin/python')
        (self.source / 'absolute').symlink_to(self.exe)
        self.snapshot = self.base / 'snapshot'
        self.destination = self.base / 'restored'

    def test_exact_roundtrip_with_absolute_prefix_links(self):
        receipt = rs.capture(self.source, self.snapshot)
        self.assertEqual(receipt['symlinks'], 2)
        restored = rs.restore(self.snapshot, self.destination)
        self.assertEqual(restored['file_bytes'], len(self.exe.read_bytes()))
        self.assertEqual(rs.inventory(self.source), rs.inventory(self.destination, origin_prefix=self.source))
        self.assertEqual(os.readlink(self.destination/'absolute'), str(self.exe))

    def test_corrupt_bytes_and_metadata_reject_before_restore(self):
        rs.capture(self.source, self.snapshot)
        target = self.snapshot/'tree/bin/python'
        original = target.read_bytes()
        target.write_bytes(b'corruption')
        with self.assertRaisesRegex(ValueError, 'differ'): rs.restore(self.snapshot, self.destination)
        self.assertFalse(self.destination.exists())
        target.write_bytes(original)
        target.chmod(0o700)
        with self.assertRaisesRegex(ValueError, 'differ'): rs.restore(self.snapshot, self.destination)

    def test_interrupted_copy_has_no_acceptance(self):
        def interrupted(source, destination, manifest):
            Path(destination).mkdir()
            (Path(destination)/'partial').write_text('partial')
            raise OSError('injected interruption')
        with patch.object(rs, 'copy_exact', interrupted):
            with self.assertRaises(OSError): rs.capture(self.source, self.snapshot)
        self.assertTrue((self.snapshot/'intent.json').exists())
        self.assertFalse((self.snapshot/'accepted.json').exists())
        with self.assertRaises(FileNotFoundError): rs.restore(self.snapshot, self.destination)

    def test_source_mutation_prevents_acceptance(self):
        real_copy = rs.copy_exact
        def mutate(source, destination, manifest):
            result = real_copy(source, destination, manifest)
            self.exe.write_bytes(b'changed after copy')
            return result
        with patch.object(rs, 'copy_exact', mutate):
            with self.assertRaisesRegex(ValueError, 'differ'): rs.capture(self.source, self.snapshot)
        self.assertFalse((self.snapshot/'accepted.json').exists())

    def test_occupied_destinations_preserved(self):
        rs.capture(self.source, self.snapshot)
        with self.assertRaises(ValueError): rs.capture(self.source, self.snapshot)
        self.destination.mkdir()
        sentinel = self.destination/'owned'
        sentinel.write_text('keep')
        with self.assertRaises(ValueError): rs.restore(self.snapshot, self.destination)
        self.assertEqual(sentinel.read_text(), 'keep')

    def test_external_links_and_unsafe_ancestors_rejected(self):
        (self.source/'escape').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(ValueError, 'External'): rs.capture(self.source, self.snapshot)
        (self.source/'escape').unlink()
        manifest = {'schema':rs.SCHEMA, 'source_prefix':str(self.source), 'entries':rs.inventory(self.source)}
        manifest['entries']['relative/child'] = copy.deepcopy(manifest['entries']['bin/python'])
        with self.assertRaisesRegex(ValueError, 'ancestor'): rs.validate_manifest(manifest)

    def test_nested_destinations_rejected(self):
        with self.assertRaises(ValueError): rs.capture(self.source, self.source/'nested')
        rs.capture(self.source, self.snapshot)
        with self.assertRaises(ValueError): rs.restore(self.snapshot, self.snapshot/'nested')

    def test_manifest_tampering_rejected(self):
        rs.capture(self.source, self.snapshot)
        with (self.snapshot/'intent.json').open('ab') as stream: stream.write(b' ')
        with self.assertRaisesRegex(ValueError, 'hash'): rs.restore(self.snapshot, self.destination)

if __name__ == '__main__': unittest.main()
