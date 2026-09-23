"""Synthetic numerical qualification, independent of a real E-CAL result."""
import copy
import unittest
from unittest.mock import patch
from engine.projection import calibration_evaluate as e, calibration_admission as a
from engine.projection.model import hash_value
from engine.projection.distribution import pmf


def fixture():
    roles={};methods={'own':{'sha256':'a'*64},'legacy':{'sha256':'b'*64}}
    for role in ('own','legacy'):
        method=methods[role]['sha256'];fits={};rows=[]
        for year in (2014,2015,2016,2017):
            manifest={'method_sha256':method,'available_at':f'{year}-08-01T00:00:00Z',
                'last_label_available_at':f'{year}-01-01T00:00:00Z','training_game_ids':['earlier']}
            sha=hash_value(manifest);fits[sha]=manifest
            dates=[('09-11',1),('11-13',10)] if year==2016 else [('09-10',1)]
            for date,week in dates:
                rows.append({'game_id':f'{year}_{week}','season':year,'home':20.25,'away':19.5,
                    'actual_home':24 if year%2==0 else 17,'actual_away':21 if week==1 else 14,
                    'issuance_at':f'{year}-{date}T16:45:00Z','label_available_at':f'{year}-{date}T23:00:00Z',
                    'fit_evidence_sha256':sha})
        roles[role]={'history':rows,'fits':fits}
    control=[{k:r[k] for k in ('game_id','season','home','away','actual_home','actual_away')}
             for r in roles['own']['history'] if r['season']>=2016]
    inputs={'methods':methods,'roles':roles,'evaluation_game_ids':[r['game_id'] for r in control],
        'folds':[{'season':year,'expected_game_ids':[r['game_id'] for r in roles['own']['history'] if r['season']<year],
                  'offseason_planned_at':f'{year}-08-30T14:00:00Z','week9_planned_at':f'{year}-11-01T14:00:00Z',
                  'current_season_excluded':True} for year in (2016,2017)]}
    inputs['evaluation_game_ids'].sort()
    registration={'point_tolerance':1e-12,'uncertainty':copy.deepcopy(a.UNCERTAINTY),'sha256':'c'*64,
                  'inputs':{'path':'synthetic.json','sha256':'d'*64},'baseline_hash':'e'*64}
    return {'state':'ADMITTED_TO_CALIBRATION_FITTING','inputs':inputs,'registration':registration,'control':control},\
           {r['game_id']:int(r['game_id'].split('_')[1]) for r in control}


