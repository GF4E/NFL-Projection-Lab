"""Metamorphic source-to-forecast checks, not a scientific release gate."""
import copy
import datetime as dt
import unittest
from engine.projection import cutoff_features as cf, cutoff_pipeline as cp
from engine.projection.distribution import summarize
from engine.projection_v3.qualify import Study, prior_shapes
from engine.forecast_system.calendar import schedule_kickoff
from engine.forecast_system.cadence import cutoff_before
from test_projection_cutoff_features import game, stats


def sources():
    games=[];rows=[]
    for year in range(2014,2026):
        first=dt.date(year,9,1)
        first+=dt.timedelta(days=(6-first.weekday())%7)
        for week in range(1,5):
            gid=f'{year}_{week}'
            g=game(gid,str(first+dt.timedelta(weeks=week-1)),week,year,
                   home='BAL' if week%2 else 'BUF',away='BUF' if week%2 else 'BAL')
            g.update(home_score=float(13+(year+week*3)%24),away_score=float(10+(year*2+week)%25),source_hash='a'*64)
            games.append(g)
            for i,r in enumerate(stats(g)):
                r.update(source_hash='b'*64,drives=9.+week%3,plays_per_drive=5.+i*.4,
                         off_ppd=1.3+(year%5)*.17+week*.11+i*.2,
                         off_ypp=4.+week*.3+i*.7,pass_epa=.03*week-i*.08,
                         cpoe=.01*(year%4)-i*.02)
                rows.append(r)
    return games,rows


def prepared_sources(games,rows,half_life=None):
    built=cf.build(rows,games,{'stadiums':[]},mode='HISTORICAL_RECONSTRUCTION',half_life=half_life)
    # Production refit consumes retained pregame rows, not reconstructed postgame features.
    retained=[]
    for row in built['rows']:
        r=copy.deepcopy(row)
        r['state_lineage'].update(role='HISTORICAL_RECONSTRUCTION',prepared_at=cp.time_of(r['game']).isoformat())
        retained.append(r)
    return retained


def common_forecast(games,rows,target_id='2019_1'):
    history=prepared_sources(games,rows)
    target=next(g for g in games if g['game_id']==target_id)
    issue=cp.time_of(target);cut=cutoff_before(issue)
    labels={g['game_id']:{'home_points':g['home_score'],'away_points':g['away_score'],
                         'kickoff_at':schedule_kickoff(g['gameday'],g['gametime']).isoformat(),
                         'available_at':(schedule_kickoff(g['gameday'],g['gametime'])+dt.timedelta(hours=4)).isoformat()}
            for g in games}
    # Sunday target: Friday state; prior Tuesday is the season-initial fit cutoff.
    fit_at=cut-dt.timedelta(days=3)
    closed={'state':'PUBLISHED','season':target['season']-1,'week':4,'published_at':fit_at.isoformat(),
            'evidence':'SIMULATED_HISTORICAL_CLOSEOUT'}
    parent={'groups':['calibration','elo'],'selected':['none',10],'inactive':[],
            'fit':{'training_hash':'c'*64},'shapes':None}
    fitted=cp.refit(history,labels,parent,cutoff=fit_at,through_season=target['season']-1,through_week=4,closeout=closed)
    available=[g for g in games if schedule_kickoff(g['gameday'],g['gametime'])+dt.timedelta(hours=4)<cut]
    state=cf.reconstruct(available,{g['game_id']:[r for r in rows if r['game_id']==g['game_id']] for g in available})
    context={'cutoff_at':cut.isoformat(),'state_sha256':state.identity(),'source_availability':'HISTORICAL_AVAILABILITY_ASSUMED'}
    dto={k:target.get(k) for k in cf.GAME_FIELDS}
    prepared=cp.prepare(state,context,[dto],{'stadiums':[]},at=issue,role='HISTORICAL_RECONSTRUCTION')
    retained={r['row_id']:r['features'] for r in history if r['game_id']==target_id}
    assert retained=={r['row_id']:r['features'] for r in prepared['rows']}
    return fitted,prepared,cp.score(prepared,fitted)[target_id]


def study(games,rows):
    labels={g['game_id']:g for g in games};prepared={}
    for key,decay in [('none',None),('8',8)]:
        prepared[key]=[]
        for r in prepared_sources(games,rows,decay):
            if r['features']['baseline'] is None:continue
            r['actual_points']=labels[r['game_id']]['home_score' if r['home'] else 'away_score']
            prepared[key].append(r)
    return Study(prepared).evaluate(['calibration','elo'])


def perturb(games,rows,from_year):
    gs=copy.deepcopy(games);rs=copy.deepcopy(rows)
    for g in gs:
        if g['season']>=from_year:g.update(home_score=99.,away_score=0.)
    for r in rs:
        if r['season']>=from_year:
            r.update(off_ppd=9.,off_ypp=19.,drives=20.,plays_per_drive=10.,pass_epa=2.,cpoe=.99)
    return gs,rs


class FullPipelineLeakageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.games,cls.rows=sources()
        cls.original=common_forecast(cls.games,cls.rows)
        cls.historical=study(cls.games,cls.rows)

    def test_target_and_future_source_changes_preserve_full_point_path(self):
        for year in range(2016,2026):
            target=f'{year}_1'
            original=common_forecast(self.games,self.rows,target)
            games,rows=perturb(self.games,self.rows,year)
            for kind,gs,rs in [('labels',games,self.rows),('statistics',self.games,rows),('both',games,rows)]:
                with self.subTest(year=year,kind=kind):
                    # Includes ridge means/scales/coefficients, features and contributions.
                    self.assertEqual(common_forecast(gs,rs,target),original)

    def test_complete_source_reordering_preserves_full_point_path(self):
        self.assertEqual(common_forecast(self.games[::-1],self.rows[::-1]),self.original)

    def test_eligible_past_change_moves_forecast_positive_control(self):
        games=copy.deepcopy(self.games);rows=copy.deepcopy(self.rows)
        next(g for g in games if g['game_id']=='2018_4')['home_score']=70.
        for r in rows:
            if r['game_id']=='2018_4':r['off_ppd']=7.
        changed=common_forecast(games,rows)
        self.assertNotEqual(changed[0]['fit'],self.original[0]['fit'])
        self.assertNotEqual(changed[2]['projection'],self.original[2]['projection'])

    def test_inner_selection_and_prior_calibration_ignore_future_source_changes(self):
        for year in range(2016,2026):
            with self.subTest(year=year):
                changed=study(*perturb(self.games,self.rows,year))
                earlier=lambda result:[r for r in result['predictions'] if r['season']<year]
                self.assertEqual(earlier(changed),earlier(self.historical))
                self.assertEqual(changed['settings'][str(year)],self.historical['settings'][str(year)])
                target=lambda result:next(r for r in result['predictions'] if r['game_id']==f'{year}_1')
                for side in ('home','away'):
                    self.assertEqual(target(changed)[side],target(self.historical)[side])
                a=prior_shapes(self.historical['predictions'],year)
                b=prior_shapes(changed['predictions'],year)
                self.assertEqual(a,b)
                if year==2016:
                    self.assertIsNone(a)  # No fabricated first-fold calibration history.
                else:
                    p=target(self.historical)
                    self.assertEqual(summarize(p['away'],p['home'],a),summarize(p['away'],p['home'],b))
                # The changed data were consumed later; the untouched checks are not vacuous.
                self.assertNotEqual(changed['predictions'],self.historical['predictions'])

    def test_forecast_label_and_borrowed_historical_calibration_are_rejected(self):
        fitted,prepared,_=self.original
        with self.assertRaisesRegex(ValueError,'Historical calibration'):
            cp.score(prepared,fitted,prior_shapes(self.historical['predictions'],2019))
        bad=copy.deepcopy(prepared);bad['rows'][0]['actual_points']=999.
        with self.assertRaises(ValueError):cp.score(bad,fitted)


# Recorded-availability path: a late revision is a new fact, never a rewritten past.
import test_projection_cutoff_pipeline as live_helpers
from test_projection_cutoff_state import statistics as recorded_statistics, MONDAY
from engine.projection import cutoff_state as cs

class RecordedBase(live_helpers.PipelineTests):
    pass
for _name in dir(live_helpers.PipelineTests):
    if _name.startswith('test_'):setattr(RecordedBase,_name,None)

class RecordedRevisionLeakageTests(RecordedBase):
    def test_late_revision_changes_next_state_not_original_forecast(self):
        self.seed()
        prepared=self.prepared()
        prep_ref=cp.store(self.root,'preparations',prepared)
        before=cp.recorded_scores(self.root,prep_ref,self.fit_ref)
        original=cp.load(self.root,before['sun'],'forecasts')
        revised=copy.deepcopy(self.g);revised['home_score']=70.
        revised_stats=recorded_statistics(revised)
        revised_stats[0]['off_ppd']=7.
        self.capture([revised,self.target],revised_stats,at='2026-09-14T12:00:00Z')
        later=self.advance(MONDAY)
        self.assertNotEqual(cs.read(self.root,later)['state_sha256'],prepared['state']['state_sha256'])
        self.assertEqual(len(cs.read(self.root,later)['revised_finals']),1)
        self.assertEqual(len(cs.read(self.root,later)['revised_statistics']),1)
        self.assertEqual(self.prepared(),prepared)
        self.assertEqual(cp.recorded_scores(self.root,prep_ref,self.fit_ref),before)
        self.assertEqual(cp.load(self.root,before['sun'],'forecasts'),original)

if __name__=='__main__':unittest.main()
