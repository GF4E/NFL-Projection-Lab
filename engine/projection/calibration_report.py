"""Reports and draft review packets from retained evidence only; no fitting."""
import hashlib
import json
import statistics
from pathlib import Path
from engine.projection_experiments import digest
from scripts.reference_lines import render as render_reference_lines
from . import calibration_execute as execution, calibration_admission as admission, storage

REVIEW='REVIEW REQUESTED — maximum three explicit execution attempts; alternative: retries until the experiment deadline. This is an operational limit, not a statistical gate.'
QUESTIONS=[
    'What information leaks across training, calibration, issuance or evaluation?',
    'What football mechanism is missing or counted twice?',
    'What result would disprove the proposed improvement?',
    'Does the evidence justify release under the registered gate and existing authority?']


def cell(x):
    if x is None:return 'not recorded'
    if isinstance(x,float):return format(x,'.8g')
    return str(x).replace('|','\\|').replace('\n',' ')


def table(headers,rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+
                     ['| '+' | '.join(cell(x) for x in row)+' |' for row in rows])


def diagnostics(root,reference,baseline_hash):
    if reference is None:
        return {'shortfall':'No retained, lineage-matched reference diagnostic snapshot supplied','series':{}}
    value=admission.read(root,reference)
    if value.get('schema')!='calibration-reference-diagnostic-v1' or value.get('control_sha256')!=baseline_hash:
        raise ValueError('Diagnostic snapshot has a different control lineage')
    report=value['report']
    if report.get('schema')!='reference-lines-report-v1' or report.get('label')!='DIAGNOSTIC ONLY':
        raise ValueError('Reporting-only diagnostic snapshot required')
    for item in report.get('series',{}).values():
        audit=item.get('audit')
        if audit and not (audit.get('reporting_only') and audit.get('never_a_gate') and audit.get('never_a_selection_criterion')):
            raise ValueError('Diagnostic must never select a model')
    return report


def render(saved,diagnostic):
    r=saved['request']['registration'];attempts=saved['attempts'];last=attempts[-1] if attempts else None
    lines=['# E-CAL-LINEAGE retained numerical evidence',
        'HISTORICAL DEVELOPMENT — reused seasons; no independent confirmation or release approval.',REVIEW,
        f"Control at admission: {r['control']}; SHA-256 {r['baseline_hash']}; generated {r['generated_at']}; authoritative deployed lineage required by admission.",
        f"Registration: {r['sha256']}; deadline {r['deadline_at']}. Reports never refit.",
        '## Retained attempts',table(['Attempt','Started','Disposition','Reason'],[
            [x['start']['attempt'],x['start']['started_at'],(x['receipt'] or {}).get('state','UNSEALED'),
             (x['receipt'] or {}).get('reason','Numerical evidence only; release eligibility not assessed')]
            for x in attempts]) if attempts else 'No durable execution attempt exists.']
    result=last['result'] if last and last['receipt'] and last['receipt']['state']=='COMPUTED_NOT_RELEASED' else None
    if result is None:
        lines+=['No sealed numerical result. A failed or interrupted attempt is not a gate rejection.']
    else:
        lines+=['## Numerical gate evidence',
            'NUMERICAL_CRITERIA_MET' if not result['numerical_gate_reasons'] else 'NUMERICAL_CRITERIA_NOT_MET: '+', '.join(result['numerical_gate_reasons']),
            f"Relative team CRPS improvement: {cell(result['relative_team_crps_improvement'])}; required 0.01. Method activation: false; release eligibility: NOT_ASSESSED."]
        rows=[]
        for arm,m in result['pooled'].items():
            for target in ('team','margin','total'):
                z=m[target];rows.append([arm,target,z['n'],*[z[k] for k in ('mae','rmse','bias','crps','projected_sd','actual_sd')]])
        lines+=[table(['Arm','Target','N','MAE','RMSE','Signed error','CRPS','Projected SD','Actual SD'],rows)]
        rows=[]
        for target in ('team','margin','total'):
            for level in ('50','80'):
                a=result['pooled']['control'][target][level];b=result['pooled']['candidate'][target][level]
                rows.append([target,level,f"{a['hits']}/{a['n']}",f"{b['hits']}/{b['n']}",a['coverage'],b['coverage'],
                             a['width'],b['width'],a['interval_score'],b['interval_score']])
        lines+=['## All coverage and interval-score checks',
            'Candidate coverage must be within 0.03 of nominal at every target/level; interval score must not worsen at any target/level.',
            table(['Target','Nominal %','Control hits','Candidate hits','Control coverage','Candidate coverage',
                   'Control width','Candidate width','Control interval score','Candidate interval score'],rows)]
        for title,groups in [('By season',result['annual']),('By NFL week',result['weekly'])]:
            rows=[]
            for key,arms in groups.items():
                for arm,z in arms.items():
                    rows.append([key,arm,z['games'],z['team']['mae'],z['team']['crps'],z['margin']['mae'],
                        z['total']['mae'],z['team']['bias'],z['team']['projected_sd'],z['team']['actual_sd'],z['winner']['brier']])
            lines+=['## '+title,table(['Period','Arm','Games','Team MAE','Team CRPS','Margin MAE','Total MAE',
                                      'Team bias','Projected SD','Actual SD','Winner Brier'],rows)]
        lines+=['## Paired uncertainty',
            'Positive differences mean control minus candidate team CRPS. Both teams stay together. These intervals are descriptive, never extra gates.',
            '```json\n'+json.dumps(result['uncertainty'],sort_keys=True,indent=2)+'\n```',
            '## PIT and winner reliability']
        for arm,z in result['pooled'].items():
            lines+=[arm,table(['Target','Ten equal-width PIT bin counts'],
                [[target,', '.join(map(str,z[target]['pit_counts']))] for target in ('team','margin','total')]),
                table(['Bin','Games','Mean forecast','Observed home outcome'],
                [[b['bin'],b['n'],b['forecast'],b['observed']] for b in z['winner']['reliability']])]
        meaning=[]
        for arm in ('control','candidate'):
            forecasts=[g['forecasts'][arm] for g in result['records']]
            for target in ('home_points','away_points','margin','total'):
                offsets=[f['distribution_means'][target]-f[target] for f in forecasts]
                negative=[f['negative_score_mass'][target] for f in forecasts] if target!='margin' else None
                meaning.append([arm,target,statistics.fmean(offsets),max(abs(x) for x in offsets),
                                statistics.fmean(negative) if negative is not None else 'not applicable'])
        lines+=['## Forecast meaning and score support',
            'Point labels remain LEGACY_RIDGE_CENTER. Distribution means are not relabeled as those points. Negative team/total support is retained and disclosed, not clipped. Winner probabilities refer to strict wins plus half the tie mass.',
            table(['Arm','Target','Mean distribution-minus-point','Largest absolute offset','Mean negative-score mass'],meaning)]
        lines+=['## Calibration executions',table(['Hash','Target season','Cadence','Donor relation','Donor games','Fitted at'],
            [[key,b['target_season'],b['cadence'],b['relation'],len(b['expected_game_ids']),b['fitted_at']]
             for key,b in sorted(result['banks'].items())]),
            'Point forecasts are unchanged under the numerical tolerance; team MAE is reported for both arms above. Individual forecasts, intervals, PIT, means, negative mass and score records remain in the hash-bound numerical result.',
            '## Unresolved release evidence',*['- '+x for x in result['limitations']],
            '- No completed Claude or Dr. M review, signed decision or prospective confirmation is supplied by this execution.']
    lines+=[render_reference_lines(diagnostic).strip(),
        'Confidence: medium in experiment readiness: retained evidence is reproducible, but authoritative historical availability, installed resource qualification and independent reviews remain consequential. Lower to low on an independent recomputation disagreement. A numerical result alone is not a release decision.']
    return '\n\n'.join(lines)+'\n'


