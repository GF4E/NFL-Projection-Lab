"""Corrected E1 entry point. Original registration/candidates/gates remain immutable."""
import gzip,hashlib,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from scripts import e1_calendar_audit,e1_prepare,e1_evaluate
OUT=e1_calendar_audit.OUT
ORIGINAL=ROOT/'work/projection-governance-v2/e1/registration.json'

def load_corrected_inputs():
    receipt=json.loads((OUT/'correction-receipt.json').read_text())
    assert hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()==receipt['original_registration_file_sha256']
    completion=OUT/'completion-evidence.json'
    assert receipt.get('completion_evidence_sha256') and hashlib.sha256(completion.read_bytes()).hexdigest()==receipt['completion_evidence_sha256'], 'Completion evidence must be pinned before fitting'
    registration=json.loads(ORIGINAL.read_text())
    assert registration['sha256']==e1_evaluate.digest({k:v for k,v in registration.items() if k!='sha256'})
    for path,expected in receipt['implementation_hashes'].items():
        assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected,path
    # Unmodified registered inputs still match their original commitments.
    for path,expected in registration['file_hashes'].items():
        if path not in receipt['implementation_hashes']:
            assert hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==expected,path
    ref=json.loads((OUT/'features-ref.json').read_text());payload=(ROOT/ref['path']).read_bytes()
    assert hashlib.sha256(payload).hexdigest()==ref['sha256']
    rows=json.loads(gzip.decompress(payload))
    for values in rows.values():
        assert all(r['season']<=2025 and r.get('state_cutoff') and r.get('completed_at') for r in values)
        values.sort(key=lambda r:(r['season'],r['issuance_at'],r['row_id']))
    audit=json.loads((OUT/'calendar-audit.json').read_text());assert audit['status']=='PASS'
    return registration,rows

def run():
    audit=e1_calendar_audit.run()
    if audit['status']!='PASS':
        raise SystemExit('BLOCKED: full-history completion audit failed; no fit or comparative result created')
    if (OUT/'oof.json').exists():raise SystemExit('Preserve existing corrected run; do not overwrite comparison evidence')
    games=json.loads((OUT/'calendar-games.json').read_text())
    e1_prepare.run({g['game_id']:g for g in games},OUT)
    e1_evaluate.OUT=OUT;e1_evaluate.load_inputs=load_corrected_inputs
    e1_evaluate.run()

if __name__=='__main__':run()