class NumericalTests(unittest.TestCase):
    def test_points_invariance_counts_and_identical_arms(self):
        admitted,weeks=fixture();original=copy.deepcopy(admitted);result=e.numerical(admitted,weeks)
        self.assertEqual(admitted,original);self.assertEqual(result['pooled']['control'],result['pooled']['candidate'])
        self.assertEqual(result['pooled']['control']['team']['n'],6)
        self.assertEqual(result['pooled']['control']['margin']['n'],3)
        self.assertEqual(len(result['banks']),8)
        self.assertEqual(len(result['weekly']),3)
        for row in result['numerical_gate_evidence']['point_forecasts']:
            self.assertEqual(row['before'],row['after'])
            self.assertEqual(row['before']['home'],20.25)
        self.assertEqual(result['uncertainty']['paired_games'],{'lower95':0.,'upper95':0.})
        self.assertEqual(result['uncertainty']['whole_seasons']['seasons'],2)
        self.assertIn('TEAM_CRPS_GATE',result['numerical_gate_reasons'])
        self.assertEqual(result['release_eligibility'],'NOT_ASSESSED');self.assertFalse(result['activates_method'])

    def test_all_crps_and_interval_scores_match_independent_finite_sum_arithmetic(self):
        result=e.numerical(*fixture())
        for record in result['records']:
            for arm,forecast in record['forecasts'].items():
                bank=result['banks'][forecast['calibration_sha256']]
                for target,shape in [('team','team_points'),('margin','margin'),('total','total')]:
                    for scored in record['scores'][arm][target]:
                        mass=pmf(bank['shapes'][shape],scored['point']);actual=scored['actual']
                        expected=sum(p*abs(x-actual) for x,p in mass.items())-.5*sum(
                            px*py*abs(x-y) for x,px in mass.items() for y,py in mass.items())
                        self.assertAlmostEqual(scored['crps'],expected,places=12)
                        for level in ('50','80'):
                            s=scored[level];alpha=1-int(level)/100
                            winkler=s['upper']-s['lower']+2/alpha*(max(s['lower']-actual,0)+max(actual-s['upper'],0))
                            self.assertAlmostEqual(s['interval_score'],winkler,places=12)
                            self.assertEqual(s['hit'],s['lower']<=actual<=s['upper'])

    def test_fractional_errors_and_team_weighting(self):
        result=e.numerical(*fixture());scores=result['pooled']['candidate']
        rows=[s for r in result['records'] for s in r['scores']['candidate']['team']]
        self.assertAlmostEqual(scores['team']['mae'],sum(abs(s['point']-s['actual']) for s in rows)/6)
        self.assertEqual(scores['team']['50']['hits'],sum(s['50']['hit'] for s in rows))
        self.assertEqual(sum(scores['team']['pit_counts']),6)
        self.assertEqual(sum(b['n'] for b in scores['winner']['reliability']),3)
        self.assertEqual(result['records'][0]['scores']['candidate']['team'][0]['absolute_error'],3.75)

    def test_week9_uses_new_identity_same_prior_pool(self):
        result=e.numerical(*fixture())
        first=result['records'][0]['forecasts']['candidate'];late=result['records'][1]['forecasts']['candidate']
        a_bank=result['banks'][first['calibration_sha256']];b_bank=result['banks'][late['calibration_sha256']]
        self.assertEqual(a_bank['cadence'],'OFFSEASON');self.assertEqual(b_bank['cadence'],'WEEK9')
        self.assertEqual(a_bank['shapes'],b_bank['shapes'])
        self.assertNotEqual(a_bank['sha256'],b_bank['sha256'])
        admitted,weeks=fixture()
        for role in ('own','legacy'):
            row=next(r for r in admitted['inputs']['roles'][role]['history'] if r['game_id']=='2016_10')
            row['issuance_at']='2016-11-01T14:00:00Z'
        result=e.numerical(admitted,weeks)
        late=result['records'][1]['forecasts']['candidate']
        self.assertEqual(result['banks'][late['calibration_sha256']]['cadence'],'OFFSEASON')

    def test_future_outcomes_never_change_earlier_distributions(self):
        admitted,weeks=fixture();original=e.numerical(admitted,weeks)
        for g in admitted['control']:
            if g['season']==2017:g['actual_home']=99
        for role in ('own','legacy'):
            for g in admitted['inputs']['roles'][role]['history']:
                if g['season']==2017:g['actual_home']=99
        changed=e.numerical(admitted,weeks)
        self.assertEqual(original['banks'],changed['banks'])
        self.assertEqual([r['forecasts'] for r in original['records']],[r['forecasts'] for r in changed['records']])
        self.assertNotEqual(original['pooled'],changed['pooled'])

    def test_current_season_labels_cannot_enter_week9_calibration(self):
        admitted,weeks=fixture();original=e.numerical(admitted,weeks)
        for source in admitted['inputs']['roles'].values():
            next(g for g in source['history'] if g['game_id']=='2016_1')['actual_home']=99
        admitted['control'][0]['actual_home']=99
        changed=e.numerical(admitted,weeks)
        for old,new in zip(original['records'],changed['records']):
            if old['season']==2016:self.assertEqual(old['forecasts'],new['forecasts'])
        self.assertNotEqual(original['records'][-1]['forecasts'],changed['records'][-1]['forecasts'])

    def test_reordering_sources_folds_and_control_changes_nothing(self):
        admitted,weeks=fixture();original=e.numerical(admitted,weeks)
        admitted['control'].reverse();admitted['inputs']['folds'].reverse()
        for role in ('own','legacy'):admitted['inputs']['roles'][role]['history'].reverse()
        self.assertEqual(original,e.numerical(admitted,weeks))

    def test_arm_specific_donors_and_paired_uncertainty(self):
        admitted,weeks=fixture()
        for row in admitted['inputs']['roles']['legacy']['history']:row['home']+=10
        result=e.numerical(admitted,weeks)
        old=result['pooled']['control']['team'];new=result['pooled']['candidate']['team']
        self.assertEqual(old['mae'],new['mae']);self.assertNotEqual(old['crps'],new['crps'])
        self.assertAlmostEqual(result['uncertainty']['difference'],old['crps']-new['crps'])
        for rec in result['records']:
            self.assertEqual(rec['forecasts']['control']['home_points'],rec['forecasts']['candidate']['home_points'])

    def test_missing_donor_and_unknown_week_do_not_drop_games(self):
        admitted,weeks=fixture();admitted['inputs']['roles']['legacy']['history'].pop(0)
        with self.assertRaisesRegex(ValueError,'population mismatch'):e.numerical(admitted,weeks)
        admitted,weeks=fixture();weeks.pop('2016_1')
        with self.assertRaisesRegex(ValueError,'explicit NFL weeks'):e.numerical(admitted,weeks)

    def test_mutated_points_are_out_of_scope_before_scoring(self):
        original=e.history.attach_many
        def corrupt(*args,**kwargs):
            result=original(*args,**kwargs);next(iter(result.values()))['home_points']+=.1;return result
        with patch.object(e.history,'attach_many',side_effect=corrupt),patch.object(e,'score_game') as scorer:
            with self.assertRaisesRegex(ValueError,'OUT_OF_SCOPE'):e.numerical(*fixture())
            scorer.assert_not_called()

    def test_midpoint_pit_and_fractional_tie_scoring(self):
        scored=e.scored({0:.25,1:.5,2:.25},1.2,1,{'50':[1,1],'80':[0,2]})
        self.assertEqual(scored['pit'],.5);self.assertEqual(scored['50']['interval_score'],0.)
        self.assertEqual(e.scoring.brier(.75,.5),.0625)
        roundoff=e.scored({0:.5000000000000002,1:.5},1.2,2,{'50':[0,1],'80':[0,1]})
        self.assertEqual(roundoff['pit'],1.)

    def test_deadline_can_interrupt_before_any_bank(self):
        def expired():raise TimeoutError('deadline')
        with patch.object(e.history,'build') as builder,self.assertRaises(TimeoutError):
            e.numerical(*fixture(),checkpoint=expired)
        builder.assert_not_called()

    def test_missing_admission_and_changed_resampling_refused(self):
        admitted,weeks=fixture();admitted['state']='PENDING'
        with self.assertRaisesRegex(ValueError,'Admission'):e.numerical(admitted,weeks)
        admitted['state']='ADMITTED_TO_CALIBRATION_FITTING';admitted['registration']['uncertainty']['seed']=4
        with self.assertRaisesRegex(ValueError,'Unregistered uncertainty'):e.numerical(admitted,weeks)


if __name__=='__main__':unittest.main()
