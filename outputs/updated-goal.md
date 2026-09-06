# NFL Prediction Engine: current goal and cycle-one build plan

Version: 2.0
Updated: September 6, 2026
Status: Step 0 complete. Step 1 complete; planning endpoint is three seasons, N0-only family. [Immutable result](../work/cycle-one-power-v1/result.json). Steps 2–7 have not run. Stop before Step 2 spending.
Authority: owner review decisions 1–14 and revised build order. Later decisions supersede earlier conflicting choices in this plan only. No frozen experiment gate changes.
Prior version: [byte-identical archive](../99_archive/superseded/updated-goal.v1.md). The previous document had no explicit version and is designated v1 for archival purposes.
Prior SHA256: d05f12d82a7910794ca192bafd45885ec12358f8746c714ff36b484aa808b4c5
Paths beginning with / are repository-relative unless they explicitly identify an external file. Repository root: /Users/gabe/Documents/Codex/2026-09-04/nfl-prediction-engine-gpt6/.

## Outcome and protected evidence

Serve a two-person betting board with separate betting and model scorecards. Closing line value (CLV) at the executed book is the headline betting KPI. Units and CLV are betting gates. CRPS per target is the model KPI. Neither scorecard substitutes for the other. Hit rate is descriptive and never a gate.

Existing E3 rejection remains final under its registered gates. Do not reverse, rerun or reinterpret it. Its evidence remains in [the original experiment readout](team-backtest-result.md) and [saved scorecard](team-scorecard.csv), both read-only. This revision reports no new numerical results.

Keep chronology safeguards, the evidence store, existing numerical tests, quota accounting and last-good publication behavior. Frozen experiments, source archives and issued forecasts are immutable. Preserve reconstructed-history versus as-issued evidence labels. The prospective cutoff is 60 minutes before kickoff. Research and process details remain private; the front page is Beta and reads qualified artifacts.

## Review decisions 1–14

### 1. Tiered objectives

Tier A is scores-only public models, including FiveThirtyEight Elo and SRS variants, without market or injury inputs. Its eventual registered claim is 5% CRPS gain per target with simultaneous one-sided 95% lower bounds and Bonferroni adjustment over a fixed family. Freeze registry membership before comparative results are viewed. Decision 14 moves registry implementation and adapters to the backlog. Cycle one makes no GitHub superiority claim.

Tier B includes the market-only baseline and market-informed models such as nfelo. Its claim is CRPS parity within a declared tolerance plus positive mean CLV on flagged games. There is no percentage-improvement superiority objective for Tier B. Parity tolerance and the inferential population must be declared before its comparison is run. Cycle one retains the market-only baseline and market residual model without external adapters.

### 2. Discrete margin distribution

Primary margin distribution: empirical residual mixture with explicit integer point masses, estimated from margin-minus-cutoff-line residuals. Use an era boundary of 2015 for the mass-at-3 estimate. Preserve mass at key final margins including 3 and 7. Residual coordinates must be translated back to integer final-margin coordinates for each quoted line; do not place final-score key numbers blindly at fixed residual values.

Test kernel bandwidths {0.5, 1, 2, 4} and a smoothed integer histogram candidate. All masses, smoothing and calibration use earlier out-of-fold records only. A discretized Gaussian is the registered margin fallback, not the primary candidate. Totals retain the Gaussian-versus-kernel test with bandwidths {1, 2, 4}. Do not refit location settings during shape testing. Specify histogram smoothing and how explicit atoms partition probability from the kernel before Step 6 registration; do not silently choose these after results.

### 3. Market residual model

Production path: weighted ridge on final margin minus cutoff expected home margin, and final total minus cutoff total. A quoted home handicap s implies expected home margin -s. Normalize signs before forming residuals. Add predicted residual to the cutoff line location before constructing the outcome distribution. Fit and select separately by target using rolling-origin validation.

The convex CDF blend remains diagnostic only. It cannot become the production path by winning an unregistered comparison.

### 4. Automated cycle-one features

Only prior-week scores, home/neutral status, decay weights, QB-out indicator from nflverse injury and starter data, kickoff-hour wind, dome indicator, and open-to-cutoff line movement are allowed. Add a no-decay control to half-lives {1, 2.5, 5} years. Retain ridge penalties {4, 16, 64}; select by target on earlier CRPS.

