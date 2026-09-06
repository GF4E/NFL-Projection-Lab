"""Synthetic dispatch qualification only; never invokes historical science."""
from pathlib import Path
import copy
import hashlib
import importlib.util
import json
import os
import resource
import signal
import sys
import time
import traceback
from types import SimpleNamespace
from unittest.mock import patch
from contextlib import ExitStack

START = time.monotonic()
ROOT = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
WORK = Path(__file__).resolve().parent
ATTEMPT = WORK / ('chronology-attempt-' + str(time.time_ns()))
ATTEMPT.mkdir()
def alarm(*_): raise TimeoutError('synthetic_120_second_limit')
signal.signal(signal.SIGALRM, alarm)
signal.setitimer(signal.ITIMER_REAL, 120.)
sys.path.insert(0, str(ROOT / 'scripts'))
import research_score_split_controller as c
import research_score_split_run as r
import research_score_split_archive as a
import research_score_split_replay as b
import research_score_split_forecast as f
import research_score_split_grade as g

spec = importlib.util.spec_from_file_location('accepted_plan_fixture', ROOT / 'tests/research-score-split/test_run_unit.py')
fixture = importlib.util.module_from_spec(spec); spec.loader.exec_module(fixture)
ORIGINS = fixture.original_plan()
SHA = lambda raw: hashlib.sha256(raw).hexdigest()
FILES = ['scripts/research_score_split_controller.py', 'scripts/research_score_split_run.py',
         'scripts/research_score_conditional_run.py', 'scripts/research_score_split_archive.py',
         'scripts/research_score_split_replay.py', 'scripts/research_score_split_forecast.py',
         'scripts/research_score_split_grade.py', 'scripts/research_score_split_budget.py',
         'tests/research-score-split/test_run_unit.py',
         '.planning/engine-os/research-first/RF-02F-HISTORICAL-PROTOCOL.v1.md',
         'config/research-team-score-split.v1.json']
BEFORE = {name: SHA((ROOT/name).read_bytes()) for name in FILES}
RAW = [('N0','full'), ('N0','availability_24h'), ('E2','full'),
       ('E2','availability_24h'), ('E1','full'), ('S1','full')]

def save(path, value):
    with path.open('xb') as out:
        out.write(r.strict(value)); out.flush(); os.fsync(out.fileno())

class Envelope:
    """Actual wall/RSS checks; admission and evaluator phases are explicit no-ops."""
    def __init__(self):
        self.started=time.monotonic(); self.phase_measurements=[]; self.peak_rss_mib=0.
    def elapsed(self): return time.monotonic()-self.started
    def check(self):
        self.peak_rss_mib=max(self.peak_rss_mib, r.rss_mib())
        assert time.monotonic()-START < 120. and self.peak_rss_mib <= 2048.
    def _after(self, error): self.check()
    def call(self, fn, *args, **kwargs):
        self.check()
        try: return fn(*args, **kwargs)
        finally: self.check()
    def phase(self, name):
        start=self.elapsed(); self.check(); finish=self.elapsed()
        self.phase_measurements.append(dict(name=name, started_seconds=start,
            finished_seconds=finish, seconds=finish-start, error_type=None))

