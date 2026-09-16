PROJECTION ENGINE GOVERNANCE AND EXPERIMENT QUEUE. Prompt 3 of 3. This reconciles the Week 2 update prompt (the registered-experiment protocol) with PROJECTION ENGINE v2 and ADDENDUM 1 (the architecture). Where the three conflict, this document governs. Read all three before acting.

## 1. Which document does what

The Week 2 update prompt is the governing protocol: one registered model-method change per week, hashed preregistration before comparative results, nested chronological evaluation over 2016 to 2025 with candidate-specific calibration, identical eligible games for baseline and challenger, paired uncertainty that keeps both teams of a game together, the release gate of at least 1% out-of-fold team MAE improvement with coverage within ±3 points, promotion or rejection logged, review packet with the four questions. Every section of that prompt applies to every experiment below.

PROJECTION ENGINE v2 and ADDENDUM 1 are the specification library. Their sections define what each experiment builds. Their phase ordering and phase gates are replaced by the queue in section 3 here. Their design principle, no-market rule, no-names rule, chronology, immutability, cadence, compute limits, and tests stand.

## 2. Standing rules that bind all three

1. Team-score MAE is the primary objective. Winner probability and intervals are evaluated separately and never gate on their own unless a registered gate says so.
2. Data corrections are recorded separately from method changes. A correction that changes live forecasts is disclosed in that week's release decision and never credited to a method.
3. Every experiment registers at most three candidate settings, a training window, a tuning procedure, a tie-break, and the conditions that would disprove it, before any comparative result is viewed. Prefer the simpler setting when evidence does not distinguish.
4. AS_ISSUED and RETROSPECTIVE populations are never combined. Week 1 counterfactuals are development evidence.
5. The automated learning loop performs weight-only refits with lineage. It cannot promote a method. Method promotion happens only through a registered experiment's release decision.
6. Every promotion issues a new method version with code, configuration, data, and fit hashes, preserves rollback, and verifies deployed behavior separately from committed code.
7. Add to the standing audit in the Week 2 prompt section 2: measure the standard deviation of projected team points by week beside the actual standard deviation. Compression was the largest Week 1 defect; it is audited every week from now on.
8. Add to the standing tables in the Week 2 prompt section 5, reporting only, no gate: skill score against climatology and persistence per v2 section 6.1; PIT histograms per 6.2; the predictability floor per Addendum D once built.

## 3. The registered experiment queue

One experiment per week. Each is preregistered per the Week 2 prompt section 3, evaluated per section 4, reported per section 5, gated per section 6. An experiment that fails is logged and closed; the queue advances. An experiment that passes is promoted and becomes the new baseline for the next.

E1, Week 2, early-season updating rule. Exactly as drafted in the Week 2 prompt. Candidate settings, three: (a) the current linear decay through Week 5; (b) sample-size shrinkage, weight on current season = n / (n + k), n = completed games, k in {4, 8}; (c) the state-space rule from Addendum 1 section A, offense and defense strength as latent state with fitted process and observation noise, Elo retained as an input during this experiment and its removal registered as E5. Candidate (c) is tested with its own out-of-fold calibration like any other. Selection by the registered procedure; the simpler candidate wins ties.

E2, Week 3, post-processing. v2 section 4 and Addendum 1 section C: EMOS layer, a and b and dispersion scale c fit by CRPS on prior seasons' out-of-fold forecasts, plus the regime offset by projected-points band. Three candidate settings: (a) a and b only; (b) a, b, c; (c) a, b, c plus the regime term. Applied to whatever E1 promoted. Disproving condition: b within 0.05 of 1 in every season, or no MAE gain.

E3, Week 4, wind decomposition. v2 section 5.1 data additions and section 5.3 items 1 and 2: along-field and crosswind components from wind direction and stadium azimuth, replacing raw speed, with the piecewise-linear term as candidate (b) and raw speed as the baseline. Fit on as-issued historical forecasts per 5.2; reanalysis only in the disclosed mechanism study. Report the 15 to 20 mph bucket before and after. Stadium metadata file per 5.1 is a data addition, recorded as such.

