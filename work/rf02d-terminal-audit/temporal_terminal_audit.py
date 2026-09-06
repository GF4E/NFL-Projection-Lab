"""Independent metadata/hash audit of completed invalid RF02D; no model imports."""
from collections import Counter
from datetime import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import re
import resource
import stat
import sys
import time

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
BASE = Path('/Users/gabe/.codex/.chatgpt-projects/g-p-68af6fbbc1a48191b135cb36cf3961bf/research-data')
RUN = BASE / 'rf02d-v1-482ec75028e1d16f'
PARENT = BASE / 'rf02c-v1-2d9c91d803f1c991'
WORK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/work')
OUT = WORK / 'rf02d-terminal-audit'
M = '482ec75028e1d16f687a51eac6c5139a1b1db6deb3cb7884320ce767febe163d'
PM = '2d9c91d803f1c991be039b88167082c8a501ce60dc58b18afcab0b251bb75e38'
PI = 'ccde502d661a4beee8f8da537a2f23238950fb2931c1527638de4c92898804ab'
NI = '4f48061462188255613895a2453694e7290294404b8a74352302792fb1f03e63'
TERMINAL = '7542e806cb2cad495470acad231c888ddbdcd316d449c3f106384c670cdee238'
ACCEPTANCE = 'a1d51ab13a7aaa662328f84cf2bbc15f802b2aa0da79398ebaffa34fe630d34c'
DATA = 'ea7dc1c17cc4613ada871927842d90f6d41ffe61b45e6302c3032eac7cdffc85'
YEARS = tuple(range(2013, 2026))
COUNTS = (256,) * 8 + (272, 271, 272, 272, 272)
PRIOR = (0,256,512,768,1024,1280,1536,1792,2048,2320,2591,2863,3135)


def check(condition, reason):
    if not condition:
        raise AssertionError(reason)


