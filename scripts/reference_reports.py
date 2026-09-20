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
    refs,sources=load_references(root)
    catalog=read(root/'work/series-registry/catalog.json')
    records=[e for e in catalog['series'] if (root/e['path']).parent==folder]
    manifest=folder/'reference-series.json'
    if manifest.exists():
        records += [e for e in read(manifest) if e not in records]
    if not records and not series and (folder/'oof.json').exists():
        raise ValueError('Register saved candidate series before publishing report: '+str(folder))
    result={'schema':'reference-lines-report-v1','sources':sources,'series':{}}
    # The live baseline is explicit context, never substituted for an experiment candidate.
    current=next(e for e in catalog['series'] if e['path']==catalog['authoritative_control'] and e['authoritative'])
    if current not in records:records.insert(0,current)
    for entry in records:
        path=root/entry['path']
        if sha(path)!=entry['sha256']:raise ValueError('Series hash changed: '+entry['path'])
        raw=read(path);component=entry.get('component') or 'series/point'
        if isinstance(raw,dict):
            name,_,point=component.partition('/')
            rows=raw[name];point=point or 'point'
        else:
            rows=raw;point=component.split('/')[-1]
            if point=='hfa' and rows and 'actual_home' in rows[0]:point='point'
        rows=[r for r in rows if 2016<=int(r.get('season',0))<=2025]
        canonical=normalize(rows,point)
        live=entry['path']==catalog['authoritative_control']
        historical='6a0238fc' in entry['path']
        scope='CURRENT HFA — live audit figure' if live else 'PRE-HFA — authoritative historical lineage' if historical else entry['status']+' — experiment evidence, not current production'
        label=Path(entry['path']).name+' / '+component
        result['series'][label]={'identity':scope+'; '+entry['path']+'; SHA256 '+entry['sha256'],
                                 'audit':audit(canonical,refs)}
    for name,rows in (series or {}).items():
        result['series'][name]={'identity':'Experiment candidate supplied by report producer', 'audit':audit(normalize(rows),refs)}
    if not records or (len(records)==1 and records[0]==current and folder!=(root/current['path']).parent and not series):
        result['series']['Experiment-specific forecast shortfall']={'shortfall':'No registered game-level forecast series in this report directory. Candidate ATS/total cannot be computed; register its saved predictions or pass series to report_file. The current HFA table above is baseline context only, not a result for this experiment.'}
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