E4, Week 5, ensemble. v2 section 3 and Addendum 1 section B, with the dispersion scale from E2 refit on ensemble spread. Three candidate member counts are not a search; 500 is fixed. Candidates are the perturbation set: (a) team state and core residual only; (b) plus QB status; (c) plus weather. Gate per v2 section 3 plus the standing 1% MAE rule. The predictability floor per Addendum D is built here as reporting.

E5, Week 6, Elo removal and QB double-count resolution. From the Week 2 prompt section 2 audit: test removing Elo as a core input once the state-space rating exists, and the alternative of removing the separate QB adjustment where Elo's QB term already carries it. Two candidates plus baseline.

E6, Week 7, gusts and interactions. v2 section 5.3 items 3 and 4.

E7, Week 8, precipitation and snow. v2 section 5.3 items 5 and 6, precipitation probability as continuous.

E8, Week 9, forecast blending. The Week 2 prompt section 7 exactly: the ridge, an independently constructed football-only strength model, and their equal-weight blend, against both components. Also the scheduled post-processor refit per Addendum E.

E9 onward: v2 section 5.3 items 7 to 10, dome-team-in-cold, per-stadium shielding, surface; then lead-time skill reporting per v2 section 6.4. Order fixed now; each still preregistered in its week.

## 4. What does not enter the queue

No sportsbook line, consensus, price, or odds, at any point, in any experiment, in any report the engine issues. The separation test covers every module every week. Human edits per v2 section 7 remain the OURS record and are scored on the same suite, never used to fit engine weights except through the learning-from-us evidence path already specified, which flags candidates and never changes weights on its own.

## 5. Review packet

Each week's packet goes to two reviewers as the Week 2 prompt specifies, with the four questions. Record answers. A reviewer's objection that names a leak or a double count blocks promotion until resolved. Agreement is not evidence; only the tables are.

## 6. Research basis, consolidated

Glickman and Stern 1998 (state-space team strength). Cawley and Talbot 2010 (selection overfitting). Gneiting and Raftery 2007 (proper scoring rules, CRPS). Gneiting, Raftery, Westveld and Goldman 2005, Monthly Weather Review (EMOS post-processing). Hyndman and Athanasopoulos, FPP3 (rolling-origin evaluation, forecast combinations). Fovell and Gallagher 2020, Weather and Forecasting (short-lead 10 m wind bias, HRRR). Borghesi 2007 (weather and NFL scoring, historical market underreaction; context only). Thompson Bliss stadium_coordinates.csv (field azimuth, roof, coordinates). These motivate the queue; none establishes that this engine will improve. Only the tables do.

## 7. Report format

Per experiment: the Week 2 prompt section 9 deliverables in full, plus the standing additions in section 2 items 7 and 8 here, plus one line naming the requirement you were least sure of and what you changed because of it.

## 8. Binding decision-latency amendment (2026-09-16)

DECISION-LATENCY.md governs handling of undefined conventions: resolve Tier 1 and Tier 2 locally before implementation, publish a tiered preregistration sweep, flag Tier 2 for nonblocking review, and batch only Tier 3 blockers. Existing registered model choices and gates remain fixed.

## 9. Experiment clock (effective 2026-09-16)

Each registered experiment carries a one-week queue clock starting at the timestamp at which its preregistration hash is recorded. The deadline is the following Tuesday at 06:00 America/Los_Angeles, using the local calendar and daylight-saving rules. If no gate decision exists at that cutoff, record INCONCLUSIVE with a one-line named blocker, advance the queue to the next experiment, and keep the unresolved experiment outside the blocking queue. It returns only after recorded evidence resolves its blocker. No experiment blocks the queue twice: any returned attempt runs without delaying the next scheduled experiment. INCONCLUSIVE is neither a numerical rejection nor a promotion. No clock expiry changes candidates, gates, metrics, populations, chronology, or evidence requirements.

E1's clock starts at amendment adoption: 2026-09-16T22:29:05Z; deadline 2026-09-22T06:00:00-07:00. An existing independently audited gate decision satisfies the clock; adoption does not erase or reopen a completed experiment. Future registrations record started_at, deadline_at, registration_sha256 and queue_block_count beside the immutable preregistration, never by rewriting its hashed contents.
