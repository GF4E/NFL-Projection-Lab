import ast
import copy
import datetime as dt
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts import reference_lines as m
from scripts import reference_reports as reports
from scripts.reference_line_refresh import refresh

ROOT=m.ROOT

class ReferenceLinesTests(unittest.TestCase):
    def row(self, gid='2025_01_A_B', home=24., away=20., ah=27., aa=20.):
        return {'game_id':gid,'season':2025,'week':1,'home':home,'away':away,'actual_home':ah,'actual_away':aa}

    def refs(self):
        return {'CLOSE':{'spread':{'2025_01_A_B':3.},'total':{'2025_01_A_B':47.}},'OPEN':{'spread':{},'total':{}}}

    def test_push_missing_open_no_substitution_and_input_unchanged(self):
        rows=[self.row()];before=copy.deepcopy(rows)
        result=m.audit(m.normalize(rows),self.refs())['references']
        self.assertEqual(result['CLOSE']['spread']['pooled']['correct'],1)
        self.assertEqual(result['CLOSE']['total']['pooled']['pushes'],1)
        self.assertEqual(result['OPEN']['spread']['pooled']['line_available'],0)
        self.assertEqual(result['OPEN']['total']['pooled']['status'],'INSUFFICIENT')
        self.assertEqual(rows,before)

    def test_no_lean_and_full_precision_buckets(self):
        refs=self.refs();refs['CLOSE']['spread']['2025_01_A_B']=0
        result=m.audit(m.normalize([self.row(home=24.999)]),refs,include_buckets=True)
        self.assertIn('4',result['references']['CLOSE']['spread']['buckets'])
        result=m.audit(m.normalize([self.row(home=20.)]),refs)
        self.assertEqual(result['references']['CLOSE']['spread']['pooled']['no_lean'],1)

    def test_duplicate_games_fail(self):
        with self.assertRaises(ValueError):m.normalize([self.row(),self.row()])

    def test_team_rows_and_scored_targets_agree_with_game_rows(self):
        expected=m.normalize([self.row()])[0]
        teams=[{'game_id':expected['game_id'],'season':2025,'week':1,'home':side,'point':p,'actual':a} for side,p,a in [(True,24.,27.),(False,20.,20.)]]
        self.assertEqual(m.normalize(teams)[0],expected)
        scored=[{'game_id':expected['game_id'],'season':2025,'week':1,'target':target,'point':p,'actual':a} for target,p,a in [('team',24.,27.),('team',20.,20.),('margin',4.,7.),('total',44.,47.)]]
        self.assertEqual(m.normalize(scored)[0],expected)

    def test_reordering_changes_no_summary(self):
        rows=[self.row(),self.row(gid='2025_01_C_D')]
        self.assertEqual(m.audit(m.normalize(rows),self.refs()),m.audit(m.normalize(rows[::-1]),self.refs()))

    def test_real_reproduction_and_revised_tolerance(self):
        refs,_=m.load_references();catalog=m.read(ROOT/'work/series-registry/catalog.json')
        current=m.audit(m.normalize(m.read(ROOT/catalog['authoritative_control'])),refs,include_buckets=True)
        close=current['references']['CLOSE']
        self.assertEqual((close['spread']['pooled']['correct'],close['spread']['pooled']['games']),(1301,2574))
        self.assertEqual((close['total']['pooled']['correct'],close['total']['pooled']['games']),(1285,2618))
        self.assertLess(abs(close['spread']['pooled']['rate']-1302/2574),.005)
        for k,w,n in [('4',113,256),('5',86,152)]:
            b=close['spread']['buckets'][k]
            self.assertLessEqual(abs(b['rate']-w/n),max(.01,1/n,1/b['games']))
        op=current['references']['OPEN']
        self.assertEqual(op['spread']['pooled']['correct'],577)
        self.assertEqual(op['spread']['pooled']['games'],1151)
        self.assertEqual(op['spread']['coverage_2021_forward']['line_available'],1177)
        self.assertEqual(op['spread']['coverage_2021_forward']['population'],1359)
        self.assertEqual(op['total']['coverage_2021_forward']['line_available'],466)
        self.assertEqual(op['total']['pooled']['status'],'INSUFFICIENT')

    def test_open_files_separate_sign_and_coverage(self):
        refs,source=m.load_references()
        self.assertIn('historic_projected_spreads',source['OPEN']['spread']['path'])
        self.assertIn('nfelo_games',source['OPEN']['total']['path'])
        self.assertEqual(source['OPEN']['spread']['sign_to_home_margin'],-1)
        catalog=m.read(ROOT/'work/series-registry/catalog.json')
        eligible={r['game_id'] for r in m.read(ROOT/catalog['authoritative_control'])}
        self.assertFalse(any(g.startswith('2023') for g in set(refs['OPEN']['total']) & eligible))

    def test_weekly_uses_original_projection_not_edit_and_separates_lineages(self):
        g={'game_id':'2025_01_A_B','season':2025,'week':1,'version':'v1','evidence':'AS_ISSUED','freeze_time':'2025-01-01',
           'projection':{'home_points':24.,'away_points':20.},'ours':{'home_points':100.,'away_points':0.},
           'grades':{'PROJECTION':{'actual':{'home_points':27.,'away_points':20.}}}}
        r=copy.deepcopy(g);r['game_id']='2025_01_C_D';r['evidence']='RETROSPECTIVE';r['version']='v0'
        with patch.object(m,'load_references',return_value=(self.refs(),{})):
            report=m.weekly_report([g,r]);self.assertEqual(len(report['series']),2)
            issued=report['series']['AS_ISSUED / v1']['audit'];self.assertEqual(issued['team_mae'],1.5)
            self.assertEqual(issued['references']['CLOSE']['spread']['pooled']['correct'],1)
            text=m.render(report,weekly=True)
            self.assertIn('2025',text);self.assertIn('1/1',text);self.assertIn('INSUFFICIENT',text)
            self.assertEqual(len(text.splitlines()),2);self.assertEqual(text.count('DIAGNOSTIC ONLY'),2)
            self.assertNotIn('<table',text);self.assertNotIn('break-even',text)

    def test_reporting_never_imported_into_projection_modules(self):
        paths=list((ROOT/'engine/projection').rglob('*.py'))+list((ROOT/'engine/projection_v3').rglob('*.py'))+list((ROOT/'engine/forecast_system').rglob('*.py'))+[ROOT/'engine/elo.py',ROOT/'engine/elo_hfa.py']
        for p in paths:
            source=p.read_text();tree=ast.parse(source)
            for node in ast.walk(tree):
                if isinstance(node,(ast.Import,ast.ImportFrom)):
                    names=[a.name for a in node.names]+[getattr(node,'module','') or '']
                    self.assertFalse(any('reference_lines' in x or 'reference_reports' in x or 'reference_line_refresh' in x for x in names),str(p))
            self.assertNotIn('home_line_open',source,str(p));self.assertNotIn('total_line_open',source,str(p))

    def test_finalizer_preserves_closing_confidence_and_writes_appendix(self):
        report={'series':{'candidate':{'identity':'fixture','audit':m.audit(m.normalize([self.row()]),self.refs())}}}
        with tempfile.TemporaryDirectory() as d,patch.object(reports,'experiment_audit',return_value=report):
            p=Path(d)/'REPORT.md';reports.report_file(p).write_text('Result\n\nConfidence: high — fixture.\n')
            self.assertTrue(p.read_text().endswith('Confidence: high — fixture.\n'))
            self.assertIn(reports.MARKER,p.read_text());self.assertTrue(p.with_name('REPORT-reference-lines.json').exists())

    def test_refresh_failure_preserves_last_good_and_daily_idempotence(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);out=root/'outputs/in-season-learning-v1/reference-sources';out.mkdir(parents=True)
            p=out/'receipts.json';p.write_text('[]');before=p.read_bytes();now=dt.datetime(2026,9,20,tzinfo=dt.timezone.utc)
            def fail(url):raise OSError('offline')
            result=refresh(root,now,fail);self.assertEqual(result['state'],'LAST_GOOD_RETAINED');self.assertEqual(p.read_bytes(),before)
            self.assertEqual(refresh(root,now,lambda u:self.fail('same-day repeated fetch')),result)

    def test_staged_report_requires_audit(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);subprocess.run(['git','init','-q',str(root)],check=True)
            p=root/'work/e-fixture/REPORT.md';p.parent.mkdir(parents=True);p.write_text('Result')
            subprocess.run(['git','add','.'],cwd=root,check=True)
            with self.assertRaises(RuntimeError):reports.validate_staged_reports(root)
            p.with_name('REPORT-reference-lines.md').write_text('audit');p.with_name('REPORT-reference-lines.json').write_text(json.dumps({'schema':'reference-lines-report-v1','series':{'fixture':{'shortfall':'No candidate forecasts yet'}}}))
            subprocess.run(['git','add','.'],cwd=root,check=True);reports.validate_staged_reports(root)

if __name__=='__main__':unittest.main()