Use nflverse for scores, schedules, injuries and starters, The Odds API within the approved allocation, and Open-Meteo for kickoff-hour wind. No new player-roster project, possession simulator, agents or additional features. Archived realized weather and postgame starter data cannot masquerade as pre-cutoff forecasts or availability. Missing or unverified historical inputs are explicit evidence gaps, never invented timestamps or silently recoded QB availability. Source mapping, opening-quote definition and missing-feature rules must be frozen before fitting.

### 5. Books and quote identity

The research line panel is BetMGM, Caesars and FanDuel: median qualifying line, with a coverage flag when fewer than two qualify. Historical qualifying snapshots are at or before T-60 and no more than ten minutes earlier. Book update age is recorded separately.

Decision 11 expands pricing ingestion to BetMGM, Caesars, FanDuel, DraftKings and one sharp reference book. It does not silently change the three-book research-line definition. Store distinct research median and pricing-consensus identities. The live board, CLV and push probability use the executed book's frozen quote. Execution is at BetMGM or Caesars; a better reference-book quote is informational, not an executable quote for this board.

### 6. Populations

Regular season is primary. Tag Week 1 and Week 18 for conditional-edge filters. Do not choose evaluation membership from observed outcomes or successful predictions.

### 7. Pick log

From the first live week append every approved and declined pick with timestamp, executed/intended book, frozen line and price at approval or decision, model fair probability, vig-free book probability, approver and decision. Every pick references its forecast, pricing consensus and source quote identities. Distinguish intended book from confirmed execution on declined or unfilled picks.

Executed and paper picks are separate records and scorecards; never merge them. Approved is not automatically executed. Record actual fills separately, retain the approval quote, and use the actual executed quote for executed CLV. Closing quotes must match the executed book and market/side identity. Missing closing evidence means CLV unavailable, not zero. Preserve declined decisions without fabricating fills or P&L.

### 8. Correlated exposure (superseded by decision 13)

The former one-unit game cap is replaced by the two-unit cap below. Display the active cap. Marginal forecasts do not establish joint ticket probabilities or remove correlated exposure.

### 9. Source integrity

Hash and pin every ingested nflverse file, odds capture and Open-Meteo response. Store exact bytes with source, retrieval time, availability class and immutable content identity. A changed hash creates a new version, never an overwrite. Propagate source versions through features, fitted parameters, forecasts, pricing and pick records. Never put credentials into artifacts or reports.

### 10. Market filter

Show only markets whose engine fair probability is in [0.60, 0.70] and whose executed-book price is at least 10 cents better than fair American odds. Apply the filter consistently to spreads, alternate spreads, moneylines, totals, alternate totals and props when a qualified model exists. This does not authorize a new props model; unsupported markets stay unavailable.

Store fair probability, fair price, book price, price edge in cents and executed book on every pick, including declined picks. Keep engine probability and devigged book probability separate. An already normalized engine distribution has no bookmaker vig to remove again. Power devig is for book quotes. Declare win/push/loss versus conditional non-push probability semantics and the American-price cents convention before Step 4; do not double-remove vig or treat pushes as losses.

### 11. Pricing layer before model work

Ingest five books as specified in decision 5. Select the sharp reference and verify its provider identity before the paid pilot. Devig each complete two-way or three-way market using the power method: convert prices to implied probabilities q_i and solve sum(q_i ** k) = 1. Validate positivity, convergence, complete outcome sets and market identity. Do not combine opposite sides from different lines as a complete market.

Persist each book's fair probabilities, per-market consensus fair line and best available price per side with snapshot identities. Every forecast and pick references the relevant consensus and executed-book quote, with explicit unavailable status for a football forecast without market evidence. Freeze the consensus aggregation and line-alignment method before Step 3 implementation. Best price across reference books is distinct from best executable price.

The explicit revised numbered order governs: Step 1 power and Step 2 pilot precede Step 3 pricing. Pricing is the first product implementation deliverable, before baseline or model work. No provider calls during pricing development: use pinned pilot captures and synthetic fixtures.

### 12. Teasers

Price two-leg and three-leg teasers at the book's frozen teaser odds using discrete margin probabilities. Flag Wong legs: favorites -7.5 through -8.5 and underdogs +1.5 through +2.5, with the teaser actually crossing both 3 and 7. Store each leg's threshold, fair probability, ticket fair probability and price edge.

