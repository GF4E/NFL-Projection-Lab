"""Content-addressed banks for one unchanged logical calibration result.

The logical numerical SHA256 remains unchanged. This versioned storage envelope
keeps each JSON read/commit below the size of the entire donor history bundle.
Legacy inline results remain readable and are never rewritten in a new format.
"""
from pathlib import Path
import re
from . import calibration_json as codec

SCHEMA = 'calibration-result-storage-v1'
INLINE = 'calibration-numerics-v1'


def bank_path(root, result_path, key):
    if not isinstance(key, str) or not re.fullmatch('[0-9a-f]{64}', key):
        raise ValueError('Invalid calibration bank identity')
    root = Path(root).resolve()
    result_path = Path(result_path).resolve()
    folder = result_path.parent.parent.parent/'banks'
    p = folder/(key+'.json')
    if not p.resolve().is_relative_to(root) or p.is_symlink():
        raise ValueError('Calibration bank outside retained repository')
    return p


def reference(root, path):
    return {'path': str(path.relative_to(Path(root).resolve())), 'sha256': codec.file_digest(path)}


def check_bank(key, bank):
    if bank.get('sha256') != key or codec.digest({k: v for k, v in bank.items() if k != 'sha256'}) != key:
        raise ValueError('Calibration bank content differs')


def encode(root, result_path, value):
    """Banks become durable before the caller commits its result manifest."""
    if value.get('schema') != INLINE:
        raise ValueError('Expected complete numerical calibration result')
    result_path = Path(result_path)
    if result_path.exists():
        old = codec.load(result_path)
        if old.get('schema') == INLINE:
            return value  # Exact immutable retry of a historical inline result.
        if old.get('schema') != SCHEMA:
            raise ValueError('Unknown retained calibration representation')
        del old
    refs = {}
    for key, bank in sorted(value['banks'].items()):
        check_bank(key, bank)
        p = bank_path(root, result_path, key)
        codec.save(p, bank, immutable=True)
        refs[key] = reference(root, p)
    return {'schema': SCHEMA, 'numerical_result': {k: v for k, v in value.items() if k != 'banks'},
            'bank_refs': refs}


def load(root, result_path):
    # Forty banks can repeat the same training-game identities many times.
    # One bounded-lifetime pool retains each equal string once while preserving
    # independent mutable containers and the complete logical result.
    strings = {}
    value = codec.load(result_path, strings=strings)
    if value.get('schema') == INLINE:
        return value
    if set(value) != {'schema', 'numerical_result', 'bank_refs'} or value['schema'] != SCHEMA:
        raise ValueError('Unknown retained calibration representation')
    numerical = value['numerical_result']
    if numerical.get('schema') != INLINE or 'banks' in numerical or not value['bank_refs']:
        raise ValueError('Incomplete numerical calibration representation')
    banks = {}
    for key, ref in sorted(value['bank_refs'].items()):
        path = bank_path(root, result_path, key)
        if ref != reference(root, path):
            raise ValueError('Retained calibration bank reference differs')
        bank = codec.load(path, strings=strings)
        check_bank(key, bank)
        if ref != reference(root, path):
            raise ValueError('Retained calibration bank changed during read')
        banks[key] = bank
    return {**numerical, 'banks': banks}
