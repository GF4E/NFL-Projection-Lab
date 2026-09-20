"""Standing report finalizer and frozen-report appendices; no fit imports."""
import argparse
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from scripts.reference_lines import audit, load_references, normalize, read, render, sha
MARKER='<!-- standing-reference-lines-v1 -->'
END_MARKER='<!-- /standing-reference-lines-v1 -->'


def experiment_audit(folder, root=ROOT, series=None):
    """Report the deployed model only; never score experiment candidates on a line."""
    catalog=read(root/'work/series-registry/catalog.json')
    current=next(e for e in catalog['series'] if e['path']==catalog['authoritative_control'] and e['authoritative'])
    result={'schema':'reference-lines-report-v1','label':'DIAGNOSTIC ONLY',
            'scope':'Deployed model context only; supplied experiment candidates are not market-scored',
            'sources':{},'series':{}}
    try:
        refs,sources=load_references(root)
        path=root/current['path']
        if sha(path)!=current['sha256']:raise ValueError('Deployed diagnostic series hash mismatch')
        rows=normalize(read(path))
        result['sources']=sources
        result['series']['current HFA']={'identity':'CURRENT HFA — DIAGNOSTIC ONLY; '+current['path']+'; SHA256 '+current['sha256'],
                                        'audit':audit(rows,refs)}
    except (OSError,ValueError,KeyError) as exc:
        # Missing diagnostic evidence cannot gate or block the accuracy report.
        result['shortfall']='Reference diagnostic source missing or unverified ('+type(exc).__name__+')'
        result['series']['diagnostic shortfall']={'shortfall':result['shortfall']}
    return result


def appendix(report_path, root=ROOT, series=None):
    value=experiment_audit(report_path.parent,root,series)
    stem=report_path.stem+'-reference-lines'
    jsonpath=report_path.with_name(stem+'.json');mdpath=report_path.with_name(stem+'.md')
    jsonpath.write_text(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n')
    mdpath.write_text(render(value))
    return value,mdpath,jsonpath


class ReportFile:
    def __init__(self,path,root=ROOT,series=None):
        self.path=Path(path);self.root=root;self.series=series

    def write_text(self,text,**kwargs):
        # Preserve the author's closing confidence statement as the last paragraph.
        _,mdpath,_=appendix(self.path,self.root,self.series)
        body=text
        if MARKER in body:
            prefix,tail=body.split(MARKER,1)
            body=prefix+(tail.split(END_MARKER,1)[1] if END_MARKER in tail else '')
        body=body.rstrip()
        confidence=''
        pos=body.rfind('\nConfidence:')
        if pos>=0:body,confidence=body[:pos],body[pos:]
        addition='\n\n'+MARKER+'\n\n'+mdpath.read_text()+'\n'+END_MARKER+'\n'
        return self.path.write_text(body+addition+confidence+'\n',**kwargs)


def report_file(path, root=ROOT, series=None):
    return ReportFile(path,root,series)


def frozen_appendices(root=ROOT):
    paths=sorted(p for p in (root/'work').rglob('*.md') if 'report' in p.name.lower() and 'reference-lines' not in p.name.lower())
    index=[]
    for p in paths:
        before=sha(p)
        _,mdpath,jpath=appendix(p,root)
        assert sha(p)==before,'Frozen report modified'
        index.append({'report':str(p.relative_to(root)),'report_sha256':before,
                      'appendix':str(mdpath.relative_to(root)),'data':str(jpath.relative_to(root))})
    out=root/'work/reference-line-metric-v2';out.mkdir(exist_ok=True)
    (out/'experiment-report-index.json').write_text(json.dumps(index,indent=2)+'\n')
    return index


def validate_staged_reports(root=ROOT):
    """A report cannot be committed without its audit appendix (never a method gate)."""
    import subprocess
    changed=subprocess.check_output(['git','diff','--cached','--name-only','--diff-filter=AM'],cwd=root,text=True).splitlines()
    for name in changed:
        p=Path(name)
        if not name.startswith('work/') or p.suffix!='.md' or 'report' not in p.name.lower() or 'reference-lines' in p.name.lower():continue
        md=p.with_name(p.stem+'-reference-lines.md');js=p.with_name(p.stem+'-reference-lines.json')
        for sidecar in [md,js]:
            exists=subprocess.run(['git','cat-file','-e',':'+str(sidecar)],cwd=root,capture_output=True).returncode==0
            if not exists:raise RuntimeError('Standing audit appendix required: '+name+'; run scripts/reference_reports.py --report '+name)
        value=json.loads(subprocess.check_output(['git','show',':'+str(js)],cwd=root))
        if value.get('schema')!='reference-lines-report-v1' or not value.get('series'):
            raise RuntimeError('Invalid standing audit appendix: '+name)
        for item in value['series'].values():
            if not item.get('shortfall') and not (item.get('audit',{}).get('reporting_only') and item['audit'].get('never_a_gate')):
                raise RuntimeError('Audit data or named shortfall required: '+name)


def main():
    p=argparse.ArgumentParser();p.add_argument('--all-frozen',action='store_true');p.add_argument('--report');args=p.parse_args()
    if args.all_frozen:print(json.dumps(frozen_appendices()))
    elif args.report:appendix(ROOT/args.report)
    else:p.error('Use --all-frozen or --report')
if __name__=='__main__':main()
