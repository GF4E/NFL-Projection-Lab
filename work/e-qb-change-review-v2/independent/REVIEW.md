# Independent E-QB-CHANGE review

Independent row computation used the authoritative deployed series, not prior aggregate results. No fitting or production modification. Reviewer scope: membership, arithmetic, provenance and depth-chart qualification; amended ledger review is pending.

## Recomputed premise and metrics

The control file SHA256 is `6a0238fcb08e5bfcf3a7daa6710e3c9cfb0f04b3c31dae77d3baa5f9b9956c10`, identical to the registry/registration and actual bytes. The schedule hash also matches. All 2,639 control game IDs and joined schedule IDs are unique. The recorded producing commit is `538ce1f424bfe794ecbccf64ccabc8e4e9bbfadc`; all seven source blobs listed in replay-receipt.json match that commit by hash. Production settings fit `8bd585610049c63e30aea2e675f61cd6e65a5c22b268e87f89971bb3bffa246d` matches its actual bytes. This verifies pinned provenance, not a fresh independent rerun of the forecasts or present host state.

| Group | Games | Team MAE | Team bias | Margin MAE | Margin bias |
|---|---:|---:|---:|---:|---:|
| Changed | 585 | 7.773328 | +1.181590 | 10.615290 | -1.343075 |
| Stable | 2052 | 7.517147 | -0.098177 | 10.128425 | -1.829702 |
| Unknown | 2 | 8.061250 | +4.335344 | 15.442036 | -15.442036 |

Bias = projected minus actual. Margin = home minus away. Starter classification uses prior completed REG game, retains season-openers, and follows the original schedule's team abbreviations. Independent implementation uses per-team shifted rows, not the original classifier. These are recorded schedule quarterback identities, not independent verification of every first snap or announced starter.

## Timestamp and chart evidence

The [primary dictionary](https://nflreadr.nflverse.com/articles/dictionary_depth_charts.html), inspected 2026-09-19 local, defines `dt` as the record load timestamp and rank within position slot. The [primary schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html) describes daily 07:00 UTC depth-chart updates with timestamped updates appended from 2025 onward. This supports source snapshot timing, not an announced starter, game-specific availability, or engine ingestion.

The pinned 2025 file includes timestamps from August 2025 to March 2026. The season filename alone cannot qualify a record. Using exact timestamp eligibility within seven days before T-75, all 73 changed-team sides in 64 changed games in 2025 have one unique rank-1 QB identity at the latest eligible team snapshot. 46 match the schedule's recorded game QB; 27 differ. None is ambiguous under this rule. These are chart-match counts ONLY; they do not measure engine lock accuracy or knowledge category 1.

Earlier normalized chart records explicitly carry `WEEKLY_PROXY_ISSUANCE_UNVERIFIED`, no `at`, and a 2026 retrieval timestamp. A week label by itself does not establish public availability before a specific game's lock. It can support a retrospective proxy analysis when labeled accordingly.

The deployed replay treats nflverse gametime as America/New_York. Independent chart review converted that timezone through DST to UTC and subtracted 75 minutes. Eligible comparisons are strictly `< T75`, not `<=`; 2025-11-09 13:00 ET lock is 16:45 UTC, versus September 13:00 ET lock 15:45 UTC. International games must use the same Eastern-clock schedule semantics, not stadium local time.

## Findings and required limits

1. No discrepancy in original group arithmetic or pinned source hashes.
2. Blanket unknown chart coverage is not defensible for 2025: the full changed-side population has timestamped snapshots. However snapshots do not turn into proven starter announcements or historical engine locks.
3. Backup/returning labels inferred from prior starts are proxies. Confirmed contemporary role needs separate source evidence.
4. Pre-lock quality rates must use strictly earlier completed games. Selecting the actual eventual QB retrospectively may be valid for a labeled diagnostic, but does not establish that QB was known at issuance.
5. `2025_18_NYJ_BUF` is a verified identity-definition dispute: the schedule QB is Trubisky but the [Bills official recap](https://www.buffalobills.com/news/top-3-things-we-learned-from-bills-vs-jets-week-18-x2872) records Allen taking one snap before Trubisky relief. The [NFL pregame article dated January 2](https://amp.nfl.com/news/bills-josh-allen-foot-good-to-go-jets-consecutive-start-streak) said Allen would continue his starting streak, with a cameo considered likely. The rank-1 Allen chart therefore is not demonstrably an incorrect literal starter. Preserve the registered population as schedule-QB changes and report sensitivity excluding this disputed game; do not silently rewrite it.
6. A recorded `qb_id` in a reconstructed personnel payload is not an as-issued lock; calibration/Elo-only retained groups do not prove historical identification failure or causation.

Confidence: near-total for the limited central claim that the pinned rows reproduce the group counts and arithmetic above; near-total means arithmetic on verified rows. Downgrade to high if independent inspection finds a schedule identity revision or mapping error that changes group membership. The causal diagnosis is not established by this review.

## Final amended-ledger recomputation

The earlier pending-ledger scope above is superseded by this addendum. Final reviewed game-ledger SHA256: `b8e5825ed4f6aa0b3310411d3cbc2e7240f1aee64b16b61e387079af43729d8a`. Results SHA256: `24abfb945c9c374ac99b3372f6c6bb4ead8dceffe22da43ac07998c6648c0da8`. Additional sensitivities SHA256: `d50ec990888286ca00a2da3e35baf5571c84180344ffa20d595df7dc71867f60`.

`check_tables.py` imports no main diagnostic helpers. It independently reconstructs four game-level error measures from authoritative forecast bytes, selects memberships from the amended ledger, and recomputes all47 comparison tables including seasonal, leave-one-season-out, dimension cells, qualified/unqualified, strongest provenance, single-dispute exclusion and three additional sensitivities. It independently resamples whole-game rows for2000draws per comparison using the recorded seed. Maximum absolute discrepancy is7.105427357601002e-15; no discrepancy exceeds1e-10. Both team errors remain within the same game row on every draw. This reproduces the registered resampling specification, not proof of causal exchangeability.

All10season coverage tables and all20accepted article upper-time bounds reproduce. The final chart joins reconcile all73raw2025changed sides after LA/LV/WAS to LAR/OAK/WSH normalization. The source-identity contradictions remain expressly reported, with frozen membership preserved and exclusion sensitivities shown. Historical lock identity remains unobserved; the selector is labeled reconstructed.

Six of the ten original announcement articles have modified timestamps in2023, after their associated games. Several cluster on February28, consistent with a possible CMS migration. That is not evidence the underlying announcement was absent before lock. Excluding them from strongest provenance while reporting the original-publication-date liberal sensitivity is a defensible conservative convention. The liberal sample remains selected and not qualified as an immutable historical content archive. Two additional late-modified2025articles are likewise excluded; two other articles contradict the frozen schedule identity. No “unknown” is converted into “not knowable.”

No remaining discrepancy in the checked tables. Outstanding acquisition and quality-vintage work in the report is real and has not been completed by this review. High confidence in a causal identification-versus-valuation diagnosis is not supported by these checks.

Confidence: near-total for the central arithmetic claim that all47comparison tables reproduce on verified forecast rows and the pinned ledger; near-total means arithmetic on verified rows. Lower to high if the ledger changes or independently verified source identity corrections change cell membership. This rating does not cover a causal diagnosis or the completeness of external evidence acquisition.
