"""Synchronize mutable current plans; preserve frozen evidence and prior text."""
from pathlib import Path
from datetime import datetime, timezone
import json

TASK = Path('/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6')
REPO = Path('/private/tmp/os01-gen15-rebuild.9ny71k')
PLAN = REPO / '.planning/engine-os'
WORK = TASK / 'work/rf-clock-guard'
NOW = datetime.now(timezone.utc).isoformat()
summary = ('RF-COMP-09 is closed and independently accepted as `reject_all`: '
    '277 origins, 3,407 outer games, 1,705.954 seconds and 1,769.047 MiB. '
    'Retire the split-rate E3 candidate; retain the qualified timer correction. '
    'RF-03 freezes the complete negative team result. The next substantive boundary is '
    'RF-04 player-population and outcome-label evidence. No eligible model is promoted, '
    'and no closed run may restart. See the [current goal](RESEARCH-GOAL.md#current-evidence-and-next-milestone).')

paths = ['RESEARCH-GOAL.md', 'PROJECT.md', 'STATE.md', 'ROADMAP.md', 'TASKS.md', 'quality/state.v1.json']
snapshot = WORK / 'before-terminal-plan-sync'
snapshot.mkdir(exist_ok=False)
for name in paths:
    (snapshot / name.replace('/', '--')).write_bytes((PLAN / name).read_bytes())
(snapshot / 'updated-goal.md').write_bytes((TASK / 'outputs/updated-goal.md').read_bytes())

def replace_line(text, prefix, replacement):
    lines = text.splitlines()
    matches = [i for i, line in enumerate(lines) if line.startswith(prefix)]
    assert len(matches) == 1, (prefix, matches)
    lines[matches[0]] = replacement
    return '\n'.join(lines) + '\n'

goal_path = PLAN / 'RESEARCH-GOAL.md'
goal = goal_path.read_text()
start = goal.index('The sole RF-02F historical invocation')
end = goal.index('\n\nPrioritize football-only', start)
goal = goal[:start] + summary + (' Earlier numerical, cost and timer stops retain their original invalid dispositions. '
    'All original experiment records remain intact; the accepted complete result does not retroactively repair them. '
    'The public front page\'s Beta label and date are published; detailed research stays private.') + goal[end:]
start = goal.index('## Current evidence and next milestone')
end = goal.index('## Definition of at least 5% better', start)
goal = goal[:start] + '''## Current evidence and next milestone

The latest complete [RF-COMP-09 result](research-first/RF-COMP-09-RESULT.v1.md) is independently accepted as **`reject_all`**. All 277 origins, 3,407 outer games and 163,202 saved score rows were retained. The worker completed in 28.43 minutes at 1.73 GiB after a passing 140.50-minute cost projection, within the approved 150-minute / 4-GiB envelope. All 27 focused qualification checks passed before the run; actual numerical, temporal and full archive-integrity reviews are now accepted. The one historical permission is spent and closed.

E3's split-rate enhancement reduced development joint energy loss by **0.137154% versus E2** and **0.724569% versus N0**. Both miss the unchanged 1% research floor; uncertainty, stability, required mechanism and calibration checks also fail. Exposed 2025 worsens by 0.300065% versus E2. Retire this candidate. Keep the qualified timer repair and applicable tested computational components. Do not automatically search more rates, re-run an unchanged experiment or change the acceptance bar.

The [RF-03 complete negative-result freeze](research-first/RF-03-TEAM-RESULT-FREEZE-COMP09.v1.json) binds the original forecast archive, reviewed evaluation, compact private report and a deterministic 304-row metric extract. No eligible package or shadow activation follows. The earlier RF-03 failure bundle remains unchanged. [Owner readout](/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/outputs/team-backtest-result.md).

Under ADR-0018, the next stage is the existing **RF-04 data-admission decision**, even though no team model won. Its 47-file capture is already approved and complete. The retained audit found 83.78% target coverage, 84.74% yardage coverage and 7,871 unresolved outcomes among 36,333 player-games, with no historical Tuesday population-completeness proof. No player fitting is permitted from that cohort. Isolated ID repair or another identical audit cannot resolve these main gaps. The original audit's instruction to return to an unresolved team replay is historical; the present completed result supersedes that next-step interpretation without changing the audit.

The smallest useful next evidence is one documented source sample with original pregame WR membership times and independently resolvable postgame participation/yardage labels. A [concrete source-capability brief](/Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/outputs/player-data-next-step.md) specifies fields, completeness, identity, revisions and usage questions. Identify an existing owner-held archive first. New source acquisition, outbound inquiry, paid access or prospective activation requires its applicable separate authority. Do not create another model or protocol merely to remain busy while that evidence is absent.

Retain earlier dispositions: RF-02C and RF-02E are audited negative predictive results; conditional-margin contraction is retired. RF-02, RF-02S, RF-02D, RF-02F, RF-COMP-04 and RF-COMP-08 retain their distinct invalid stops. RF-COMP-05 is rejected for timing; RF-COMP-06 is retained with integration deferred; RF-COMP-07 is deferred after insufficient materiality. The speculative optimization branch stays closed. Detailed evidence and the dated revision record remain preserved.

Enhanced Elo acceptance, the external 5% objective, prospective confirmation and tested-product readiness remain unmet. No external comparator archive is admitted. Keep current execution details here and link other plans to this record to avoid repeated stale status narratives.

''' + goal[end:]
goal += '\n- **2026-09-06 completed replay and stage decision:** Accepted the full RF-COMP-09 retrospective `reject_all` result after independent numerical/temporal and root integrity audits. The 0.137154% incremental gain, failed stability/mechanism and margin calibration gates retire split-rate E3. Retain the qualified timer repair. RF-03 now freezes the complete negative result and compact private scorecard; return to the RF-04 population/label evidence boundary under ADR-0018. Preserve all frozen failures and criteria, including the unmet external 5% requirement. The current-status text was condensed; its full prior form is retained in the local before-terminal-plan-sync snapshot. No native objective-text edit, model promotion, new data acquisition or publication occurred.\n'
goal_path.write_text(goal)

