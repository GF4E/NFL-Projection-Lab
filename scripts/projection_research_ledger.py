"""Explicit retained trial/exposure audit; never invokes numerical or release code."""
import argparse
import json
from pathlib import Path
import sys
import subprocess
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from engine.projection import research_ledger as ledger


def main():
    p=argparse.ArgumentParser();p.add_argument('--root',type=Path,default=ROOT)
    sub=p.add_subparsers(dest='mode',required=True)
    q=sub.add_parser('record');q.add_argument('--request',type=Path,required=True)
    q=sub.add_parser('import');q.add_argument('--manifest',type=Path,required=True)
    sub.add_parser('inventory');a=p.parse_args()
    if a.mode=='record':value=ledger.record(a.root,**json.loads(a.request.read_bytes()))
    elif a.mode=='import':
        m=json.loads(a.manifest.read_bytes())
        if m['schema']!='research-document-import-v1':raise ValueError('Explicit import manifest required')
        import re
        if not re.fullmatch('[0-9a-f]{40}',m['source_commit']):raise ValueError('Pinned source commit required')
        # Verify the declared Git revision, not just the current worktree.
        for r in m['documents']:
            current=ledger.path(a.root,r['path']).read_bytes()
            retained=subprocess.check_output(['git','-C',str(a.root),'show',m['source_commit']+':'+r['path']])
            if current!=retained or ledger.sha(retained)!=r['sha256']:raise ValueError('Import differs from pinned Git evidence')
        value=[]
        for r in m['documents']:
            value.append(ledger.record(a.root,key=f'import/{m["source_commit"]}/{r["path"]}',
                kind='DOCUMENT_IMPORTED',experiment=r['experiment'],
                evidence=[{'path':r['path'],'sha256':r['sha256']}],
                context={'source_commit':m['source_commit'],'evidence_class':'RETROSPECTIVE_DOCUMENT_IMPORT',
                         'original_predeclaration':'NOT_ESTABLISHED_BY_IMPORT','past_human_viewing':'UNKNOWN'}))
    else:value=ledger.inventory(a.root)
    print(json.dumps(value,sort_keys=True,indent=2))

if __name__=='__main__':main()
