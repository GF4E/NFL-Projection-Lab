# BOARD v9 verification — 2026-09-20

Six columns: MATCHUP, OUR SCORE, OUR SPREAD, TOTAL, CONTEXT, RESULT. Book references, disagreement bars, leans and market outcomes are absent from collapsed, expanded and ERROR views. Legacy board aliases redirect to the same current /sunday board. Weekly diagnostics remain in reports.

Winning code: white, 700 weight, team-color dot; other code muted, 500. Winning score white, other score muted. Actual winner keeps its independent inverted chip. Logos and away/home stack preserved. Total uses the exact engine 50% band with display-only rounding, plus league percentile. Team context gives its empirical percentile with prior-season/count flag below four same-version completed games. Errors are actual minus displayed prediction; 50/80 membership uses the original distribution.

Context is produced by engine/board_v9.py in engine-v2. Every sample precedes original issuance; no model changes. The server verifies content SHA256 and the client verifies version, issuance and displayed scores. Missing/stale context states what is missing. All current team contexts are flagged prior-season because exact-version counts are below four. See the engine report for the 1,401-reference chronology audit.

## Checks

Responsive browser checks: 390, 1280 and 360 pixels, no horizontal overflow. Collapsed, expanded and ERROR states contain no excluded vocabulary. Logos load. Computed styles verify projected dots/bold codes/scores separately from actual-winner chips. Snapshot fixtures cover both an upcoming and a final game at 390 and 1280 in screenshots/. Fixtures are intentionally synthetic and are not production grades.

Full UI suite: 355 passed, 1 skipped. Runs with TZ=Europe/Berlin, the timezone of the pre-existing v1 snapshots. TypeScript and production build are checked separately. No raw provider files, model artifacts or new logo assets are committed to main. The deployment mirror is generated only from dist by the existing publish step and carries the main source hash.

Confidence: high — source chronology checks and browser measurements independently support the implementation. Lower to medium if an independent data audit or supported browser shows a version mismatch, future-game reference or rendering discrepancy. The honesty line is the requested approximate description, not a new statistical estimate.