def budget():
    check(time.monotonic() - START <= 300, 'audit_300_second_limit')
    check(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2 <= 4096, 'audit_4096_mib_limit')


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def pretty(value):
    return (json.dumps(value, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()


def compact(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()


def fp(value):
    return digest(compact(value))


def pairs(items):
    result = {}
    for key, value in items:
        check(key not in result, 'duplicate_json_key')
        result[key] = value
    return result


def parse(raw):
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))


def regular(path):
    path = Path(path)
    for ancestor in (path, *path.parents):
        check(not ancestor.is_symlink(), 'symlink:' + str(ancestor))
    check(stat.S_ISREG(path.stat().st_mode), 'not_regular:' + str(path))
    return path


def read(path, pin=None, size=None):
    raw = regular(path).read_bytes()
    check(pin is None or digest(raw) == pin, 'hash:' + str(path))
    check(size is None or len(raw) == size, 'size:' + str(path))
    return parse(raw)


def indexed(directory, index, name):
    check(name in index, 'unindexed:' + name)
    return read(directory / name, index[name]['sha256'], index[name]['bytes'])


def pointer(index, name):
    return {'name': name, **index[name]}


def ts(value):
    result = datetime.fromisoformat(value)
    check(result.tzinfo is not None, 'naive_timestamp')
    return result


def hash_index(directory, files, label):
    ledger = []
    for name, ref in files.items():
        budget()
        check(not Path(name).is_absolute() and '..' not in Path(name).parts, 'unsafe_index_name')
        path = regular(directory / name)
        h = hashlib.sha256()
        count = 0
        with path.open('rb') as stream:
            while chunk := stream.read(1024 * 1024):
                h.update(chunk); count += len(chunk)
        check(h.hexdigest() == ref['sha256'] and count == ref['bytes'], label + ':' + name)
        ledger.append([name, ref['sha256'], count])
    return {'files': len(files), 'bytes': sum(r['bytes'] for r in files.values()), 'ledger_sha256': digest(pretty(ledger))}


index = read(RUN / 'completion/artifact-index.json', NI)
check(set(index) == {'files', 'uncommitted_artifacts', 'uncommitted_staging'}, 'index_schema')
check(index['uncommitted_artifacts'] == index['uncommitted_staging'] == [], 'unexpected_uncommitted_prefix')
files = index['files']
check(len(files) == 904, 'indexed_population')
actual_files, actual_dirs = set(), set()
for parent, dirs, names in os.walk(RUN, followlinks=False):
    for name in dirs:
        path = Path(parent) / name
        check(not path.is_symlink(), 'directory_symlink')
        actual_dirs.add(str(path.relative_to(RUN)))
    for name in names:
        path = Path(parent) / name
        regular(path)
        actual_files.add(str(path.relative_to(RUN)))
check(actual_dirs == {'completion'}, 'unexpected_directory_or_alternate_completion')
check(actual_files == set(files) | {'completion/artifact-index.json'}, 'unindexed_or_missing_bytes')
new_integrity = hash_index(RUN, files, 'successor')
pindex = read(PARENT / 'artifact-index.json', PI)['files']
parent_integrity = hash_index(PARENT, pindex, 'parent')
manifest = indexed(RUN, files, 'manifest.json')
check(digest(pretty(manifest)) == M and RUN.name == 'rf02d-v1-' + M[:16], 'immutable_identity')
parent_manifest = read(PARENT / 'manifest.json', PM)
terminal = read(RUN / 'completion/terminal.json', TERMINAL)
check(terminal['status'] == 'protocol_invalid' and terminal['phase'] == 'inference'
      and terminal['reason'] == 'inference_protocol_invalid:nonfinite_or_nonnumeric_metric', 'terminal_failure_mismatch')
check(terminal['production_authorized'] is False and terminal['independent_actual_result_acceptance'] is False,
      'invalid_result_scope')
started = indexed(RUN, files, 'started.json')
acceptance = read(started['implementation_acceptance']['path'], ACCEPTANCE)
check(manifest['implementation_acceptance_sha256'] == ACCEPTANCE == started['implementation_acceptance']['sha256'], 'acceptance_pin')
check(acceptance['code_hashes'] == manifest['code_hashes'] and len(manifest['code_hashes']) == 43, 'all43_binding')
for name, pin in manifest['code_hashes'].items():
    check(digest(regular(ROOT/name).read_bytes()) == pin, 'current_source:' + name)
for name, pin in parent_manifest['code_hashes'].items():
    check(manifest['code_hashes'][name] == pin, 'frozen_parent_source')
for name, ref in manifest['acceptances'].items():
    stage = read(ref['path'], ref['sha256'])
    check(stage['status'].startswith('accepted_') and acceptance['acceptances'][name] == ref, 'stage_acceptance')
for name, ref in manifest['audit_evidence'].items():
    audit = read(ref['path'], ref['sha256'])
    check(audit['status'] == 'accepted' and audit['source_hashes'] == manifest['code_hashes'], 'implementation_review_binding')
check(manifest['runtime'] == parent_manifest['runtime'], 'recorded_runtime_binding')
runtime_auth = read(WORK/'rf02d-runner-review/temporal-authentication.json')
check(manifest['runtime'] == runtime_auth['runtime'], 'reviewed_runtime_binding')
config = read(ROOT/'config/research-team-score-conditional.v1.json', manifest['config_sha256'])
check(digest(regular(ROOT/config['protocol']).read_bytes()) == manifest['protocol_sha256'], 'protocol_hash')
series = [(family[:-1], variant) for family, variant in config['series']]
ordinary = [key for key in series if key[1] != 'independent_marginals']
raw_series = list(map(tuple, config['raw_references']))
check((len(series),len(ordinary),len(raw_series)) == (20,18,6), 'series_membership')
data = read(BASE/'rf01-public-2026-09-04-v1/admitted-score-data.v2.json', DATA)
origins = [row for row in data['origins'] if row['season'] in YEARS]
records = {row['gameId']:row for row in data['records']}
check(len(records) == len(data['records']) and len(origins) == 226, 'original_cohort')
check([(o['season'],o['week']) for o in origins] == sorted(set((o['season'],o['week']) for o in origins)), 'origin_order')
games = [game for origin in origins for game in origin['targetGameIds']]
by_year = {year:[game for origin in origins if origin['season']==year for game in origin['targetGameIds']] for year in YEARS}
check(len(games) == len(set(games)) == 3407 and tuple(map(len,by_year.values())) == COUNTS, 'year_populations')
first_cutoffs = {year:next(o['originAt'] for o in origins if o['season']==year) for year in YEARS}
admission = indexed(RUN, files, 'admission.json')
collection = indexed(RUN, files, 'case-collection.json')
cost = indexed(RUN, files, 'admission-cost.json')
annual_index = indexed(RUN, files, 'annual-index.json')
old_admission_acceptance = read(manifest['acceptances']['admission']['path'],manifest['acceptances']['admission']['sha256'])
old_admission = read(**{'path':old_admission_acceptance['evidence']['result.json']['path'],'pin':old_admission_acceptance['evidence']['result.json']['sha256']})
check(admission['status']=='passed' and admission['counts']==old_admission['counts'], 'fresh_admission_counts')
for field in ('recovered_sources_sha256','case_inputs_sha256'):
    check(admission[field] == old_admission[field] == collection[field], 'admission_collector_digest')
check(admission['counts']['native_failures']==0 and admission['counts']['recovered_distributions']==68140
      and admission['counts']['calibration_cases']==56430, 'admission_population')
expected_chunk_names = [f"cases-{o['season']}-{o['week']:02}.json" for o in origins if o['season']<=2024]
check([r['pointer']['name'] for r in collection['case_chunks']]==expected_chunk_names and len(expected_chunk_names)==208, 'case_chunk_order')
check(annual_index['run_manifest_sha256']==M and annual_index['case_collection']==pointer(files,'case-collection.json'), 'annual_index_binding')
check([(r['target_season'],r['family'],r['variant']) for r in annual_index['entries']] ==
      [(year,family,variant) for year in YEARS for family,variant in ordinary], '234_receipt_order')

# Read original and successor rows together; retain only case metadata needed to
# recompute pure annual input hashes. No distribution is reconstructed.
sources={key:[] for key in ordinary}; cases={key:[] for key in ordinary}
source_fp={}; case_hash=hashlib.sha256(); fp_ledger=hashlib.sha256()
counts=Counter(); native=Counter(); ordering=[]; pub_before_score=[]
annual_bodies={}; annual_pointers={}; receipt_records=[]
for entry in annual_index['entries']:
    env=indexed(RUN,files,entry['pointer']['name'])
    check(entry['pointer']==pointer(files,entry['pointer']['name']), 'annual_pointer')
    body=env['pure_receipt']; year=entry['target_season']; key=entry['family'],entry['variant']
    check(env['version']=='rf02d-annual-envelope.v1' and env['run_manifest_sha256']==M
          and (env['family'],env['variant'],env['target_season'])==(*key,year), 'annual_envelope_identity')
    check(body['sha256']==env['pure_receipt_sha256']==entry['pure_receipt_sha256']==fp({k:v for k,v in body.items() if k!='sha256'}), 'pure_receipt_hash')
    check((body['family'],body['variant'],body['target_season'],body['cutoff'])==(*key,year,first_cutoffs[year]), 'first_cutoff')
    check(env['case_chunks']==[r['pointer'] for r in collection['case_chunks'] if r['season']<year], 'prior_chunk_membership')
    annual_bodies[year,*key]=body; annual_pointers[year,*key]=entry['pointer']

for origin in origins:
    budget(); year=origin['season']; week=origin['week']; suffix=f'{year}-{week:02}'
    pf='forecasts-'+suffix+'.json'; pl='outer-losses-'+suffix+'.json'
    parent_pub=indexed(PARENT,pindex,pf); parent_losses=indexed(PARENT,pindex,pl)
    check(parent_pub['origin_at']==origin['originAt'] and parent_pub['manifest_sha256']==PM, 'original_publication_origin')
    prow={(r['family'],r['variant'],r['game_id']):r for r in parent_pub['outer_selected_forecasts']}
    prows=parent_pub['outer_selected_forecasts']; loss={(r['family'],r['variant'],r['game_id']):r for r in parent_losses}
    parent_series=list(dict.fromkeys((r['family'],r['variant']) for r in prows))
    expected_parent=[(*key,g) for key in parent_series for g in origin['targetGameIds']]
    check([(r['family'],r['variant'],r['game_id']) for r in prows]==expected_parent
          and [(r['family'],r['variant'],r['game_id']) for r in parent_losses]==expected_parent, 'complete_parent_order')
    check(len(prow)==len(prows)==len(loss)==len(parent_losses), 'duplicate_parent_row')
    for key,r in prow.items():
        check(r['native_failure']==loss[key]['native_failure'], 'original_flag_reason')
    refs={'forecast':pointer(pindex,pf),'loss':pointer(pindex,pl)}
    if year<=2024:
        cn='cases-'+suffix+'.json'; chunk=indexed(RUN,files,cn)
        check(chunk['run_manifest_sha256']==M and chunk['origin']==origin, 'case_origin_and_run')
        check([(r['source']['family'],r['source']['variant'],r['source']['game_id']) for r in chunk['rows']]
              ==[(*key,g) for key in ordinary for g in origin['targetGameIds']], 'case_population_order')
        for row in chunk['rows']:
            s,c=row['source'],row['case']; key=s['family'],s['variant']; g=s['game_id']; record=records[g]
            check(row['parent_references']==refs and row['admitted_data_sha256']==DATA, 'case_parent_ref')
            check(row['original_distribution']==prow[*key,g]['distribution'], 'case_original_descriptor')
            mapper=row['original_distribution']['mapper']; check(pindex[mapper['name']]['sha256']==mapper['sha256'], 'original_mapper_index')
            check(s=={'family':key[0],'variant':key[1],'season':year,'game_id':g,'origin_at':origin['originAt'],
                'kickoff_at':record['kickoffAt'],'availability':record['availability'],'native_failure':prow[*key,g]['native_failure'],
                'source_fingerprint':s['source_fingerprint'],'case_fingerprint':s['case_fingerprint'],
                'observed_home':record['homeScore'],'observed_away':record['awayScore']}, 'case_source_metadata')
            check(s['native_failure'] is None and ts(s['origin_at'])<ts(s['kickoff_at']), 'source_native_or_origin')
            check(c['family']==key[0] and c['variant']==key[1] and c['season']==year and c['game_id']==g
                and c['weight']==1 and c['source_fingerprint']==s['source_fingerprint']
                and c['case_fingerprint']==s['case_fingerprint']==fp(c['case']), 'case_fingerprint')
            check(c['case']['total']==record['homeScore']+record['awayScore']<=200, 'case_observation_binding')
            sources[key].append(s); cases[key].append(c); source_fp[*key,g]=s['source_fingerprint']
            case_hash.update(pretty({'key':[*key,g],'source_fingerprint':s['source_fingerprint'],'case':c['case']}))
            counts['cases']+=1
    pub=indexed(RUN,files,pf); sn='scores-'+suffix+'.json'; scores=indexed(RUN,files,sn)
    check(pub['run_manifest_sha256']==scores['run_manifest_sha256']==M and pub['origin']==scores['origin']==origin, 'mapped_origin_binding')
    expected=[(f+'C',v,g) for f,v in series for g in origin['targetGameIds']]
    check([(r['family'],r['variant'],r['game_id']) for r in pub['rows']]==expected
          and [(r['family'],r['variant'],r['game_id']) for r in scores['mapped']]==expected, 'all_mapped_exact_order')
    fulls={(r['family'][:-1],r['variant'],r['game_id']):r for r in pub['rows']}
    for recipe,score in zip(pub['rows'],scores['mapped']):
        family=recipe['family'][:-1]; variant=recipe['variant']; g=recipe['game_id']; key=family,variant; record=records[g]
        check((recipe['season'],recipe['week'],recipe['origin_at'])==(year,week,origin['originAt']), 'recipe_origin')
        check(recipe['parent_forecast']==refs['forecast'] and score['forecast_publication']==pointer(files,pf)
              and score['recipe_sha256']==digest(pretty(recipe)), 'publication_score_recipe_ref')
        check(recipe['native_failure']==score['native_failure']==prow[*key,g]['native_failure'], 'mapped_native_reason')
        check(recipe['native_failure'] is None, 'unexpected_parent_native_failure')
        native[recipe['family'],variant,year,recipe['native_failure']]+=1
        check(score['metrics']['home_observed']==record['homeScore'] and score['metrics']['away_observed']==record['awayScore'], 'mapped_observed_alignment')
        check(ts(recipe['origin_at'])<ts(record['kickoffAt']), 'forecast_pregame_origin')
        check(not set(recipe)&{'observed_home','observed_away','realized_total','homeScore','awayScore'}, 'outcome_in_recipe')
        p=recipe['provenance']; ordinary_variant='full' if variant=='independent_marginals' else variant
        chosen=family,ordinary_variant; body=annual_bodies[year,*chosen]
        check(p['sha256']==fp({k:v for k,v in p.items() if k!='sha256'}), 'provenance_hash')
        check((p['family'],p['variant'],p['game_id'],p['target_season'],p['origin_at'],p['native_failure'])
              ==(family,variant,g,year,origin['originAt'],None), 'provenance_identity')
        check(recipe['annual_envelope']==annual_pointers[year,*chosen] and p['annual_receipt_sha256']==body['sha256'], 'recipe_annual_binding')
        sf=p['requested_source_fingerprint']; check(re.fullmatch('[0-9a-f]{64}',sf) is not None,'source_fp_schema')
        check(p['chosen_source']=={'family':family,'variant':ordinary_variant,'game_id':g,'source_fingerprint':sf}, 'chosen_source_identity')
        if year<=2024:
            check(sf==source_fp[*chosen,g], 'case_to_prediction_source_binding')
        tr=p['transformation']
        check(tr['original_distribution_fingerprint']==sf and tr['s']==body['scale'], 'transform_scalar_source_binding')
        if variant=='independent_marginals':
            base=fulls[family,'full',g]['provenance']
            check(p['transformation']==base['transformation'] and p['requested_source_fingerprint']==base['requested_source_fingerprint'], 'independence_full_binding')
            op=p['product_operation']; check(op['operation']=='product_of_calibrated_full_marginals' and op['joint_transformation']==tr
                  and op['resulting_distribution_fingerprint']==recipe['result_distribution_fingerprint'], 'product_operation')
            counts['independence_rows']+=1
        else:
            check(p['product_operation'] is None and tr['resulting_distribution_fingerprint']==recipe['result_distribution_fingerprint'], 'ordinary_result_chain')
        fp_ledger.update(pretty([family,variant,g,sf,variant=='independent_marginals']))
        counts['mapped_rows']+=1
    check([(r['family'],r['variant'],r['game_id']) for r in scores['raw_references']]
          ==[(*key,g) for key in raw_series for g in origin['targetGameIds']], 'raw_reference_order')
    for row in scores['raw_references']:
        key=row['family'],row['variant'],row['game_id']; original=loss[key]
        check(row['native_failure']==original['native_failure']==prow[key]['native_failure']
              and row['metrics']==original['metrics'] and row['original_row_sha256']==digest(pretty(original))
              and row['parent_loss']==refs['loss'], 'immutable_raw_reference')
        record=records[row['game_id']]
        check(row['metrics']['home_observed']==record['homeScore'] and row['metrics']['away_observed']==record['awayScore'], 'raw_observed_alignment')
        counts['raw_rows']+=1
    pub_before_score.append((RUN/pf).stat().st_mtime_ns <= (RUN/sn).stat().st_mtime_ns)
    ordering.append({'season':year,'week':week,'games':len(origin['targetGameIds']),
                     'publication':files[pf]['sha256'],'scores':files[sn]['sha256']})
check(counts['cases']==56430 and counts['mapped_rows']==68140 and counts['raw_rows']==20442, 'complete_row_counts')
check(case_hash.hexdigest()==collection['case_inputs_sha256'], 'complete_case_aggregate')
check(fp_ledger.hexdigest()==collection['recovered_sources_sha256'], 'complete_source_fp_aggregate')

for year in YEARS:
    budget(); prior={old:by_year[old] for old in YEARS if old<year}; prior_games=[g for values in prior.values() for g in values]
    for key in ordinary:
        body=annual_bodies[year,*key]
        ss=[s for s in sources[key] if s['season']<year]; cc=[c for c in cases[key] if c['season']<year]
        check(len(ss)==len(cc)==PRIOR[year-2013] and [s['game_id'] for s in ss]==prior_games, 'annual_prior_population')
        check(body['case_keys']==prior_games and body['expected_count']==body['native_success_count']==len(ss)
              and body['failed_count']==0 and body['failed_keys']==[], 'annual_native_partition')
        check(body['expected_population_sha256']==fp(prior) and body['input_digest']==fp({'sources':ss,'cases':cc}), 'annual_input_hash')
        check(body['case_sources']==[{'season':s['season'],'game_id':s['game_id'],'source_fingerprint':s['source_fingerprint'],
              'case_fingerprint':s['case_fingerprint'],'weight':1} for s in ss], 'annual_case_source_list')
        cutoff=ts(first_cutoffs[year]); margin=[]
        for s in ss:
            check(s['season']<year and s['season']<=2024 and ts(s['origin_at'])<ts(s['kickoff_at'])<cutoff, 'prior_origin_cutoff')
            for delay in ('12','24'):
                check(ts(s['availability'][delay])<cutoff, 'strict_alternative_availability')
                margin.append((cutoff-ts(s['availability'][delay])).total_seconds())
        check(type(body['scale']) is float and math.isfinite(body['scale']) and 0<=body['scale']<=1, 'finite_scale_record')
        if year==2013:
            check(body['scale']==1 and body['status']=='identity_no_prior_outer_support' and body['estimator'] is None, 'cold_receipt')
        else:
            check(body['estimator'] is not None and body['estimator']['s']==body['scale'] and body['estimator']['status']==body['status'], 'estimated_receipt_binding')
        receipt_records.append({'year':year,'family':key[0],'variant':key[1],'prior_count':len(ss),
            'cutoff':first_cutoffs[year],'input_digest':body['input_digest'],'receipt_sha256':body['sha256'],
            'minimum_both_delay_margin_seconds':min(margin) if margin else None})

pilot=indexed(RUN,files,'pilot.json'); pilot_origins=[o for o in origins if o['season']==2014][:2]
pilot_games=sum(len(o['targetGameIds']) for o in pilot_origins)
check(pilot['pilot_game_count']==pilot_games==32 and pilot['completed_game_count']==256+pilot_games==288
      and pilot['remaining_game_count']==3407-288==3119, 'retained_pilot_population')
projection=pilot['elapsed_total']+2*pilot['pilot_scoring_seconds']*3119/32+600
check(projection==pilot['projected_seconds']<=7200 and pilot['passed'] is True, 'pilot_formula')
check(admission['seconds']<=cost['combined_admission_case_preparation_seconds']<=600
      and cost['combined_admission_case_preparation_seconds']<=pilot['elapsed_total']<=terminal['seconds']<=7200
      and terminal['peak_rss_mib']<=4096, 'recorded_resource_limits')
check(terminal['invalid_finalization_only_cap_seconds']==30 and terminal['scientific_stop_elapsed_seconds']==terminal['seconds'], 'finalization_only_cap')
check(terminal['execution_counts']=={'mapped_prediction_calls':68140,'native_reason_matches':88582,
    'prediction_reconstruction_calls':68140,'published_origins':226,'recipe_reconstruction_calls':68140,'score_calls':68140}, 'execution_counts')
runtime=indexed(RUN,files,'runtime-checks.json'); evaluation=indexed(RUN,files,'evaluation.json')
check(evaluation['status']=='protocol_invalid' and evaluation['reason']=='nonfinite_or_nonnumeric_metric'
      and evaluation['candidate_qualified'] is False and evaluation['mapping_supported'] is False, 'no_successful_inference')
check(runtime['implementation_review_evidence']==manifest['audit_evidence'] and all(v is True for v in runtime['checks'].values()), 'runtime_evidence')
for name,file in [('admission','admission.json'),('case_collection','case-collection.json'),('annual_index','annual-index.json')]:
    check(runtime[name]==pointer(files,file),'runtime_pointer')
annual_mtimes=[(RUN/r['pointer']['name']).stat().st_mtime_ns for r in annual_index['entries']]
pub_times=[(RUN/f"forecasts-{o['season']}-{o['week']:02}.json").stat().st_mtime_ns for o in origins]
score_times=[(RUN/f"scores-{o['season']}-{o['week']:02}.json").stat().st_mtime_ns for o in origins]
check(all(pub_before_score) and annual_mtimes==sorted(annual_mtimes) and max(annual_mtimes)<min(pub_times), 'supporting_persistence_order')
check(all(score_times[i]<=pub_times[i+1] for i in range(225)), 'supporting_origin_order')
timestamps={}
for name in ('started.json','admission-cost.json','annual-index.json','forecasts-2013-01.json','scores-2025-18.json',
             'runtime-checks.json','evaluation.json','completion/terminal.json','completion/artifact-index.json','completion'):
    st=(RUN/name).stat(); timestamps[name]={'mtime_ns':st.st_mtime_ns,'ctime_ns':st.st_ctime_ns,'birthtime':st.st_birthtime}
visible_failure_interval=(timestamps['completion']['ctime_ns']-timestamps['evaluation.json']['mtime_ns'])/1e9
check(0<=visible_failure_interval<=30, 'supporting_invalid_finalization_interval')
check(actual_files==set(files)|{'completion/artifact-index.json'}, 'complete_only_archive')
for name,pin in manifest['code_hashes'].items():
    check(digest(regular(ROOT/name).read_bytes())==pin, 'post_audit_source')
budget()
elapsed=time.monotonic()-START; rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2
report={
 'version':'rf02d-actual-temporal-terminal-review.v1','status':'accepted_temporal_integrity_of_invalid_retained_run',
 'scientific_terminal_status':'protocol_invalid','candidate_or_predictive_result_accepted':False,
 'run_directory':str(RUN),'manifest_sha256':M,'terminal_sha256':TERMINAL,'artifact_index_sha256':NI,
 'implementation_acceptance_sha256':ACCEPTANCE,'all_43_source_hashes_exact':True,
 'new_archive_integrity':new_integrity,'parent_archive_integrity':parent_integrity,
 'case_and_receipt_validation':{'unique_cases':56430,'case_chunks':208,'latest_case_season':2024,
    'case_aggregate_sha256':case_hash.hexdigest(),'original_source_fp_aggregate_sha256':fp_ledger.hexdigest(),
    'annual_receipts':234,'cold_starts':18,'estimated_receipts':216,'all_prior_input_hashes_recomputed':True,
    'all_original_cutoffs_and_both_availability_delays_verified':True,'native_failures':0,
    'receipt_closure_ledger_sha256':digest(pretty(receipt_records))},
 'population_and_provenance':{**dict(counts),'outer_origins':226,'games':3407,'development_games':3135,'exposed_2025_games':272,
    'ordered_games_sha256':digest(pretty(games)),'original_origin_ledger_sha256':digest(pretty(ordering)),
    'all_mapped_native_reasons_and_raw_references_verified':True,'all_68140_recipe_scalar_and_source_bindings_verified':True,
    'all_raw_metrics_equal_immutable_parent_rows':True,'all_target_observations_match_admitted_records':True},
 'resources':{'admission_reported_seconds':admission['seconds'],'combined_preparation_reported_seconds':cost['combined_admission_case_preparation_seconds'],
    'pilot':pilot,'scientific_stop_reported_seconds':terminal['seconds'],'run_peak_rss_mib':terminal['peak_rss_mib'],
    'invalid_finalization_only_cap_seconds':30,'observed_evaluation_to_completion_metadata_seconds':visible_failure_interval,
    'reported_limits_satisfied':True,'timing_limitations':'Pilot/admission elapsed fields were authenticated and their arithmetic/membership recomputed; no independent monotonic trace exists. Filesystem metadata supports rapid invalid finalization but cannot measure its final fsync or independently prove the 30-second timer elapsed.'},
 'persistence':{'authoritative_terminal':'completion/terminal.json','atomic_pair_complete':True,'uncommitted_artifacts':[],
    'uncommitted_staging':[],'no_extra_or_missing_files':True,'all_annual_files_precede_first_publication_by_mtime':True,
    'all_226_publications_precede_matching_scores_by_mtime':True,'all_origin_scores_precede_next_publication_by_mtime':True,
    'timestamps':timestamps},
 'process_evidence':{'session':18234,'exit_code_reported_by_root':1,'stdout_matches_terminal_reported_by_root':True,
    'independently_observed_process_handle':False,'limits':'Root observed the process handle; this audit authenticates the resulting bytes. Timestamps and complete files alone do not prove process completion, absence of unrelated executions, or original historical issuance.'},
 'failure_interpretation':'All mapped scores and annual records are retained, but inference returned protocol_invalid and no valid scorecard/comparison/candidate decision exists. Runtime no-new-numerical-failure was a pre-inference completion flag; it does not override the later inference failure.',
 'scope':{'scalar_estimates_recomputed':0,'new_model_or_distribution_recoveries':0,'metric_calls':0,'replays_or_restarts':0,
    'archived_artifacts_edited':0,'production_authorized':False,'original_historical_publication_verified':False,
    'numerical_case_and_transformation_math_recomputed':False},
 'limits':['Source distribution fingerprints were linked across authenticated parent descriptors, persisted cases and recipes and reconciled to accepted admission digests; this temporal audit did not numerically recover distributions or re-estimate scales.',
    'Public-before-grade support comprises immutable references, exact full-origin membership, reviewed call/fsync order and supporting mutable timestamps; it is not an independent historical issuance log.',
    'The complete invalid archive is accepted as retained evidence only. No improved model, mapping benefit, external benchmark advantage or successful experiment is accepted.'],
 'audit_resources':{'seconds':elapsed,'peak_rss_mib':rss,'maximum_seconds':300,'maximum_rss_mib':4096},
 'audit_script_sha256':digest(Path(__file__).read_bytes())}
payload=pretty(report); path=OUT/'temporal-terminal-review.json'
with path.open('xb') as stream: stream.write(payload)
print(json.dumps({'path':str(path),'sha256':digest(payload),'bytes':len(payload),'status':report['status'],
    'seconds':elapsed,'peak_rss_mib':rss,'new_files':new_integrity['files'],'parent_files':parent_integrity['files']}))