def scenario(name, reject_pilot=False):
    trace=[]; selected={}; fed=[]; advanced=[]; published=[]; graded=[]
    context=SimpleNamespace(origins=ORIGINS, teams=('AAA','BBB'), expected_by_season={
        y:[game for o in ORIGINS if o['season']==y for game in o['targetGameIds']]
        for y in range(2010,2026)})
    manifest={'synthetic_dispatch_only':True, 'scenario':name}
    manifest_sha=SHA(r.strict(manifest))
    store=r.Store(ATTEMPT.resolve(), name)
    envelope=Envelope(); envelope.phase('admission'); envelope.phase('inference_smoke')
    accounting=r.OriginAccounting(envelope, ORIGINS)
    progress={'phase':'synthetic_start','counts':dict.fromkeys(c.COUNT_KEYS,0),
              'completed_origins':0,'artifacts':{}}
    def event(kind, origin, **extra):
        trace.append({'step':len(trace),'kind':kind,'origin':[origin['season'],origin['week']],**extra})
    class Feed:
        def __init__(self, ctx): assert ctx is context
        def select(self, year, expected):
            assert year not in selected and expected is context.expected_by_season
            assert all(o['season'] < year for o in graded)
            assert [(o['season'],o['week']) for o in fed if o['season'] in (year-2,year-1)] == [
                (o['season'],o['week']) for o in ORIGINS if o['season'] in (year-2,year-1)]
            selected[year]={'setting':0,'synthetic_selection_only':True,'inner_seasons':[year-2,year-1]}
            event('select',{'season':year,'week':1}, prior_inner_origins=len(fed))
            return {'E3':selected[year]}
        def add(self, original, rows, receipt):
            assert graded[-1] is original and receipt['origin']==[original['season'],original['week']]
            assert original['season'] < 2025 and original not in fed
            assert rows == [['E3',i,game] for game in original['targetGameIds'] for i in range(27)]
            if original['season']>=2013: assert original['season'] in selected
            fed.append(original); event('feed',original,rows=len(rows))
    class Bank:
        def __init__(self, teams):
            assert teams==context.teams
            self.engines={('E3',i,v):SimpleNamespace(last_origin=None,ratings=[],offense=[],defense=[])
                for i in range(27) for v in b._STATE_VARIANTS if i>=9 or v in b._ZERO_VARIANTS}
            assert len(self.engines)==216
        def advance(self, year, week, prepared, diagonal):
            original=ORIGINS[len(advanced)]
            assert (year,week)==(original['season'],original['week'])
            assert prepared is original and len(diagonal)==81
            if year>=2013: assert year in selected
            for engine in self.engines.values(): engine.last_origin=(year,week)
            advanced.append(original); event('advance',original,own=216,borrowed=81)
            return {**diagonal,**{key:{'synthetic_state_only':[year,week]} for key in self.engines}}
    def forecast(ctx, original, check):
        assert ctx is context; check(); event('forecast_inputs',original)
        mappers={}
        for delay in (12,24):
            payload={'synthetic_mapper_only':delay}; digest=SHA(r.strict(payload))
            mappers[delay]={'payload':payload,'pointer':{'name':'object-'+digest+'.json','sha256':digest}}
        return {'origin':original,'mapper_sources':mappers,'bank_prepared':original,
            'diagonal_outputs':{('E3',i,v):{'synthetic_state_only':[original['season'],original['week']]}
                for i,v in b._DIAGONAL_KEYS},'source_pointers':{'synthetic_source_only':True}}
    def assemble(view, bank, outputs, choice, **kw):
        original=view['origin']; year=original['season']; ids=original['targetGameIds']
        assert len(outputs)==297 and len(bank.engines)==216
        assert choice == (selected[year] if year>=2013 else None)
        event('assemble',original)
        if (year,original['week']) in ((2013,1),(2013,2)):
            accounting.callback('fit',lambda:r.CallbackResult('routing-only'),game_id=ids[0],setting=9,
                variant='full',stage='inner',operation='fit')
            if original['week']==2:
                def fail(): raise ValueError('intentional_synthetic_callback_failure')
                try:
                    accounting.callback('fit',fail,game_id=ids[0],setting=10,
                        variant='full',stage='inner',operation='fit')
                except ValueError as exc: assert str(exc)=='intentional_synthetic_callback_failure'
        return {'full_setting_forecasts':[['E3',i,game] for game in ids for i in range(27)] if 2011<=year<=2024 else [],
            'outer_selected_forecasts':[[fam,var,game] for game in ids
                for fam,var in [('E3',v) for v in r.SPLIT_VARIANTS]+RAW] if year>=2013 else [],
            'synthetic_routing_only':True}
    def publish(st, man, sha, view, bank, outputs, assembly, env):
        original=view['origin']; suffix=c._suffix(original)
        assert st is store and sha==manifest_sha and original not in published
        value={'synthetic_routing_only':True,'manifest_sha256':sha,
               'origin':[original['season'],original['week']],'target_game_ids':original['targetGameIds'],**assembly}
        st.write('forecast-'+suffix+'.json',value)
        pointer=st.pointer('forecast-'+suffix+'.json')
        st.write('publication-binding-'+suffix+'.json',{'forecast':pointer,'manifest_sha256':sha})
        assert st.read_bound(pointer)==value
        os.fsync(st.fd); published.append(original); event('publish_directory_fsynced',original)
        return pointer
    def validate(st, man, sha, view, assembly, pointer, env):
        value=st.read_bound(pointer)
        assert value['manifest_sha256']==sha and value['origin']==[view['origin']['season'],view['origin']['week']]
        return value,st.read_bound(st.pointer('publication-binding-'+c._suffix(view['origin'])+'.json'))
    class Grader:
        last_attempt_origin=None; last_attempt_counts=None
        def grade(self, st, man, sha, view, assembly, pointer, ctx, acc, *, validate_binding):
            original=view['origin']; year=original['season']; n=len(original['targetGameIds'])
            self.last_attempt_origin=[year,original['week']]
            validate_binding(); assert published[-1] is original and original not in graded
            event('grader_access_after_publication',original)
            inner=assembly['full_setting_forecasts']; outer=assembly['outer_selected_forecasts']
            if (year,original['week']) in ((2013,1),(2013,2)):
                acc.callback('score',lambda:r.CallbackResult('routing-only'),game_id=original['targetGameIds'][0],
                    setting=0,variant='zero_strength_update',stage='outer',operation='score',double_grid=True,diagnostics=True)
            counts=dict(inner_rows=len(inner),outer_rows=len(outer),copied_diagonal_inner=9*n if inner else 0,
                scored_inner=18*n if inner else 0,copied_e3_outer=11*n if outer else 0,
                scored_outer=2*n if outer else 0,copied_raw_outer=6*n if outer else 0,
                actual_score_calls=(18*n if inner else 0)+(2*n if outer else 0),
                actual_mass_cdf_calls=13*n*8 if outer else 0)
            self.last_attempt_counts=counts
            artifact='routing-grade-'+c._suffix(original)+'.json'
            st.write(artifact,{'synthetic_routing_only':True,'inner_keys':inner,'outer_keys':outer,'logical_counts':counts})
            saved=st.read_bound(st.pointer(artifact)); os.fsync(st.fd)
            graded.append(original); event('graded_directory_fsynced',original,counts=counts)
            return {'inner_rows':saved['inner_keys'],'outer_rows':saved['outer_keys'],
                'grading_receipt':{'origin':[year,original['week']],'synthetic_receipt_only':True},
                'counts':counts,'artifacts':{'synthetic_routing':st.pointer(artifact)}}
    real_pilot=r.pilot_projection
    def pilot(origins, ledger, suffix):
        value=real_pilot(origins,ledger,suffix)
        assert len(ledger['origins'])==53 and len(suffix)==224 and suffix==ORIGINS[53:]
        assert value['within_time_screen'] is True and value['failed_callback_count']==1
        event('real_pilot_screen',ORIGINS[52],remaining_origins=len(suffix))
        if reject_pilot: value={**value,'within_time_screen':False,'passed':False,'synthetic_forced_rejection':True}
        return value
    error=None
    try:
        with ExitStack() as stack:
            for obj,key,value in [(a,'forecast_inputs',forecast),(a,'StrictSelectionFeed',Feed),
                (b,'SplitTrajectoryBank',Bank),(f,'assemble_forecasts',assemble),(g,'PublishedOriginGrader',Grader),
                (c,'publish_origin',publish),(c,'validate_publication_binding',validate),(r,'pilot_projection',pilot)]:
                stack.enter_context(patch.object(obj,key,value))
            try: c._chronological_origins(context,store,manifest,manifest_sha,{},envelope,accounting,progress)
            except ValueError as exc:
                if not reject_pilot or str(exc)!='registered_pilot_cost_screen_failed': raise
                error=str(exc)
        expected=53 if reject_pilot else 277
        assert progress['completed_origins']==len(advanced)==len(published)==len(graded)==expected
        assert advanced==ORIGINS[:expected] and len(accounting.snapshot()['origins'])==expected
        assert sum(len(o['targetGameIds']) for o in advanced)==(800 if reject_pilot else 4175)
        assert ('origin-index.json' in store.index)==(not reject_pilot)
        if not reject_pilot:
            index=store.read_bound(store.pointer('origin-index.json'))
            assert len(index['origins'])==277 and index['counts']==progress['counts']
            assert progress['counts']['inner_rows']==98469 and progress['counts']['outer_rows']==64733
            assert len(selected)==13 and len(fed)==242
        assert all(o['season']!=2010 and o['season']!=2025 for o in fed)
        before_reentry=len(trace)
        try:
            with accounting.origin(ORIGINS[0]): pass
        except ValueError as exc: assert str(exc)=='nonchronological_or_nested_origin'
        else: raise AssertionError('accounting_reentry_accepted')
        assert len(trace)==before_reentry
        ledger=accounting.snapshot()
        save(ATTEMPT/(name+'-trace.json'),trace)
        save(ATTEMPT/(name+'-accounting.json'),ledger)
        save(ATTEMPT/(name+'-store-index.json'),store.index)
        return {'scenario':name,'status':'passed','expected_control_error':error,
            'completed_origins':expected,'games':sum(len(o['targetGameIds']) for o in advanced),
            'logical_dispatch_counts':progress['counts'],'selected_years':list(selected),
            'feed_origins':len(fed),'pilot_prefix':53,'pilot_suffix':224,
            'recorded_noop_callbacks':sum(len(o['callbacks']) for o in ledger['origins']),
            'store_path':str(store.path),'trace_events':len(trace),'accounting_reentry_refused':True}
    finally:
        if not (ATTEMPT/(name+'-trace.json')).exists(): save(ATTEMPT/(name+'-failed-trace.json'),trace)
        store.close()

