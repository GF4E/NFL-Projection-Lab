"""Fail closed unless a diagnostic/experiment names the authoritative control."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def verify(registration,root=ROOT):
 from scripts.accuracy_scope import validate
 validate(registration)
 catalog=json.loads((root/'work/series-registry/catalog.json').read_text());control=registration['control']
 if control!=catalog['authoritative_control'] or registration.get('authoritative') is not True:raise ValueError('Non-authoritative experiment control')
 entry=next(x for x in catalog['series'] if x['path']==control and x['authoritative'])
 if hashlib.sha256((root/control).read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Authoritative control hash mismatch')
 if not registration.get('generated_at'):raise ValueError('Control generation date required')
 return f"Premise: {control}; authoritative deployed lineage: yes; generated {registration['generated_at']}."
