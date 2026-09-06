"""COMP08 retained-data arithmetic/byte audit; no project imports or reruns."""
from pathlib import Path
import ast
from collections import Counter
import copy
import hashlib
import json
import math
import struct

W=Path(__file__).resolve().parent; A=W/'attempt-ffddd8298f0adcfc'
R=Path('/private/tmp/os01-gen15-rebuild.9ny71k')
def raw(path): return Path(path).read_bytes()
def sha(value): return hashlib.sha256(value).hexdigest()
def js(path): return json.loads(raw(path),parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
def enc(value): return (json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def pointer(path): return {'path':str(path),'sha256':sha(raw(path)),'bytes':len(raw(path))}

Q=W/'qualification.v1.json'
assert sha(raw(Q))=='300f5c7bcfb343e4273ba3e31e94d7fd0237b995fb0506ff0f9c131cbfd1c763'
q=js(Q); pins=js(A/'INPUT-PINS.json')
assert sha(raw(A/'INPUT-PINS.json'))=='ffddd8298f0adcfcd9f4bba5e288b99bb8fb292271a46a79ae55a147c7ccfa0c'
assert pins==js(A/'source-map-before.json')==js(A/'source-map-after.json')
index={p['path']:p for p in js(A/'qualification-artifacts.json')['files']}
used=('numerical-observations.json','unit-tests.json','process.log','process.json','cli-probes.json','controller-test-evidence.json')
for name in used:
    assert pointer(A/name)==index[str(A/name)]
assert len(pins['code_hashes'])==85 and len(pins['runtime_files'])==7
for name,h in pins['code_hashes'].items():
    assert sha(raw(R/name))==h and raw(A/'source-snapshots'/h)==raw(R/name)
for name,h in pins['runtime_files'].items(): assert sha(raw(name))==h
baseline=js(R/'.planning/engine-os/research-first/RF-COMP-04-PREFIT-ACCEPTANCE.v1.json')
assert len(baseline['code_hashes'])==79
assert all(pins['code_hashes'][k]==v for k,v in baseline['code_hashes'].items())
assert pins['runtime_files']==baseline['runtime_files'] and pins['runtime']==baseline['runtime']
for key in ('code_hashes','runtime_files','runtime','protocol_sha256','config_sha256',
            'compute_protocol_sha256','resource_protocol_sha256','resource_policy_sha256'):
    assert q[key]==pins[key]
assert q['tests']=={'run':23,'passed':23}
tests=js(A/'unit-tests.json');assert tests['tests_run']==21 and tests['success'] and not any(tests[k] for k in ('errors','failures','skipped'))
assert raw(A/'process.log').count(b' ... ok\n')==21
process=js(A/'process.json');assert process['exit_code']==0 and process['stop'] is None and process['source_error'] is None
assert process['wall_seconds']<600 and process['conservative_combined_rss_mib']<2048
commit=js(A/'qualification-commit.json');assert commit['within_600_seconds'] and commit['elapsed_seconds']<600
rows=js(A/'numerical-observations.json');assert len(rows)==47
counts=Counter(row['kind'] for row in rows)

pairs=[r for r in rows if r['kind']=='real_science_pair'];assert len(pairs)==2
assert [r['route']for r in pairs]==['COMP04','COMP08']
assert [r['deadline_seconds']for r in pairs]==[7200.,9000.]
assert all(sha(enc(r['science']))==r['sha256']=='cc9bd72c9cb9da3302c49e1d1d84ce4f3a7dfbdc5532532b0e0fedc8a666f411'for r in pairs)
assert enc(pairs[0]['science'])==enc(pairs[1]['science'])
s=pairs[0]['science']
assert s['counts']=={'inner_rows':54,'outer_rows':38,'copied_diagonal_inner':18,'scored_inner':36,
    'copied_e3_outer':22,'scored_outer':4,'copied_raw_outer':12,'actual_score_calls':40,'actual_mass_cdf_calls':208}
assert len(s['laws'])==62 and len(s['inner_rows'])==54 and len(s['outer_rows'])==38
arrays=0
def flat(value):
    if type(value)is list:
        for v in value: yield from flat(v)
    else: yield value
for pair in pairs:
    for law in pair['science']['laws']:
        for name in ('atoms','alpha','rates','theta'):
            a=law['fields'][name];v=list(flat(a['values']))
            assert a['dtype']=='<f8' and a['writeable'] is False
            assert len(v)==math.prod(a['shape']) and struct.pack('<'+'d'*len(v),*v).hex()==a['c_bytes_hex'];arrays+=1
        b=law['fields']['beta'];assert struct.pack('>d',b['value']).hex()==b['float_bits']
    for stage,number in (('inner',28),('outer',104)):
        for row in pair['science'][stage+'_rows']:
            metrics=row['metrics'];assert len(metrics)==number+(4 if stage=='outer' and row['family']=='E3' else 0)
            assert all(name=='grid_cells' or type(value)in(int,float) and math.isfinite(value)for name,value in metrics.items())
    seen_inner=set()
    for row in pair['science']['provenance']['rows']:
        if row['score_flags'] is not None:
            double=row['stage']=='outer' or row['key'][1] not in seen_inner
            assert row['score_flags']=={'diagnostics':row['stage']=='outer','double_grid':double}
            if row['stage']=='inner':seen_inner.add(row['key'][1])
        else: assert row['source_loss'] is not None

# Match the new pair to the already accepted identical synthetic case.
old_obs_path=Path(baseline['qualification']['path']).parent/'numerical-observations.json'
old_pin=pins['inputs'][str(old_obs_path)]
assert sha(raw(old_obs_path))==old_pin['sha256'] and len(raw(old_obs_path))==old_pin['bytes']
old=[r for r in js(old_obs_path) if r.get('route')=='composed' and r.get('year')==2013
     and r.get('selected')==0 and r.get('injected_fit_failure')is None]
assert len(old)==1
for key in ('assembly','counts','inner_rows','outer_rows','provenance'):
    assert enc(s[key])==enc(old[0][key])
assert enc(s['laws'])==enc(old[0]['resolved_laws'])

pilots=[r for r in rows if r['kind']=='pilot_pair']
assert [r['requested_projection']for r in pilots]==[7199.,7200.,8000.,9000.,9000.000000000002]
for row in pilots:
    old,new=row['original'],row['resource'];target=row['requested_projection']
    assert old['projected_total_seconds']==new['projected_total_seconds']==target
    assert old['within_time_screen']==old['passed']==(target<=7200)
    assert new=={**old,'within_time_screen':target<=9000,'passed':target<=9000}
    p=new['pilot'];assert [(x['season'],x['week'],x['games'])for x in p]==[(2013,1,16),(2013,2,16)]
    fits=[c for x in p for c in x['fit_calls']];scores=[c for x in p for c in x['score_calls']]
    f=max(c['seconds']for c in fits);ss=max(c['seconds']for c in scores)
    c=max((x['seconds']-math.fsum(y['seconds']for y in x['fit_calls']+x['score_calls']))/x['games']for x in p)
    assert f==new['maximum_fit_seconds']==1/1024 and ss==new['maximum_score_seconds']==1/2048
    assert c==new['maximum_remainder_seconds_per_game']
    assert new['remaining_origins']==224 and new['remaining_games']==new['remaining_weighted_games']==3375
    assert new['fit_slots_per_future_game']==new['score_slots_per_future_game']==31 and new['callback_maximum_multiplier']==2
    value=new['elapsed_seconds']+new['remaining_weighted_games']*(c+31*(2*f+2*ss))+2*new['public_evaluator_seconds']+max(60.,new['admission_seconds'])
    assert value==target and new['failed_callback_count']==2
    assert new['callback_totals']=={'fit':math.fsum(x['seconds']for x in fits),'score':math.fsum(x['seconds']for x in scores)}
    assert new['required_anchor_indices']=={'offdiagonal_full_fit':[0,4],'new_full_outer_score':[3,7]}
for row in rows:
    kind=row['kind']
    if kind=='invalid_pilot_pair': assert len(row['errors'])==2 and row['errors'][0]==row['errors'][1]
    elif kind=='rss_projection':assert row['result']['within_time_screen'] and row['result']['passed']==(row['rss']<=4096)
    elif kind=='parent_start_deadline':assert row['observed_elapsed']==9025 and row['scientific_stop']==9000
    elif kind=='initial_deadline':assert row['deadline']==row['elapsed']==9000
    elif kind=='expired_grace':assert row['scientific_stop']==9000 and row['finalized']is False
    elif kind=='earliest_complete_smoke':assert row['elapsed']==120
    elif kind=='smoke_failed_callback':assert row['measurements'][0]['seconds']==121 and row['measurements'][0]['error_type']=='RuntimeStop'
    elif kind=='post_callback_stop':assert row['raised']==('RuntimeStop'if row['original']=='ValueError'else row['original'])
    elif kind=='actual_metadata_closure':assert row['finalized'] and row['terminal']['invalid_finalization_only_cap_seconds']==30
    elif kind=='owned_child':
        report=row['report'];assert report['worker_grace_seconds']==0 and not report['automatic_restart'] and not report['scientific_terminal_verified']
        for name,data in row['artifact_bodies'].items():assert report['artifacts'][name]=={'bytes':len(data.encode()),'sha256':sha(data.encode())}
assert counts['rejected_resource_evidence']==7 and counts['rejected_resource_binding']==6

def funcs(node):return {n.name:n for n in node.body if isinstance(n,(ast.ClassDef,ast.FunctionDef))}
def source(name):return ast.parse(raw(R/'scripts'/name))
old=funcs(source('research_score_split_compute_controller.py'));new=funcs(source('research_score_resource_controller.py'))
assert ast.dump(old['_chronological_origins'])==ast.dump(new['_chronological_origins'])
old_class=funcs(source('research_score_split_run.py'))['RuntimeEnvelope'];new_class=funcs(source('research_score_resource_policy.py'))['RuntimeEnvelope']
assert set(funcs(new_class))=={'__init__','check'}
for name,node in funcs(new_class).items():
    expected=copy.deepcopy(funcs(old_class)[name])
    for n in ast.walk(expected):
        if isinstance(n,ast.Constant):
            if type(n.value)in(int,float) and n.value==7200:n.value=9000.
            elif n.value=='registered_7200_second_deadline':n.value='registered_9000_second_deadline'
    assert ast.dump(expected)==ast.dump(node)
delta=js(W/'author-source-delta.json');assert all(delta['checks'].values())
assert all(sha(raw(R/name))==h for name,h in delta['new_inputs'].items())
assert sha(raw(W/'author-source-delta.json'))==pins['inputs'][str(W/'author-source-delta.json')]['sha256']
cli=js(A/'cli-probes.json');assert cli['passed'] and len(cli['probes'])==2

report={
    'version':'rfcomp08.controller-review.v1','status':'accepted',
    'scope':'resource_policy_complete_controller_qualification','role':'numerical',
    **{k:q[k]for k in ('code_hashes','runtime','runtime_files','protocol_sha256','config_sha256',
                      'compute_protocol_sha256','resource_protocol_sha256','resource_policy_sha256')},
    'qualification_sha256':sha(raw(Q)),'historical_execution':False,'tests':{'run':23,'passed':23},
    'test_count_basis':'Reviewed retained results:21 authored unit methods plus2 root CLI/duplicate probes. No tests or scientific computations rerun for this review.',
    'authorship_disclosure':'Reviewer authored the21 focused tests and applicability design; implementation was authored by compute_runner and the sole qualification executed by root. This is a saved-evidence review, not independent test authorship.',
    'audit_tooling_correction':'The initial metadata assertion incorrectly expected every inner score to use a doubled grid. It was corrected to the frozen first-per-setting rule, using saved ordered keys; original failed script/log retained outside the attempt. No source/result change or scientific repeat.',
    'blockers':[],
    'findings':[
        'All85 current source pins/seven runtime pins match retained identities; original79 source map and scientific/runtime bindings remain exactly COMP04.',
        'All47 observations checked. The new complete tiny pair is exactly byte-equal, including62 law descriptors,496 lossless readonly array images across the pair,54inner+38outer rows per route, full metrics, flags, fallback/source records and provenance. Its scientific fields also match the authenticated earlier COMP04 same-diagonal witness.',
        'Five saved real-delegate pilot outputs retain all arithmetic/validation fields except two final booleans:7199 and7200 remain accepted;8000 and9000 become accepted;next represented value above9000 fails. Direct arithmetic from saved components reproduces all five outputs with31fit/31score slots,multiplier2 and failed-call maxima.',
        'RSS4096 remains inclusive and4096.0001 vetoes; five altered ledger/membership/anchor cases retain identical old/new error type and reason.',
        'Saved actual runtime/short owned-child observations retain9000 parent-start deadline,earliest120 smoke,interrupt behavior,4GiB rule,30-second metadata-only closure andzero scientific grace. Synthetic clock durations are not performance estimates.',
        'Chronological loop AST remains literal COMP04; independent worker init/check AST comparison permits only9000 cap/reason. The pinned author delta record plus prior static review covers remaining resource-only copies; scientific helper identity tests passed.',
        'Fresh synthetic preflight binds effective resource policy and rejects13 resource/evidence contradictions. Final qualification records23 checks, actualexit0 and4.594839500001399-second checked commit within600/2048 limits. Old full inference evidence is reused without recounting or rerunning bootstrap.'
    ],
    'limitations':[
        'No historical capacity, full new replay, model acceptance, external-comparator gain or prospective result is established. The old cost-stopped runs retain their original invalid status.',
        'The genuine pair uses one named synthetic origin with explicitly seeded original accounting plan and identical tiny manifests. Full277 routing relies on unchanged loop/helper source plus earlier accepted routing evidence; it is not a new277 numerical run.',
        'New preflight negatives use the explicit small trust-root seam. The actual root CLI probes cover missing receipt and duplicate observer; old-version refusal is exercised by the new preflight unit path.',
        'No long9000-second wait occurred: controlled clocks exercise exact resource boundaries; short actual signals/owned children exercise enforcement. RSS is sampled/high-water evidence, not instantaneous kernel enforcement.',
        'Peak/runtime and complete file-membership audit are separately root-reviewed. This review authenticates sources and the evidence consumed, without repeating full historical archive audits.'
    ],
    'saved_checks':{'observations':47,'classification_counts':dict(counts),'science_pair_sha256':pairs[0]['sha256'],
                    'arrays_compared':arrays,'pilot_targets':[r['requested_projection']for r in pilots],
                    'unit_seconds':tests['wall_seconds'],'parent_seconds':process['wall_seconds'],
                    'commit_seconds':commit['elapsed_seconds'],'conservative_combined_rss_mib':process['conservative_combined_rss_mib']},
    'evidence':[pointer(p)for p in (Q,A/'numerical-observations.json',A/'unit-tests.json',A/'process.log',A/'process.json',
        A/'qualification-commit.json',A/'qualification-artifacts.json',A/'INPUT-PINS.json',A/'source-map-before.json',A/'source-map-after.json',
        A/'cli-probes.json',W/'author-source-delta.json',W/'root-qualification-audit.json',old_obs_path)]}
out=W/'numerical-review.v1.json'
with out.open('x')as f:json.dump(report,f,sort_keys=True,indent=2,allow_nan=False);f.write('\n')
print(json.dumps({'report':pointer(out),'observations':len(rows),'arrays':arrays,'checks_reviewed':23}))