p = PLAN / 'PROJECT.md'; t = p.read_text()
t = replace_line(t, '**Latest owner direction', '**Latest owner direction — graph engineering and learning through tests:** ' + summary + ' Graph techniques must earn their measured cost.')
t = replace_line(t, '**Current work:**', '**Current work:** Complete RF-03 negative-result freeze and precise RF-04 data handoff; the common-game team scorecard is now available. The qualified compute/timer path completed within approved limits. Predictive, external 5%, prospective and product acceptance remain unmet.')
t = replace_line(t, 'RF-02S numerical qualification', 'Historical RF-02S numerical qualification was accepted, but its sole replay failed its unchanged cost pilot. That identity remains closed. Later resource authority applies only to separately registered successors; RF-COMP-09 now supplies the complete negative scorecard. A scorecard alone does not complete the owner-feedback/product or performance requirements.')
p.write_text(t)

p = PLAN / 'ROADMAP.md'; t = p.read_text()
t = replace_line(t, '**Efficiency overlay:**', '**Efficiency overlay:** ' + summary + ' No graph framework prerequisite or repeated speculative optimization.')
t = replace_line(t, '| 3 | RF-03 |', '| 3 | RF-03 | Frozen team result and reproducible local forecast/report bundle | Complete COMP09 negative result frozen with 304-row metric extract and private report; earlier failure bundle preserved. No eligible model or activation |')
t = replace_line(t, '| 2 | RF-02 |', '| 2 | RF-02 | Naive/SRS/Elo/challenger rolling-origin scorecard, calibration, uncertainty and falsification | Original identity remains `protocol_invalid`; separately qualified RF-02C/02E/COMP09 complete as `reject_all`. No model accepted |')
t = t.replace('| 5 | RF-05 |', '| 4F | RF-COMP-09 | Complete the unchanged split-rate experiment with the qualified timer correction | CLOSED, independently accepted `reject_all`; all 277 origins / 3,407 games. RF-03 result freeze complete; retire E3 |\n| 5 | RF-05 |')
p.write_text(t)

p = PLAN / 'TASKS.md'; t = p.read_text()
t = replace_line(t, '**Latest execution instruction:**', '**Latest execution instruction:** ' + summary + ' Preserve all prior protocols and follow the concrete private source-capability brief for the next data decision.')
t = replace_line(t, '2. **RF-02 —', '2. **RF-02 — original identity TERMINAL `protocol_invalid`:** its immutable numerical failure remains. Separately qualified RF-02C, RF-02E and RF-COMP-09 now provide complete audited negative results. No automatic restart or accepted model. See the current goal and linked results.')
t = replace_line(t, '3. **RF-03 —', '3. **RF-03 — complete negative-result freeze:** COMP09 full forecast/evaluation archive, terminal acceptance, compact private report and 304-row metric extract are bound by `research-first/RF-03-TEAM-RESULT-FREEZE-COMP09.v1.json`. Original 147-file failure bundle preserved. No eligible package or activation.')
t = t.replace('7. **RF-05 —', '   **RF-COMP-09 — CLOSED, independently accepted `reject_all`:** all 277 origins / 3,407 outer games completed in 28.43 minutes / 1.73 GiB. Retire split-rate E3, retain the qualified timer guard; return to RF-04 data admission after RF-03 freeze. No old identity restarts.\n7. **RF-05 —')
p.write_text(t)