Before enabling the module, reproduce per-leg hit rate on nflverse 2015–2025 with historically evidenced spread inputs and current frozen book teaser pricing, and cite the experiment record. Current pricing applied to history is a counterfactual pricing exercise, not historical executed profit. Do not invent unavailable 2015–2019 lines from the later Odds API archive.

Ticket joint probability is not identified by marginals. Before implementation, obtain a decision on dependence treatment, permitted leg combinations, teaser points, push/void settlement and source of book teaser odds. Do not silently multiply correlated leg probabilities. If historical lines or joint assumptions are unresolved, keep teaser board enablement blocked while reporting the evidence gap. No extra API calls outside authorized acquisition windows.

### 13. Sizing and caps

Quarter Kelly at the executed price using engine fair probabilities. For win/loss without pushes, f = 0.25 * max(0, (b*p - (1-p))/b), where b is net decimal payout. With pushes, use explicit win/loss/push probabilities and the corresponding push-aware Kelly expression. Convert bankroll fraction to units only after bankroll and unit definition are supplied.

Cap each ticket at two units and aggregate stake per game across all markets at two units. Display and enforce both caps atomically across both users, including open approvals/reservations. Define multi-game teaser exposure accounting before enabling teaser sizing; do not count a teaser as zero game exposure. Never submit a bet automatically.

### 14. Comparator scope

Tier A GitHub registry and all external comparator adapters are backlog only. Retain the market-only baseline and residual model. Future comparisons require commit pins and cutoff labels. Archived forecasts issued at another cutoff receive DIFFERENT_CUTOFF_NOT_A_SUPERIORITY_TEST. No external adapter implementation in cycle one.

## Ordered execution: stop and report after every step

### Step 0 — documentation only

Archive the prior document byte-for-byte to 99_archive/superseded/, update this same path and bump to version 2.0. Do not create another active plan. No model, provider, interface or registered experiment edits.

### Step 1 — power gate before model work

Read saved paired per-game losses without rerunning or rescoring E3. Simulate true gains {0%, 1%, 2.5%, 5%, 7.5%, 10%}, horizons {1, 2, 3} seasons, week-block lengths {1, 3, 6}, and 1,000 replicates per cell, preserving saved paired-loss dependence. Evaluate the owner-amended planning-family simultaneous one-sided 95% lower-bound claim above 5% with fixed-family Bonferroni correction. This is not a Tier A registry test. Use paired season/week resampling and a frozen seed and configuration. This is planning sensitivity, not new model performance or reversal of E3.

Write the complete design, source hashes, family size, per-cell results and smallest whole-season endpoint reaching at least 80% power at 7.5% true gain under all three block choices to a named immutable experiment record. Otherwise write INFEASIBLE_WITHIN_3_SEASONS. That result prohibits all subsequent steps. Aggregate scorecard means alone cannot preserve paired dependence: locate read-only underlying rows or report blocked.

Owner amendment: this planning family is N0 and market-only across margin and total (family size 4, alpha 0.05/4). If the saved scorecard lacks market rows, use N0 only across both targets (family size 2, alpha 0.05/2) and record MARKET_BASELINE_PENDING_STEP_3. Tier A stays backlogged and is not this family. Include 1% in the true-gain grid. Parity cannot be tested without a declared tolerance and market losses; a zero-gain scenario alone is not parity.

### Step 2 — coverage pilot only, after explicit spending approval

Hard cap 200 credits, five books, seasons 2020–2025. Freeze sampled kickoff timestamps and book IDs before querying. Reuse captures for games sharing kickoffs. Report qualifying snapshot coverage by book and season, including sampled numerator/denominator, missingness and timestamp gaps. A sample pilot cannot claim measured coverage of every season kickoff. Report full-season coverage unknown unless existing captures cover it.

Stop before any further spend. Requested post-pilot buckets are 15,000 historical, 3,000 live, 2,000 reserve. They total the stated subscription capacity before the pilot. Reconcile whether the pilot is deducted from historical allocation or funded separately before any charge; never allow total spending beyond available credits or approved buckets. No silent budget increase. Count attempted/uncertain charges and reconcile quota safely.

### Step 3 — pricing layer

Implement decision 11 on cached captures, with hand-solvable two-way and three-way power-devig tests, price conversions, same-line matching, incomplete-market rejection and executable/reference-book separation. No model fits or provider calls.

### Step 4 — arithmetic, distributions, scorer and pick schema

