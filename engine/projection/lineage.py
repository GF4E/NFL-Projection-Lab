"""Exact fit/calibration references, with a frozen legacy reconstruction registry.

A reconstructed legacy association is not evidence that the original issuer
stored an artifact reference. No frozen card is rewritten by this module.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath

from engine.projection.model import hash_value

ARTIFACT_FOLDERS = ('work/projection-v1', 'work/projection-v2',
                    'work/projection-v3', 'work/in-season-learning-v1')
LEGACY_REGISTRY = 'work/engine-rebuild/legacy-calibration-map.json'


def read_artifact(root, ref):
    root = Path(root).resolve()
    path = PurePosixPath(ref['path'])
    if path.is_absolute() or '..' in path.parts or str(path.parent) not in ARTIFACT_FOLDERS:
        raise ValueError('Unapproved projection artifact path')
    local = (root / str(path)).resolve()
    if not local.is_relative_to(root):
        raise ValueError('Projection artifact escapes repository')
    raw = local.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ref['sha256']:
        raise ValueError('Projection artifact hash mismatch')
    return json.loads(raw)


def bind(card, ref, artifact):
    """Bind a freshly issued card to a previously hash-verified active artifact."""
    if card['version'] != artifact['version']:
        raise ValueError('Projection version differs from active artifact')
    return {**card, 'fit_artifact_ref': dict(ref),
            'fit_sha256': hash_value(artifact['fit']),
            'calibration_ref': dict(artifact['shapes'])}


def calibration_for(card, root):
    from .bundle import verify_card
    verify_card(root, card)
    if 'fit_artifact_ref' in card or 'calibration_ref' in card:
        if not card.get('fit_artifact_ref') or not card.get('calibration_ref'):
            raise ValueError('Incomplete exact projection references')
        ref = card['fit_artifact_ref']
        artifact = read_artifact(root, ref)
        if artifact['version'] != card['version'] or hash_value(artifact['fit']) != card.get('fit_sha256'):
            raise ValueError('Projection does not match its exact fit')
        if artifact['shapes'] != card.get('calibration_ref'):
            raise ValueError('Fit and calibration references are incompatible')
        return read_artifact(root, artifact['shapes']), {
            'status': 'EXACT_ARTIFACT_REFERENCE', 'fit_artifact_ref': ref,
            'fit_sha256': card['fit_sha256'], 'calibration_ref': artifact['shapes']}

    # Legacy-only migration: no scan of mutable/current fit pointers or directory
    # order. Every candidate envelope is pinned in the adoption-time registry.
    registry = json.loads((Path(root) / LEGACY_REGISTRY).read_text())
    if registry.get('sha256') != hash_value({k:v for k,v in registry.items() if k!='sha256'}):
        raise ValueError('Legacy calibration registry hash mismatch')
    candidates = []
    for ref in registry['versions'].get(card['version'], []):
        artifact = read_artifact(root, ref)
        if artifact['version'] != card['version']:
            raise ValueError('Legacy registry version mismatch')
        body = hash_value(artifact['fit'])
        if card.get('fit_sha256') and body != card['fit_sha256']:
            continue
        candidates.append((ref, artifact, body))
    if not candidates:
        raise ValueError('Legacy exact fit evidence unavailable')
    bodies = {body for _, _, body in candidates}
    shapes = {hash_value(artifact['shapes']) for _, artifact, _ in candidates}
    if len(bodies) != 1 or len(shapes) != 1:
        raise ValueError('Ambiguous legacy fit or calibration; reconciliation required')
    shape_ref = candidates[0][1]['shapes']
    return read_artifact(root, shape_ref), {
        'status': 'LEGACY_EXACT_COMPONENTS' if card.get('fit_sha256') else 'LEGACY_UNIQUE_FIT_RECONSTRUCTION',
        'original_artifact_reference': 'NOT_RECORDED',
        'fit_sha256': candidates[0][2], 'calibration_ref': shape_ref,
        'matching_artifact_refs': [ref for ref, _, _ in candidates],
        'registry_sha256': registry['sha256']}