p = PLAN / 'STATE.md'; t = p.read_text()
replacements = {
 '- **RF-02S current milestone:**': '- **Historical RF-02S milestone:** numerical qualification passed; its sole replay failed the original cost pilot. Preserve that closed identity. The later COMP09 successor now supplies the full audited negative scorecard.',
 '- **Current phase:**': '- **Current phase:** RF-03 complete negative team-result freeze, then RF-04 data-evidence handoff. RF-COMP-09 closed exit 0 with all 277 origins / 3,407 games and accepted `reject_all`. No model is accepted.',
 '- **Statistical next task:**': '- **Statistical next task:** Resolve RF-04 historical pregame membership and participation/yardage labels using the concrete source-capability brief. Existing capture is complete; no player fit, additional tuning or automatic replay. A new source/sample or explicit acquisition scope is the next substantive input.',
 '- **Latest quality direction:**': '- **Latest quality direction:** Retire E3 after the full failed predictive gates; retain the qualified timer repair. Reuse accepted unchanged evidence and freeze the compact readout. Stop speculative team optimization; do not replace missing player evidence with a more complex model.',
 '- **Quality status:**': '- **Quality status:** Native goal remains active and unmet. COMP09 full retrospective rejection has accepted numerical, temporal and archive audits. RF-03 freeze is complete. The stage decision returns to the existing RF-04 population boundary; see the current quality state and goal.',
 '- RF-01 v2 passed its scoped pre-fit gate;': '- RF-01 v2 retains pre-fit acceptance. Original RF-02 and numerical/cost successors keep their frozen dispositions. RF-02C, RF-02E and COMP09 have complete audited `reject_all` results; RF-03 freezes the latest full negative bundle. RF-04 population admission remains blocked. Enhanced Elo is still the required unaccepted foundation; no further speculative hypothesis is selected.',
}
for prefix, replacement in replacements.items(): t = replace_line(t, prefix, replacement)
t = t.replace('## Executed gates and evidence\n', '## Executed gates and evidence\n\n- **COMP09 / RF-03 complete result:** [Terminal acceptance](research-first/RF-COMP-09-TERMINAL-ACCEPTANCE.v1.json) accepts `reject_all` over 277 origins / 3,407 games; all 2,655 indexed files verified. [RF-03 freeze](research-first/RF-03-TEAM-RESULT-FREEZE-COMP09.v1.json) preserves original forecasts, evaluation and a deterministic private 304-row metric extract. E3 gains only 0.137154% versus E2 and fails required evidence; retire it. Timer repair is retained.\n')
start = t.index('```text\nADR-0018'); end = t.index('### Retained original dependency graph', start)
t = t[:start] + '''```text
ADR-0018 [owner-approved research-first sequence]
  -> RF-01 [accepted retrospective admission]
  -> RF-02 and successors [frozen terminal dispositions; COMP09 complete reject_all]
  -> RF-03 [COMP09 full negative result, local forecast archive and readout frozen]
  -> RF-04 [data evidence needed: pregame population and independently resolved labels]
  -> RF-05 [separate football freeze, market scope and exact-quote gates]
  -> RF-06 [separate scientific, operational and release qualification]
RF-ELO-01 and RF-BENCHMARK-05 remain unmet; no external archive is admitted.
```

The completed negative result ends this team-tuning branch under ADR-0018. Identify a source/sample capable of resolving the existing player population gap; the retained RF-04 report's old return-to-team instruction is superseded only as a current next step. Its source and failed admission evidence remain unchanged. No rejected team component enters player fitting, and no retrospective scorecard establishes prospective performance.

''' + t[end:]
p.write_text(t)

p = TASK / 'outputs/updated-goal.md'; t = p.read_text()
start = t.index('## Current evidence and next action'); end = t.index('## Test, learn and improve', start)
t = t[:start] + '''## Current evidence and next action

The approved replay is complete and independently audited: **277 origins, 3,407 outer games, 28.43 minutes and 1.73 GiB**. Its result is **`reject_all`**. The split-rate Elo candidate improves development joint energy loss by only **0.137% over the prior Elo model** and **0.725% over the naive baseline**, below the frozen 1% research threshold. It also fails uncertainty, stability, mechanism and calibration gates. [Complete private readout](team-backtest-result.md).

**Retire the split-rate candidate and retain the qualified timer repair.** The 27 focused qualification checks, actual numerical and temporal reviews, and complete archive-integrity audit passed. The earlier interrupted timer run remains invalid and preserved; no old identity restarts. RF-03 now freezes the complete negative result and deterministic metric extract. The existing public Beta presentation remains separate from model acceptance.

**Next, resolve player-data admission before fitting.** The existing capture is complete, but its lagged roster population covers only 83.78% of targets and 84.74% of yards and leaves 21.66% of labels unresolved. The next useful evidence is an originally timestamped pregame WR roster sample with independent participation and yardage labels. [Exact evidence needed and how you can help](player-data-next-step.md). New acquisition, outreach or prospective capture needs its applicable separate scope; another identical audit or speculative team-model change would not resolve this gap.

Enhanced Elo remains the required predictive foundation. Full predictive acceptance, the external 5% target, prospective confirmation and tested-product readiness remain unmet. No additional model hypothesis is selected merely to obtain a passing result.

''' + t[end:]
t = t.replace('Originally timestamped historical forecast exports already available to you would help establish a fair external comparison; no new user action is needed for the current timer repair.', 'Originally timestamped historical forecast exports already available to you would help establish a fair external comparison. The immediate player-data need is described in the linked evidence brief; the approved timer/replay work is complete.')
p.write_text(t)

print(json.dumps({'status': 'mutable_plans_synchronized', 'snapshot': str(snapshot), 'updated_at': NOW, 'frozen_science_modified': False}))