report={'version':'rf02f.synthetic-chronology-qualification.v1','status':'failed',
    'scope':'actual_controller_loop_synthetic_dispatch_only','source_hashes':BEFORE,
    'script_sha256':SHA(Path(__file__).read_bytes()),'attempt_directory':str(ATTEMPT),
    'actual_scientific_calls':{'historical_admission':0,'fits':0,'scores':0,'cdf_calls':0,'bootstrap':0,'evaluate':0},
    'limitations':['Selector, source, model, assembly, publisher and grader are explicit routing spies.',
        'No-op callback timing and logical row counts are not scientific runtime or numerical qualification.',
        'Real Store file/readback/directory persistence and OriginAccounting are exercised; real publication lineage is outside this probe.',
        'Synthetic fixture uses the accepted complete plan generator; no historical archive is read.',
        'No terminal completion, external watchdog or historical run authorization is claimed.']}
try:
    report['scenarios']=[scenario('complete-pass'),scenario('pilot-stop',True)]
    after={name:SHA((ROOT/name).read_bytes()) for name in FILES}
    assert after==BEFORE, 'reviewed_source_changed_during_qualification'
    report.update(status='passed',source_hashes_unchanged=True)
except BaseException as exc:
    report['error']={'type':type(exc).__name__,'reason':str(exc),'traceback':traceback.format_exc()}
finally:
    report['elapsed_seconds']=time.monotonic()-START
    report['peak_rss_mib']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1024**2
    report['evidence']={str(path.relative_to(ATTEMPT)):{'sha256':SHA(path.read_bytes()),'bytes':path.stat().st_size}
        for path in ATTEMPT.glob('*.json')}
    save(ATTEMPT/'result.json',report)
    signal.setitimer(signal.ITIMER_REAL,0.)
print(json.dumps({'status':report['status'],'report':str(ATTEMPT/'result.json'),
                  'sha256':SHA((ATTEMPT/'result.json').read_bytes()),'seconds':report['elapsed_seconds'],
                  'peak_rss_mib':report['peak_rss_mib'],'error':report.get('error')},sort_keys=True))
sys.exit(0 if report['status']=='passed' else 1)