def publish(root,key,*,diagnostic_ref=None):
    """Produce immutable derivative artifacts. Never calls admission or a worker."""
    root=Path(root).resolve();saved=execution.read(root,key);r=saved['request']['registration']
    diagnostic=diagnostics(root,diagnostic_ref,r['baseline_hash'])
    markdown=render(saved,diagnostic)
    last=saved['attempts'][-1] if saved['attempts'] else None
    request_ref=execution.ref(root,execution.directory(root,key)/'request.json')
    receipt_ref=execution.ref(root,root/last['path']/'receipt.json') if last and last['receipt'] else None
    packet={'schema':'calibration-review-packet-v1','status':'DRAFT_NOT_SENT_NOT_APPROVED',
        'registration_sha256':key,'request_ref':request_ref,'attempt_receipt_ref':receipt_ref,
        'result_ref':last['receipt'].get('result_ref') if last and last['receipt'] else None,
        'reviewers':['Claude','Dr. M'],'questions':QUESTIONS,'review_requested':[REVIEW],
        'required_external_evidence':['qualified historical/control lineage','resource qualification',
             'current as-issued comparison','prospective evidence','actual reviewer responses','signed release decision'],
        'activates_method':False}
    identity=digest({'request':request_ref,'receipt':receipt_ref,'diagnostic':diagnostic_ref,
                     'markdown_sha256':hashlib.sha256(markdown.encode()).hexdigest(),'packet':packet})
    folder=execution.directory(root,key)/'reports'/identity
    storage.write_bytes(folder/'evidence.md',markdown.encode(),immutable=True)
    storage.save(folder/'review-packet.json',packet,immutable=True)
    descriptor={'schema':'calibration-report-derivative-v1','request_ref':request_ref,'attempt_receipt_ref':receipt_ref,
        'diagnostic_ref':diagnostic_ref,'report_ref':execution.ref(root,folder/'evidence.md'),
        'review_packet_ref':execution.ref(root,folder/'review-packet.json'),'activates_method':False}
    storage.save(folder/'manifest.json',execution.seal(descriptor),immutable=True)
    return descriptor
