# Player-source capability screen

Private research · September 6, 2026 · Public documentation only

**The standard SportsDataIO archive does not resolve the historical pregame population gap. Sportradar is a participation-label lead, but its Tuesday roster-vintage capability remains unverified.** Neither source is admitted. The owner approved the documentation inquiry below, which was sent September 6, 2026. No data endpoint, account, trial or purchase was used.

| Source | Verified documentation | Result for this project |
|---|---|---|
| SportsDataIO historical archive | Retains final revisions, without old versions, correction logs, point-in-time snapshots or as-of queries. Depth charts are current-only. Team rosters are overwritten each season; its suggested historical reconstruction uses players who recorded stats. [Historical guide](https://sportsdata.io/help/historical-data-integration-guide) | Exclude this standard archive as the proposed solution to historical Tuesday membership. Stat-producer reconstruction would repeat the population-selection problem. This is a task-specific capability finding, not a general judgment about data quality. |
| SportsDataIO game statistics | Documents postgame snaps and game inactive indicators. [NFL workflow](https://sportsdata.io/developers/workflow-guide/nfl) | Potential label evidence only. Complete played-zero/DNP coverage was not established, and these fields do not recover earlier roster versions. |
| Sportradar roster and game-roster feeds | Full team rosters include inactive and practice-squad members. Game-level `status` separates `deactivated`, `dnp`, `played` and `started`; `in_game_status` is a different live condition. Its change-log workflow compares updated feeds with data the client previously stored. [Roster guide](https://developer.sportradar.com/football/docs/nfl-ig-rosters) | Credible participation-label lead. Recoverability of old full-roster payloads is still unknown. A postgame roster cannot select the pregame prediction population. |
| Sportradar weekly depth charts | Season/week retrieval exists, but charts update shortly before games and may change during or after games. The documented fields/arguments do not identify an original issue time or as-of selector. [Weekly reference](https://developer.sportradar.com/football/reference/nfl-weekly-depth-charts) | Do not treat an archived week label as a Tuesday snapshot. Custom archives or an owner's previously captured payloads would require separate evidence. |
| Sportradar historical coverage | Regular/postseason data is documented from 2000; older fields can differ or be absent. [Historical guide](https://developer.sportradar.com/football/docs/nfl-ig-historical-data) | General history availability does not establish each required field, year, missing-row rule or zero-yard label. Those remain admission questions. |

The player experiment is deferred. The sent inquiry is a one-time capability check, not a recurring workflow or a project-wide dependency. A useful answer must point to repeatable API or versioned bulk access with documented coverage and timestamps. A source requiring continuing correspondence, manual exports or historical row reconstruction is unsuitable for routine operation. A bulk download, standard subscription or another player fit is premature. Independent team, market and reliability work retains its own scope.

## Approved inquiry — sent September 6, 2026

Recipient: **support@sportradar.com**, listed in Sportradar's [official NFL API Basics guide](https://developer.sportradar.com/football/docs/nfl-ig-api-basics) and verified September 6, 2026. Sent from the owner's connected Gmail account following explicit approval. Gmail returned message/thread ID `1a07683e729dd399` and the `SENT` label; this confirms submission, not receipt by the provider or a capability answer. [Private send receipt](../work/sportradar-roster-inquiry-send.json). No account, trial, subscription or data delivery is requested.

Subject: Historical NFL roster versions and participation coverage

For local educational NFL research, can you provide original historical full-team roster snapshots as known by Tuesday 07:30 America/Los_Angeles before a regular-season game, with publication times and later corrections preserved separately? We need stable player IDs, historical position/status, and defined coverage of active, inactive and practice-squad membership.

Your weekly depth-chart documentation permits updates during or after games. Do you retain earlier roster payloads, or another archive that supports the original pregame version? Please distinguish transaction effective dates from the time information first became available.

Separately, for 2013–2025, which game-roster and receiving-stat fields reliably distinguish played-zero, played-nonzero, DNP/inactive and unknown outcomes? Please clarify historical field completeness, signed/lateral yardage and missing-row semantics.

At this stage we only need schema/coverage documentation and applicable local-evaluation/derived-output usage terms. Please do not activate an account, trial, API access, data delivery or purchase.

## Scope and stopping rule

Root screened SportsDataIO's official historical/workflow pages; its full dictionary page failed to render. A separate agent attempted four Sportradar primary pages, with the game-statistics reference unavailable. Root checked the relevant roster/historical passages and followed one additional weekly-depth-chart reference that directly exposed the update-timing issue. No paid or authenticated content was accessed.

This screen changes the source shortlist and sharpens the missing evidence. It does not prove that every provider lacks a suitable archive. Do not repeat the same documentation screen, add recurring follow-ups or start a model fit while the same evidence is absent. Reopen only with substantive evidence of repeatable access; any later sample acquisition remains separately scoped. The owner is not assigned manual data collection.

[Exact data-admission need](player-data-next-step.md) · [Current goal](updated-goal.md) · [Frozen team result](team-backtest-result.md)
