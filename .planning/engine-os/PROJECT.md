# Prediction Engine Operating System

## Core value

Create an artifact-driven prediction operating system that can prove what was knowable at each forecast origin, let small statistical modules earn their place, publish one coherent game-outcome distribution, and measure whether the output improves human judgment.

The system is not one expanding model. It is a controlled graph of data, experiments, model packages, forecasts, evaluations, and promotion decisions.

## Fixed truths

- Model Laboratory Module 1 ended `reject_all`. C0 is a research benchmark only.
- Model Laboratory Module 2 ended `reject_all`. P0 is a research benchmark only.
- Module 2B, a residual-kernel falsification, is the next authorized statistical experiment.
- All historical results through 2025 are research-exposed. They cannot be called pristine confirmation data again.
- The 2026 pre-kickoff forecast archive is the next honest confirmation stream.
- If the 2026 archive activates after Week 1, it is partial-season shadow evidence from its actual activation time; missing earlier weeks are never backfilled as prospective forecasts.
- The football-only model cannot use market prices, line movement, public betting, or recorded selections as features.
- Market comparison begins only after a football-only forecast is frozen.
- The system is self-updating under frozen rules. It is not allowed to select features or tune structure from in-season outcomes.
- Human adjustments and selected-opportunity outcomes never enter model training.

## Existing assets to preserve

- Cloudflare Worker and D1 operational runtime
- nflverse, odds, injuries, weather, pregame-context, and sentiment adapters
- staging, idempotency, quota, freshness, alert, and last-good behavior
- point-in-time, provenance, experiment, model-registry, forecast, and evaluation contracts
- Module 1 and Module 2 offline laboratories and their frozen negative results
- joint-score, market translation, power de-vig, scenario, probabilistic evaluation, and model-gate libraries
- governance configs, 52 research questions, ADRs, and the Novelty Charter

## Accepted operational foundations

- OS-15A qualifies the dormant, provider-free interim scheduler for the five accepted OS-02A horizons. Deterministic trigger and job identities, fenced renewable leases, duplicate convergence, strict pre-deadline persistence, contemporaneous withholding, heartbeat/watchdog recovery, reschedule handling, and a versioned OS-15 cutover contract passed local and isolated hosted qualification.
- A separate authenticated direct-D1 acceptance audit verified the preserved OS-01A/OS-19A schema objects, append-only guards, exact 38/462 bootstrap, zero outstanding reservations, and empty OS-02A/OS-15A production tables. It overruled a stale bounded database-viewer projection without changing the database.
- This bounded result starts no prospective stream and accepts neither immutable source capture nor the complete forecast ledger. OS-03A and OS-13A remain required, full OS-15 still owns the durable cross-job graph and scheduler retirement, and authenticated provider work remains disabled.

## Gaps the operating system must close

1. The active Worker and D1 control plane coexists with a second Supabase job path.
2. Migrations and runtime `CREATE TABLE` statements both claim schema authority.
3. Production manifests often preserve hashes but not durable raw source bytes.
4. The Python laboratory cannot yet export a package the TypeScript registry can verify and run.
5. The market-free forecast ledger is coupled to market freshness through decision-board construction.
6. The public board can initiate background maintenance.
7. No canonical as-of identity service joins player, roster, snap, injury, venue, and provider IDs.
8. Heavy refits and bootstrap work are assigned to a Worker runtime without a separate compute contract.
9. Monitoring still mixes all-game forecast evaluation with legacy selected-play reporting.
10. There is no validated market-free production candidate.
11. Ephemeral 2026 raw, issued-weather, exact-quote, and forecast-or-withheld evidence must be captured before the full platform refactor finishes.

## Architecture

```text
External sources
      |
Source connectors and validation
      |
Content-addressed raw objects in R2
      |
D1 source manifest, identities, and publication state
      |
Point-in-time replay and feature factory
      |
Research laboratory and frozen experiment registry
      |
Verified model package and model registry
      |
Scheduled market-free forecast compiler
      |

Forecast ledger ------- Market snapshot ledger
      |                         |
Outcome evaluation ---- Model-market comparison
      \                         /
        Versioned publication snapshot
                    |
             Read-only public API
```

## State ownership

- Git stores code, configuration, feature definitions, protocols, and small manifests.
- R2 stores raw source bytes, versioned Parquet data, large forecast grids, and model packages.
- D1 stores identities, manifests, job state, compact online features, registry metadata, forecast summaries, evaluations, and serving pointers.
- Python plus a locked analytical runtime runs historical laboratories and heavy fitting.
- Cloudflare Worker runs lightweight ingestion coordination, inference, publication, and read serving.
- A separate authenticated compute runner performs full-history refits, large bootstraps, and artifact publication.

## Non-goals

- No interface redesign in this roadmap.
- No automatic wagering or user-specific pick system.
- No autonomous feature search or in-season structural tuning.
- No second production database, hosted feature store, Kafka, or warehouse without measured need.
- No paid data dependency without an explicit coverage, rights, and cost decision.
- No public-versus-sharp claim without timestamp and source-population validation.
- No single unexplained confidence number.

## Definition of done

The operating system is ready when every scheduled game has either a pre-kickoff market-free forecast or an explicit withholding record, every input and model package is replayable from immutable artifacts, all-game outcomes are scored prospectively, market comparison is attached without modifying the football forecast, promotion follows frozen gates, failures preserve last good output, and the site reads one precomputed publication snapshot without causing writes or provider spend.
