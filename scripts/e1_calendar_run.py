"""Corrected E1 entry point. Original registration/candidates/gates remain immutable."""
import gzip,hashlib,json,sys,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts import e1_calendar_audit,e1_prepare,e1_evaluate
from scripts.e1_protocol import validate_addendum,validate_population
OUT=e1_calendar_audit.OUT
ORIGINAL=ROOT/'work/projection-governance-v2/e1/registration.json'

def load_corrected_inputs():
    receipt=json.loads((OUT/'correction-receipt.json').read_text())
    assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==receipt['original_registration_file_sha256']
    policy=OUT/'availability-convention.json'
    assert hashlib.sha256(policy.read_bytes()).hexdigest()==receipt['availability_convention_file_sha256'], 'Availability convention must be pinned before fitting'
    registration=json.loads(ORIGINAL.read_text())
    assert registration['sha256']==e1_evaluate.digest({k:v for k,v in registration.items() if k!='sha256'})
    addendum=json.loads((OUT/'preregistration-addendum.json').read_text())
    validate_addendum(addendum,registration,receipt['preregistration_addendum_sha256'])
    for path,expected in receipt['implementation_hashes'].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected,path
    # Unmodified registered inputs still match their original commitments.
    for path,expected in registration['file_hashes'].items():
        if path not in receipt['implementation_hashes']:
            assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected,path
    ref=json.loads((OUT/'features-ref.json').read_text());payload=(ROOT/ref['path']).read_bytes()
    assert hashlib.sha256(payload).hexdigest()==ref['sha256']
    rows=json.loads(gzip.decompress(payload))
    expected=json.loads((OUT/'registered-population.json').read_text())['game_ids']
    for values in rows.values():
        validate_population(values,expected)
        assert all(r['season']<=2025 and r.get('state_cutoff') and r.get('assimilation_available_at') for r in values)
        values.sort(key=lambda r:(r['season'],r['issuance_at'],r['row_id']))
    audit=json.loads((OUT/'calendar-audit.json').read_text());assert audit['status']=='PASS'
    return registration,rows

def run():
    audit=e1_calendar_audit.run()
    if audit['status']!='PASS':
        raise SystemExit('BLOCKED: full-history availability audit failed; no fit or comparative result created')
    if (OUT/'oof.json').exists():raise SystemExit('Preserve existing corrected run; do not overwrite comparison evidence')
    games=json.loads((OUT/'calendar-games.json').read_text())
    e1_prepare.run({g['game_id']:g for g in games},OUT)
    e1_evaluate.OUT=OUT;e1_evaluate.load_inputs=load_corrected_inputs
    # Import dependents after binding the corrected evaluator, and explicitly
    # rebind them so prior imports cannot leave a legacy output directory cached.
    from scripts import e1_current,e1_cache_states,e1_report,e1_figures,e1_audit
    for module in (e1_current,e1_cache_states):
        module.OUT=OUT;module.load_inputs=load_corrected_inputs;module.save=e1_evaluate.save
    for module in (e1_report,e1_figures,e1_audit):module.OUT=OUT
    for name in ('registration.json','as-issued-board-snapshot.json'):
        shutil.copyfile(ORIGINAL.parent/name,OUT/name)
    staff_path=ROOT/'config/staff_history.json';staff=json.loads(staff_path.read_text())
    coverage=json.loads((ORIGINAL.parent/'staff-coverage.json').read_text())
    coverage['sha256']=hashlib.sha256(staff_path.read_bytes()).hexdigest()
    coverage['transition_policy']=staff['flag_rule']
    e1_evaluate.save('staff-coverage.json',coverage)
    e1_evaluate.run()
    e1_current.run();e1_cache_states.run()
    raw=(OUT/'verified-games.json').read_bytes();compressed=gzip.compress(raw,mtime=0)
    artifact=OUT/'verified-games.json.gz';artifact.write_bytes(compressed)
    e1_evaluate.save('verified-games-ref.json',dict(path=str(artifact.relative_to(ROOT)),sha256=hashlib.sha256(compressed).hexdigest(),uncompressed_sha256=hashlib.sha256(raw).hexdigest()))
    # Numerical output is not a valid E1 result until independent checks finish.
    e1_audit.run()
    e1_evaluate.save('validity.json',dict(valid_e1_result=True,state='FIRST_VALID_E1_RESULT',original_run_preserved='../e1-week-label-run'))
    e1_figures.run();e1_report.run()

if __name__=='__main__':run()
