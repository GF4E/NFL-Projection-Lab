"""Fixed RF-02F pre-fit receipt verification; no historical archive loading.

The final approval is an input, never constructed here. Private validation
seams exist for synthetic fixtures only; production preflight uses fixed pins.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import re
import stat
import sys

ROOT = Path(__file__).resolve().parents[1]
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')
VERSION = 'rf02f.prefit-acceptance.v1'
PROTOCOL_PATH = '.planning/engine-os/research-first/RF-02F-HISTORICAL-PROTOCOL.v1.md'
PROTOCOL_SHA = 'd7b921cb2e9a8376b912363a5fff9f27168a2467411c45e144927c7a5d506d16'
CONFIG_PATH = 'config/research-team-score-split.v1.json'
CONFIG_SHA = '0fe90bbc966e8eb92e6d345b145fc297547b1f4b922d095a0eabbf5e97c60519'
INHERITED_CONFIG_SHA = '422b1082361a2d0d926f639c8cf67b38615517a8269a7f05729aea0c8f264615'
PARENT_MANIFEST = '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38'
PARENT_INDEX = 'ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab'
DATA_SHA = 'ea7dc1c17cc4613ada871927842d90f6d41ffe61b45e6302c3032eac7cdffc85'
RUNTIME = {'python': '3.12.2', 'numpy': '1.26.4', 'scipy': '1.13.1', 'platform': 'darwin',
           'executable': '/opt/anaconda3/bin/python3.12', 'isolated': True}
PERMISSIONS = {'one_historical_invocation': True, 'automatic_restart': False,
               'provider_requests': 0, 'production_authorized': False, 'prospective_evidence': False}
REVIEW_SCOPE = 'complete_controller_synthetic_qualification'
FROZEN_CODE_HASHES = {'scripts/research_score_compute_distribution.py': '8000026887b63eaf387ef53791bd5cb4badda944f74fdf9725eea2fcff0feaa1', 'scripts/research_score_compute_qualify.py': '41edf4cc2bc217fd0947aa2ad17e6112fd20e1aedc93b7eeb7ab0aae0ea77dcb', 'scripts/research_score_compute_run.py': '7089fc64b6464dadfddb4796059a975afe7f1fd43730420d8d8193d67104208f', 'scripts/research_score_conditional_adapter.py': 'a6987485724c7f725661927e194ca39d77b303e15d868b872d3b9449a7cc19f2', 'scripts/research_score_conditional_admission.py': 'd6043ce8c84b5689f791d21934929debaa603267a5de27d6ec1438c75ca307b8', 'scripts/research_score_conditional_inference.py': 'acaf57739ebb30f6a7a4abcb3c2673bbbd649ceca7fa3af6c435c27be9dd1604', 'scripts/research_score_conditional_margin.py': 'c1a0e334229999afe5bb000598ae0648789cc8ee0e112291b03707039015ad3d', 'scripts/research_score_conditional_policy.py': 'aa72dc1799669340f3dbec32c5b6510f673ea70bba3d27b2315c311849a4551d', 'scripts/research_score_conditional_qualify.py': 'cb0a13eb0afacb2a4ccde7826bc2288a31677853b71d061c5ccc477eca0647f6', 'scripts/research_score_conditional_replay.py': '8eae09d2b3cb7aec7a2e6fbe265679be39eea5dbf6bd327f24f75d9022f65b45', 'scripts/research_score_conditional_run.py': '2d817be3992a819f9e5c3c509dece39e3349fff8a65acdeb053426a6b826a343', 'scripts/research_score_contract.py': '9b945dd445f567e410fee76c62a1e4058c7aac42b8362b4683eea7118c90ae34', 'scripts/research_score_distribution.py': 'aaa557304054788603f29d56a11fa7e4fe98d3f32b7e699c7f9919f8d7b41ba1', 'scripts/research_score_inference.py': '4b61e0d4477eb49064353d9fd7b4e1c6ac37fc68553e0df0387d9f71bb8db078', 'scripts/research_score_metrics.py': '8afc0500345467f50d8c9dad4a33e95f55959727eb022696b5ab41fee7df7d97', 'scripts/research_score_models.py': '8b2c59c28e080c3da22ba5b8ed608faaf340292873a0c11cb319820a481fe3bd', 'scripts/research_score_replay.py': '62a5aeee637979518238c591252a3b4d5e43dcaf6fd47f69a4fe315bac79b594', 'scripts/research_score_run.py': '26e9f8a3e33ef68ed125fed2d0db4050b3e5bdda508daaabcc7e2f6a2f2764fa', 'scripts/research_score_split_archive.py': '91c9e15d674e0d192cb4ef5ddc34a05167693593f20f6d3c9dea7be382398423', 'scripts/research_score_split_budget.py': '0ee4dd5e7936a333fed6b2804f530bf310f588b811af41e3c8a5af1a335388ea', 'scripts/research_score_split_inference.py': 'ebf52e5e294d21fd37687003d808410f143679760ca771d5b01e91cd05c55c22', 'scripts/research_score_split_models.py': '1826dc343e8fb41154cd572b621a7847a9cfa6bce243b5eeb70661ae7fbb5f48', 'scripts/research_score_split_replay.py': '44411d6f12ac978344cb618d549aeaefff8880d6c5b19df384f922eb549da547', 'scripts/research_score_split_run.py': 'b71ba98cb62c78c657a02dd0a95f6d2296323b43b4425ef5a5b5597ff1efc9c7', 'scripts/research_score_successor_distribution.py': 'abf317c8a34f5e4f4043345912385a00ee99683ecfeba2ad0f83eafb54b9d974', 'scripts/research_score_successor_qualify.py': '8fa0fb3f298bfa8419d535411b5bad7002fc56de3181d839ee4d047fcd45f7d3', 'scripts/research_score_successor_run.py': 'b54c265c87a09d2ef9325363f668f3dd5a58cb49c54b82cd8286fdb61bd81459', 'tests/research-score-compute/test_cache.py': 'a8dd3bf3721a91853eba32344a9301388fa9bd90b52b3c9997fb9c76ad3843dc', 'tests/research-score-compute/test_compute_qualify.py': 'f12a8f493091c6d08ebfa6572b7a05010d02eb70e7dfaca0a96e64a0da280296', 'tests/research-score-compute/test_compute_run.py': '1c8e41eb477f3e86a2d5406dd1119b74f2c0d899c79bab2acb069fb2feb4bf76', 'tests/research-score-conditional-margin/test_adapter.py': '431326f6933504c315720c91492b38ef7fd42a2ceb182eb154658ea8d2771c99', 'tests/research-score-conditional-margin/test_admission.py': '416550a5459c6ae635db0dfbe35b27e1a51cd57501ec4c234f190c0b5c4249bb', 'tests/research-score-conditional-margin/test_conditional_margin.py': '53b18c9ee869696e13e552b9d01bdb8f79b9a1f1d4eb6973ae89420427f0809b', 'tests/research-score-conditional-margin/test_inference.py': '598d40031b1630993ff2f2aceb13a7d280dc86a5d4789e572c383d54da1ea629', 'tests/research-score-conditional-margin/test_policy.py': '64f8fea7fed97c356bbf221f5630b4fdc2ae0ada43118b85070c3a33b560b44d', 'tests/research-score-conditional-margin/test_qualify.py': 'aace76b001643345bb5eadc1bd1fc05bc6745bb64fb6b662ef33f7f131e18341', 'tests/research-score-conditional-margin/test_replay.py': '6798aec8b7141819d9168bd736e18bf7b4cad7c348d776cdd8268a0569316fb7', 'tests/research-score-conditional-margin/test_run.py': '7720f9264d167b610f12971925d416bdef0c9ea08ce4a3cfdc0b193a4562621c', 'tests/research-score-split/qualify_inference_unit.py': 'bdc7016088a8e094e1c4c023e962b0be4935065d5f63df0c9c11e1bf6ef824d3', 'tests/research-score-split/test_archive_unit.py': '510c10f77c194dcb5c9591404c5238f43f494659aa96a247db0013ffd3f2969e', 'tests/research-score-split/test_bank_unit.py': '326837b37b50c1045b9ba830359a863b48db13c01c48d4b8a782d663184c8973', 'tests/research-score-split/test_budget.py': '64cf75c26cec296bc996f37b7f1109d6f0c546ff0a9ae52452c3c9af74f46bc9', 'tests/research-score-split/test_inference_unit.py': '6678ff40c73b2d5c493cd22d6e2321f7d9edb2d6d5b0a1241c29420c33e9040d', 'tests/research-score-split/test_mean_unit.py': '622c7f2f97da6c7f49bbc050ad6d7b583cd3da474b0eeb318dcbb21be6cf3799', 'tests/research-score-split/test_run_unit.py': 'a96576b22bd4c55ed8adf34d49ad78ee783605fe75a3f2f263f17a8c092bd42c', 'tests/research-score-successor/test_qualify.py': '9eaac19131c06877d9010b48a37315c0dc52d10639aa67faf331ecc1df633c23', 'tests/research-score-successor/test_solver.py': '0283d8c2e4d10b34e7552c5750a565e72b9a03b30ca658996089a4a966e5cfc2', 'tests/research-score-successor/test_successor_run.py': 'a53ca0c80ec71f00e453599a7218d179d6dc5442ba6e407d726a24f608627755', 'tests/research-score/test_contract.py': '64157ed50c999e3ecba3b84b0da20afd88074544e957e16d3470d264a60b8bf2', 'tests/research-score/test_distribution.py': 'b671c6a4b97757a8122a54b98491a4ca79952cceb78a2985c685a9d630f7fc14', 'tests/research-score/test_inference.py': '367bcb3e9bf989bae2c9773e82a0b6701b5a8c36bf9347026e3f3dca0f6d293a', 'tests/research-score/test_invariance.py': 'e192da8539080a0be836ded37a802403bc5d171c148a3edd357db978ad98f50c', 'tests/research-score/test_mean_models.py': 'fd625bdc03d53e725539ed9517d0c1a5fa5f5caf6fbb331ee3ab2627ffa9a8e7', 'tests/research-score/test_metrics.py': '3bd12882c193abe4eb716ddd4fc0b7871fa104a27e526c7187f27c9b44760f91', 'tests/research-score/test_replay.py': 'ce21d82a17e3878a6ce80095faf5c267d51751df78318b10504d46a86e0a44b9', 'tests/research-score/test_run.py': '1b8fe02cc57bdfb95f190c03a49eb16669c3c5aab79f61c383d7e08d778ad58e'}

STAGES = {'protocol': {'path': '.planning/engine-os/research-first/RF-02F-PROTOCOL-ACCEPTANCE.v1.json', 'sha256': 'c55f4e651bb9726402ac310b3bc06b2337cd58523aaa0e2ee7496fb847fc554b', 'status': 'accepted_design_for_implementation_and_synthetic_qualification_only'}, 'mean': {'path': '.planning/engine-os/research-first/RF-02F-MEAN-UNIT-ACCEPTANCE.v1.json', 'sha256': '61c448d59a30be43ccc15faf447d78f3be9e420cc83baf6a991aa5e3fa61101a', 'status': 'accepted_pure_synthetic_mean_unit_only'}, 'bank': {'path': '.planning/engine-os/research-first/RF-02F-BANK-UNIT-ACCEPTANCE.v1.json', 'sha256': 'c4f252cd9bc053df019308cfebf5d70f0ca0287ee38bae7cdf2738033f978268', 'status': 'accepted_pure_synthetic_bank_and_selection_only'}, 'budget': {'path': '.planning/engine-os/research-first/RF-02F-BUDGET-UNIT-ACCEPTANCE.v1.json', 'sha256': '3481ef013b073714038b60aef8cc5055bf11331d7412b87f61b46ada0c7c6b5b', 'status': 'accepted_pure_synthetic_cost_formula_only'}, 'inference': {'path': '.planning/engine-os/research-first/RF-02F-INFERENCE-UNIT-ACCEPTANCE.v1.json', 'sha256': 'd56e355af3fff1cedb5fc3f2a30ae6ba1cd1f0616a817a801b46cbbb14c83db6', 'status': 'accepted_full_synthetic_inference_integration_only'}, 'archive': {'path': '.planning/engine-os/research-first/RF-02F-ARCHIVE-UNIT-ACCEPTANCE.v1.json', 'sha256': 'f0d96c36b181534260363a0b8365e488d9950f813a5a0354e606a81a7db4a28d', 'status': 'accepted_synthetic_archive_forecast_grader_and_selector_boundaries_only'}, 'runtime': {'path': '.planning/engine-os/research-first/RF-02F-RUNTIME-UNIT-ACCEPTANCE.v1.json', 'sha256': '0720c240a36c3ed32a72d1113560997417b05a12c8cec8b06a3c4c8a5b0e1ca9', 'status': 'accepted_synthetic_runtime_accounting_and_atomic_boundary_prerequisite_only'}}
CANDIDATE_FILES = tuple(p for suffix in ('forecast', 'watchdog', 'controller', 'grade', 'preflight') for p in ('scripts/research_score_split_' + suffix + '.py', 'tests/research-score-split/test_' + suffix + '_unit.py'))
CODE_FILES = tuple(sorted(set(FROZEN_CODE_HASHES) | set(CANDIDATE_FILES)))


STAGES['watchdog'] = {'path': '.planning/engine-os/research-first/RF-02F-WATCHDOG-UNIT-ACCEPTANCE.v1.json', 'sha256': '514b4a6fb6c1cd33e1c6222c45c2e158c7b370775db3d870f349c9ecc450e7c8', 'status': 'accepted_synthetic_watchdog_unit_only'}
FROZEN_CODE_HASHES['scripts/research_score_split_watchdog.py'] = '57b2d3d9da4751d67818889e5ae8ae0242412de9cf55f0dee6e3dbdbf3ac63f7'
FROZEN_CODE_HASHES['tests/research-score-split/test_watchdog_unit.py'] = '1cb98cd59db38847b7ddf3c0440e17f5e20cd9ffcd947b7aec5386a6f2ed5024'
STAGES['forecast'] = {'path': '.planning/engine-os/research-first/RF-02F-FORECAST-UNIT-ACCEPTANCE.v1.json', 'sha256': 'cf86de2cd0ffd377503f8b650b56b3dfb6ede9d5b44a356a3281942cdd25c4cb', 'status': 'accepted_synthetic_forecast_unit_only'}
FROZEN_CODE_HASHES['scripts/research_score_split_forecast.py'] = '472d37e25dbf3b8a7ae092e0d86100114064730d0215ae934a2f7ecb14acdb34'
FROZEN_CODE_HASHES['tests/research-score-split/test_forecast_unit.py'] = '1e74451a9c7dd0043e1725f97e634d96f41cc5fee88229eb0b0f69a4a23e0312'
CANDIDATE_FILES = tuple(p for p in CANDIDATE_FILES if p not in FROZEN_CODE_HASHES)


def require(value, reason):
    if not value:
        raise ValueError(reason)


def encoded(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def parse(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, 'duplicate_json_key')
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=pairs,
                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite_json')))
    encoded(value)
    return value


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def _sha(value):
    require(type(value) is str and re.fullmatch('[0-9a-f]{64}', value), 'invalid_sha256')


def _relative(name):
    require(type(name) is str and name and not Path(name).is_absolute()
            and '..' not in Path(name).parts and str(Path(name)) == name,
            'unsafe_relative_source_path')


def _file(path, check, *, expected_sha=None, expected_bytes=None):
    path = Path(path)
    require(path.is_absolute() and '..' not in path.parts, 'absolute_evidence_path_required')
    # Reject parent symlinks too; exact approved bytes must not hide a path swap.
    require(not any(p.is_symlink() for p in (path, *path.parents)), 'symlink_evidence_path')
    check()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as source:
        require(stat.S_ISREG(os.fstat(source.fileno()).st_mode), 'regular_evidence_file_required')
        chunks = []
        while True:
            check()
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
    raw = b''.join(chunks)
    if expected_sha is not None:
        _sha(expected_sha)
        require(digest(raw) == expected_sha, 'bound_file_hash_mismatch:' + str(path))
    if expected_bytes is not None:
        require(type(expected_bytes) is int and expected_bytes >= 0 and len(raw) == expected_bytes,
                'bound_file_size_mismatch')
    check()
    return raw


def _pointer(pointer, root, check, *, read=_file):
    require(type(pointer) is dict and set(pointer) == {'path', 'sha256', 'bytes'}, 'exact_evidence_pointer_required')
    name = pointer['path']
    require(type(name) is str and name and '..' not in Path(name).parts, 'unsafe_evidence_path')
    path = Path(name)
    if not path.is_absolute():
        _relative(name)
        path = root / path
    require(path.is_relative_to(root) or path.is_relative_to(WORK), 'evidence_outside_approved_roots')
    return read(path, check, expected_sha=pointer['sha256'], expected_bytes=pointer['bytes'])


def _stage_evidence(value, root, check, *, read=_file):
    """Authenticate pointers actually embedded in each frozen stage receipt.

    Historical admitted-data files are left to archive.admit_source. Stage
    receipts here contain source/qualification/audit pointers, not that archive.
    """
    if type(value) is dict:
        if 'path' in value and 'sha256' in value:
            pointer = {k: value[k] for k in ('path', 'sha256')}
            if 'bytes' in value:
                pointer['bytes'] = value['bytes']
                _pointer(pointer, root, check, read=read)
            else:
                name = pointer['path']
                require(type(name) is str and '..' not in Path(name).parts, 'unsafe_stage_path')
                path = Path(name) if Path(name).is_absolute() else root / name
                require(path.is_relative_to(root) or path.is_relative_to(WORK), 'stage_outside_approved_roots')
                read(path, check, expected_sha=pointer['sha256'])
        for child in value.values():
            _stage_evidence(child, root, check, read=read)
    elif type(value) is list:
        for child in value:
            _stage_evidence(child, root, check, read=read)


def actual_runtime():
    import numpy
    import scipy
    return {'python': platform.python_version(), 'numpy': numpy.__version__, 'scipy': scipy.__version__,
            'platform': sys.platform, 'executable': sys.executable, 'isolated': bool(sys.flags.isolated)}


def _evidence_result(value, code_hashes, runtime, protocol_sha, config_sha, *, role=None, qualification_sha=None):
    required = {'version', 'status', 'scope', 'code_hashes', 'protocol_sha256', 'config_sha256',
                'runtime', 'historical_execution', 'tests', 'evidence'}
    require(type(value) is dict and required <= set(value), 'qualification_or_review_binding_fields')
    require(value['version'] == ('rf02f.controller-qualification.v1' if role is None else 'rf02f.controller-review.v1')
            and value['status'] == ('passed' if role is None else 'accepted')
            and value['scope'] == REVIEW_SCOPE and value['code_hashes'] == code_hashes
            and value['protocol_sha256'] == protocol_sha and value['config_sha256'] == config_sha
            and encoded(value['runtime']) == encoded(runtime) and value['historical_execution'] is False,
            'qualification_or_review_not_accepted_for_exact_candidate')
    tests = value['tests']
    require(type(tests) is dict and set(tests) == {'run', 'passed'}
            and type(tests['run']) is int and type(tests['passed']) is int
            and tests['run'] > 0 and tests['run'] == tests['passed'], 'complete_positive_test_counts_required')
    require(type(value['evidence']) is list and value['evidence'], 'actual_evidence_pointers_required')
    if role is not None:
        require(value.get('role') == role and value.get('qualification_sha256') == qualification_sha
                and value.get('blockers') == [] and type(value.get('findings')) is list,
                'independent_review_role_or_qualification_mismatch')


def _validate(root, acceptance, acceptance_sha, runtime, check, *, read, frozen, candidates, stages,
              protocol_sha=PROTOCOL_SHA, config_sha=CONFIG_SHA):
    """Explicit synthetic seam. Production passes only the constants below."""
    require(type(acceptance) is dict and set(acceptance) == {'version', 'status', 'code_hashes', 'protocol',
            'config', 'stage_acceptances', 'qualification', 'independent_reviews', 'runtime', 'permissions'},
            'exact_final_acceptance_schema_required')
    require(acceptance['version'] == VERSION and acceptance['status'] == 'accepted_for_one_historical_invocation',
            'final_prefit_acceptance_required')
    require(encoded(acceptance['permissions']) == encoded(PERMISSIONS), 'fixed_permissions_required')
    require(encoded(runtime) == encoded(RUNTIME) and encoded(acceptance['runtime']) == encoded(runtime),
            'unqualified_runtime')
    code = acceptance['code_hashes']
    require(type(code) is dict and set(code) == set(frozen) | set(candidates), 'exact_source_membership_required')
    for name, fingerprint in code.items():
        _relative(name); _sha(fingerprint)
        require(name not in frozen or fingerprint == frozen[name], 'frozen_source_pin_changed')
        read(root / name, check, expected_sha=fingerprint)
    require(acceptance['protocol']['path'] == PROTOCOL_PATH and acceptance['protocol']['sha256'] == protocol_sha
            and acceptance['config']['path'] == CONFIG_PATH and acceptance['config']['sha256'] == config_sha,
            'fixed_protocol_configuration_required')
    _pointer(acceptance['protocol'], root, check, read=read)
    config = parse(_pointer(acceptance['config'], root, check, read=read))
    require(config['protocol'] == {'path': PROTOCOL_PATH, 'sha256': protocol_sha}
            and config['inheritedConfig'] == {'path': 'config/research-team-score.v2.json', 'sha256': INHERITED_CONFIG_SHA}
            and config['parent'] == {'manifestSha256': PARENT_MANIFEST, 'indexSha256': PARENT_INDEX,
                                     'admittedDataSha256': DATA_SHA}, 'inherited_scientific_binding_mismatch')
    read(root / config['inheritedConfig']['path'], check, expected_sha=INHERITED_CONFIG_SHA)
    require(type(acceptance['stage_acceptances']) is dict and set(acceptance['stage_acceptances']) == set(stages),
            'exact_stage_membership_required')
    for name, expected in stages.items():
        require(expected['sha256'] is not None, 'stage_acceptance_pin_not_frozen:' + name)
        pointer = acceptance['stage_acceptances'][name]
        require(pointer['path'] == expected['path'] and pointer['sha256'] == expected['sha256'], 'fixed_stage_acceptance_mismatch')
        stage = parse(_pointer(pointer, root, check, read=read))
        require(stage['status'] == expected['status'], 'stage_status_mismatch')
        _stage_evidence(stage, root, check, read=read)
    qualification = parse(_pointer(acceptance['qualification'], root, check, read=read))
    _evidence_result(qualification, code, runtime, protocol_sha, config_sha)
    require(type(acceptance['independent_reviews']) is dict
            and set(acceptance['independent_reviews']) == {'numerical', 'temporal'}, 'distinct_reviews_required')
    identities = [acceptance['qualification']['path']]
    for role, pointer in acceptance['independent_reviews'].items():
        identities.append(pointer['path'])
        review = parse(_pointer(pointer, root, check, read=read))
        _evidence_result(review, code, runtime, protocol_sha, config_sha, role=role,
                         qualification_sha=acceptance['qualification']['sha256'])
        for evidence in review['evidence']:
            _pointer(evidence, root, check, read=read)
    require(len(set(identities)) == 3, 'qualification_and_reviews_must_be_distinct')
    for evidence in qualification['evidence']:
        _pointer(evidence, root, check, read=read)
    check()
    manifest = {'version': 'rf02f.team-score.v1', 'implementation_acceptance_sha256': acceptance_sha,
                'code_hashes': dict(code), 'stage_acceptances': acceptance['stage_acceptances'],
                'qualification': acceptance['qualification'], 'independent_reviews': acceptance['independent_reviews'],
                'bound_hashes': {'config': config_sha, 'protocol': protocol_sha, 'admittedData': DATA_SHA,
                                 'inheritedConfig': INHERITED_CONFIG_SHA},
                'parent_manifest_sha256': PARENT_MANIFEST, 'parent_index_sha256': PARENT_INDEX,
                'runtime': runtime, 'budget': {'seconds': 7200, 'rss_mib': 4096, 'complete_smoke_seconds': 120,
                                             'invalid_metadata_seconds': 30, 'external_worker_grace_seconds': 0},
                'scientific_registry': {key: config[key] for key in ('settingsInTieOrder', 'variantsInOrder',
                        'seriesInOrder', 'energyComparisonsInOrder', 'calibrationCellsInOrder')},
                'historical_status': 'retrospective_inferred', 'production_authorized': False,
                'prospective_evidence': False, 'provider_requests': 0, 'automatic_restart': False,
                'actual_result_acceptance': 'pending_independent_terminal_audits'}
    fingerprint = digest(encoded(manifest))
    return {'config': config, 'manifest': manifest, 'manifest_sha256': fingerprint,
            'identity': 'rf02f-v1-' + fingerprint[:16], 'acceptance': acceptance}


def preflight(root, acceptance_path, acceptance_sha256, budget_check):
    """Validate one supplied final receipt, never construct an approval or load history."""
    require(callable(budget_check), 'shared_budget_check_required')
    budget_check()
    require(Path(root) == ROOT and Path(root).resolve() == ROOT, 'fixed_repository_required')
    _sha(acceptance_sha256)
    path = Path(acceptance_path)
    require(path.is_absolute() and (path.is_relative_to(ROOT) or path.is_relative_to(WORK)), 'approved_acceptance_path_required')
    acceptance = parse(_file(path, budget_check, expected_sha=acceptance_sha256))
    return _validate(ROOT, acceptance, acceptance_sha256, actual_runtime(), budget_check, read=_file,
                     frozen=FROZEN_CODE_HASHES, candidates=CANDIDATE_FILES, stages=STAGES)