Package name engine. Preserve interface names and existing specified responsibilities: AsOfView, FittedModel, TargetForecast, ScoreRow. Ask before modifying any existing signature. Models never fetch data, mutate ledgers, read target labels or choose populations.

Targets are final home-minus-away margin and final total including overtime. For home handicap s, cover is M+s>0, push M+s=0. Preserve discrete push mass. Implement market filter fields and immutable pick history.

Tests: integer and half-point pushes, home/away symmetry, neutral venues, ties, overtime, unit probability mass, monotone CDFs, independent expected-distance and CDF-sum CRPS agreement within 1e-9, and CLV against the frozen executed-book quote. Report line CLV and price changes separately rather than inventing a single conversion when both move. Freeze the headline CLV convention before implementation.

### Step 5 — offline baseline replay

One command produces forecasts, separate CRPS and betting scorecards, and a report with no provider calls or website. Use market-only and existing baseline components. No fictional executed bets: without real pick/closing evidence, the betting scorecard reports unavailable values and distinct paper records where justified. Every numerical result cites its immutable experiment record.

Deliver one verification command and one replay command for a named immutable experiment when implemented. These are deliverables, not commands claimed to exist at Step 0.

### Step 6 — discrete distribution, residual model, teaser module

Implement in that order after the power gate and prior steps pass. Generate rolling-origin validation from 2013, development evaluation from 2016. Report margin residual sigma per season to its experiment record. Select settings per target on CRPS. Freeze location settings during shape comparison. Shorter historical market/feature coverage limits eligible residual experiments; do not impute unobserved early market data to satisfy the start year. Reconstructed data remain labeled.

Complete teaser historical reproduction and resolve joint/settlement assumptions before board enablement. Stop at unresolved evidence or approvals rather than adding new features or sources.

### Step 7 — prospective artifacts, board and sizing

Freeze inputs at T-60. Never backdate a late forecast or overwrite one after observing outcomes. The page reads qualified artifacts and never fits models. Separate manual live previews from canonical scored forecasts. Integrate filter, approval/decline log, executed versus paper records, two-unit caps and quarter Kelly only after prerequisites pass. Preserve last-good artifacts with original age. No scheduled provider calls until their schedule and spending are registered and approved.

## Decisions to resolve at the relevant gate

Step 1 multiplicity resolved by owner: N0 plus market-only, two targets, with N0-only family size 2 if market rows are absent.
Step 2: exact sharp book/provider mapping and pilot-versus-monthly budget allocation; explicit credit-spend permission.
Step 3: consensus aggregation and compatible-line rules.
Step 4: conditional versus unconditional filter probability, price-edge cents and executed-book headline CLV definitions.
Before model comparison: Tier B parity tolerance, units/CLV acceptance thresholds and settlement population; atom/kernel/histogram specification and historical feature availability.
Before teaser enablement/sizing: historical line coverage, book teaser prices/points/settlement, dependence assumption, bankroll-to-unit conversion and cross-game exposure allocation.

These are unresolved decisions, not permission to change a gate or improvise a result. They do not prevent completing Step 0. Prior acceptance thresholds are not silently replaced.

## Hard rules and reporting contract

- Read frozen experiments, archived forecasts and saved scorecards only. Do not touch them otherwise.
- No Odds API calls outside Step 2 and an explicitly registered live schedule.
- Never advance past INFEASIBLE_WITHIN_3_SEASONS.
- No unrequested features, models, agents, rosters, possession simulation, UI expansion or refactors.
- Stop and ask before deleting a file, spending credits, changing a registered gate or modifying an interface signature.
- Every numerical claim in a report cites its experiment record. Design constants in this plan are owner decisions, not measured results.
- Stop after each numbered step. Report exactly four lines, under 150 words:

DONE: [step number and one line]
TESTS: [pass/fail counts]
ARTIFACTS: [paths written]
BLOCKED: [what needs a decision, or NONE]

## Owner version-control amendment

Owner explicitly redirected backfill to the public GF4E/NFL-Projection-Lab repository on orphan branch engine-v2. Never push main or os01-hosted-diagnostic-v1. This supersedes the unavailable private-repository destination for these artifacts. Credentials and keyed raw odds transport remain excluded. Daily launchd backup targets engine-v2 only at 23:00 machine-local time. Commit and push after each completed step, adding COMMIT to the report. The nested work/site-beta checkout and bundled site archives remain excluded; source files exceeding 50 MB stay local and ignored.
