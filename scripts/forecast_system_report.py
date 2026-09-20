"""Read-only-to-model Phase A report rendering: cached artifacts only, no refits."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT=Path(__file__).resolve().parents[1]
import sys
sys.path.insert(0,str(ROOT))
from scripts.reference_reports import report_file
OUT=ROOT/'work/projection-v2/phase-a'


def run():
    v=json.loads((OUT/'verification.json').read_text())
    g=json.loads((OUT/'gate.json').read_text())
    compute=json.loads((OUT/'compute.json').read_text())
    core=json.loads((OUT/'core-manifest.json').read_text())
    records=json.loads((OUT/'verified-games.json').read_text())
    why=json.loads((OUT/'BAL-IND.json').read_text())
    text=['# Forecast-system v2 — Phase A: FAILED; not promoted',
          '', 'The registered candidate improved average team-point accuracy but did not pass the dispersion and annual coverage gates. Phase B is not started. No production forecast, locked record, grade, schedule, or board was changed.',
          '', '## Evidence and scope',
          '2016–2025 regular seasons, 2,639 paired games. The canceled 2022 BUF–CIN game has no final result and is not scored. These are reconstructed historical forecasts, not proof of historical issuance. User-authorized 2013–2015 forecasts provide calibration only; 2011 warms inputs and 2012 starts ridge training. Each historical EMOS fit reads exactly the preceding three seasons. Ridge penalty selection uses earlier OOF results. No retuning was performed after the failed gate.',
          '', 'Core has '+str(core['parameters'])+' fitted coefficients; EMOS adds five identifiable parameters: a, b, c and two band contrasts. Middle-band offset is fixed at zero; all three bands are reported. No additional core calibration slope/intercept was added. Weather fitting awaits Phase D forecast provenance; unavailable historical roster/continuity/referee measurements remain inactive. This limitation prevents claiming every requested input is active in every historical game.',
          '', '## Annual verification',
          '| Season | Raw team MAE | EMOS team MAE | Team SD | Team skill | Margin skill | Total skill |',
          '|---|---:|---:|---:|---:|---:|---:|']
    for year,s in v['seasons'].items():
        text.append(f"| {year} | {s['team']['raw_mae']:.3f} | {s['team']['mae']:.3f} | {s['team']['dispersion']:.3f} | {s['team']['skill']:.3f} | {s['margin']['skill']:.3f} | {s['total']['skill']:.3f} |")
    text+=['','Skill = 1 − model MSE / prior-data league-climatology MSE. Positive means better. Dispersion is population SD of unrounded team-point projections; gate is at least 4.0. All ten seasons fail that gate. 2024 total skill is also negative under the registered all-target interpretation. Even a team-only skill interpretation would not rescue the dispersion failure.',
           '', '## Coverage (50% / 80%)', '| Season | Team | Margin | Total |','|---|---:|---:|---:|']
    for year,s in v['seasons'].items():
        text.append('| '+year+' | '+' | '.join(f"{s[t]['coverage_50']*100:.1f}% / {s[t]['coverage_80']*100:.1f}%" for t in ('team','margin','total'))+' |')
    text+=['','## Pooled comparisons','| Target | Raw MAE | EMOS MAE | Climatology MAE | Last-season team MAE | Last-four MAE | Archived v1 MAE | CRPS |','|---|---:|---:|---:|---:|---:|---:|---:|']
    for t,s in v['pooled'].items():
        if t=='winner':continue
        text.append(f"| {t} | {s['raw_mae']:.3f} | {s['mae']:.3f} | {s['climatology_mae']:.3f} | {s['team_prior']['mae']:.3f} | {s['persistence']['mae']:.3f} | {s['v1']['mae']:.3f} | {s['crps']:.3f} |")
    text+=['','Archived v1 forecasts are matched by row ID and checked against identical actual scores. Its historical weather-provenance limitations remain baseline evidence, not a shipping source for the new model.',
           '',f"Home-win Brier score: {v['pooled']['winner']['brier']:.4f}. Event is home margin >0; ties are event false. Ten-bin reliability, all weekly/annual CRPS, PIT histograms, interval scores and widths are in verification.json. Per-game verification is in verified-games.json.",
           '', 'Spread in Phase A is residual predictive SD, not an input ensemble. Within a season it is constant, so within-week spread-skill correlations may be undefined. Undefined correlations are stored as null, never passed as positive. Phase C would replace this with member spread, but cannot begin after this failed gate.',
           '', '## Postprocessor parameters and fitting sample sizes',
           '| Season | a | b | c | <20 offset | 20–27 offset | >27 offset | Prior games | Games per EMOS parameter | Residual 10–90 band |',
           '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|']
    for f in v['emos']:
        full=json.loads((OUT/f"emos-{f['issuing_season']}.json").read_text())
        lo,hi=np.quantile(full['residuals'],[.1,.9]);n=f['team_observations']//2
        text.append(f"| {f['issuing_season']} | {f['a']:.3f} | {f['b']:.3f} | {f['c']:.3f} | {f['band_offsets']['under_20']:.3f} | 0 | {f['band_offsets']['over_27']:.3f} | {n} | {n/5:.1f} | {lo:.2f} to {hi:.2f} |")
    text+=['','All-year inert rule: '+str(all(f['inert_slope_scale'] for f in v['emos']))+'. Half-life is not applicable before Phase B. Residual bands above are point residual quantiles, not fitted weather error bounds.',
           '', '| Core fold | Training games | Core coefficients | Games per coefficient |','|---|---:|---:|---:|']
    for f in core['folds']:
        n=f['training_rows']//2;k=len(f['fit']['names']);text.append(f"| {f['season']} | {n} | {k} | {n/k:.1f} |")
    text+=['', '## Gate table', '| Requirement | Season | Pass |','|---|---|---|']
    for r in g['tests']:text.append(f"| {r['requirement']} | {r.get('season','pooled')} | {'PASS' if r['pass_'] else 'FAIL'} |")
    text+=['','## Compute and validation',f"Single worker, one BLAS thread; gate {compute['seconds']:.2f} seconds; peak resident memory {compute['peak_rss_mib']:.1f} MiB. This measurement covers the gate runner, not one-time raw-data preparation. macOS measured run; Linux runner additionally imposes a 4 GiB address-space limit. Reports consume cached artifacts and do not refit.",
           '', '279 tests passed: 11 focused tests, 50 existing projection tests and 218 Week 1 regression tests. Synthetic compressed forecasts recover slope 1.5; loader requests only prior three seasons; core and postprocessor row reversal produce identical outputs. Hand-calculated CRPS, interval score, skill and Brier fixtures pass. Fit hash tampering, missing calibration years and nonchronological core records are rejected.',
           '', 'Operational weekly publication and new scheduler cadence are not activated: this candidate failed the offline gate. Phase A is not reported as fully delivered or deployed. Phases B–E remain closed.',
           '', 'Least sure: whether the compression hypothesis would be supported by CRPS fitting. I left b unrestricted, tested synthetic slope recovery, and retained the measured b values rather than forcing expansion to satisfy the dispersion gate.',
           '', '![Verification panels](verification.png)']
    spaced=[]
    for i,line in enumerate(text):
        spaced.append(line)
        if line.startswith('#') and i+1<len(text) and text[i+1]:spaced.append('')
    report_file(OUT/'report.md').write_text('\n'.join(spaced)+'\n')
    lines=['# BAL at IND — before and after Phase A postprocessing','','COUNTERFACTUAL DIAGNOSTIC ONLY. This uses pregame feature values and a 2026 experimental core/EMOS fit trained through 2025. It does not change the original Week 1 prediction or grade. The illustration compares the new raw core with its postprocessor, not an overwritten historical issue.','']
    for team in why['teams']:
        for term in team['terms']:
            translations={'football_baseline':f"{team['team']} scoring efficiency against the opposing defense at expected pace",
                          'pressure_allowed':f"Sacks and quarterback hits allowed by {team['team']}",
                          'pressure_generated':'Sacks and quarterback hits generated by the opposing defense',
                          'qb_career_starts':'Pregame quarterback starting experience',
                          'qb_backup':'Pregame backup-quarterback adjustment'}
            term['label']=translations.get(term['input'],term['label'])
            if term['input'] in ('home_divisional','home_nondivisional'):
                term['label']=f"{team['team']} venue effect relative to historical average ({'division' if term['input']=='home_divisional' else 'nondivision'} component)"
        lines += [f"## {team['team']}: raw core {team['raw_core']:.3f}; postprocessed {team['postprocessed']:.3f}", '', '| Football contribution | Before | After |','|---|---:|---:|']
        for t in sorted(team['terms'],key=lambda t:-abs(t['after'])):
            if abs(t['before'])>1e-10 or abs(t['after'])>1e-10:
                lines.append(f"| {t['label']} | {t['before']:+.3f} | {t['after']:+.3f} |")
        support=sorted([t for t in team['terms'] if t['before']>0 and t['input']!='football_baseline'],key=lambda t:-t['before'])[:3]
        against=sorted([t for t in team['terms'] if t['before']<0],key=lambda t:t['before'])[:1]
        lines+=['','Before WHY: '+'; '.join(t['label']+f" ({t['before']:+.0f} points)" for t in support),
                'After WHY: '+'; '.join(t['label']+f" ({t['after']:+.0f} points)" for t in support),
                'Against: '+'; '.join(t['label']+f" ({t['before']:+.0f} before; {t['after']:+.0f} after)" for t in against),'']
    lines+=['Postprocessing scales football contributions by b, then adds the historical scoring adjustment. Detailed arithmetic remains full precision. Phase C mean-member contributions are not fabricated in Phase A.']
    (OUT/'BAL-IND.md').write_text('\n'.join(lines)+'\n')
    fig,axes=plt.subplots(3,3,figsize=(15,12),layout='constrained')
    for i,t in enumerate(('team','margin','total')):
        rows=[r for r in records if r['target']==t]
        axes[0,i].hist([r['pit'] for r in rows],bins=np.linspace(0,1,11),color='#327f89')
        axes[0,i].set_title(t.title()+' PIT');axes[0,i].set_xlabel('Mid-PIT')
        axes[1,i].scatter([r['spread'] for r in rows],[abs(r['actual']-r['median']) for r in rows],s=3,alpha=.2)
        axes[1,i].set_title(t.title()+' spread vs error');axes[1,i].set_xlabel('Predictive SD');axes[1,i].set_ylabel('Absolute error')
    bins=v['pooled']['winner']['bins'];nonempty=[b for b in bins if b['count']]
    axes[2,0].plot([b['predicted'] for b in nonempty],[b['observed'] for b in nonempty],marker='o');axes[2,0].plot([0,1],[0,1],ls='--',color='gray');axes[2,0].set_title('Home-win reliability')
    years=list(v['seasons']);axes[2,1].plot(years,[v['seasons'][y]['team']['dispersion'] for y in years],marker='o');axes[2,1].axhline(4,color='red',ls='--');axes[2,1].set_title('Team dispersion; gate = 4');axes[2,1].tick_params(axis='x',rotation=45)
    for key,label in [('raw_mae','Raw core'),('mae','Postprocessed')]:axes[2,2].plot(years,[v['seasons'][y]['team'][key] for y in years],label=label)
    axes[2,2].legend();axes[2,2].set_title('Team MAE');axes[2,2].tick_params(axis='x',rotation=45)
    fig.suptitle('Phase A historical verification — gate FAILED; not deployed',fontsize=16)
    fig.savefig(OUT/'verification.png',dpi=140)


if __name__=='__main__':run()
