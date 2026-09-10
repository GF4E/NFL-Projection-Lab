# Locked board reader

The Sunday board displays `outputs/model-pick-v1/board.json` from the public
`engine-v2` branch. This branch contains only the reader, its display DTO and
its tests. It contains no new model, provider capture, grading logic or real
forecast fixture.

`/api/model-board` and the legacy `/api/decision-board` alias are GET-only.
The old website model/provider cron and navigation-triggered maintenance are
replaced by the publication reader on main; engine-v2 owns the live schedule. Scheduled publication refresh runs on the existing
five-minute cadence. Valid JSON replaces the D1 last-good publication; failed
requests, malformed payloads, publication rollback and changed first finals or
grades preserve the prior publication. An empty cache bootstraps by reading the
same GitHub artifact, without writing through a public request.

The reader suppresses non-final verdicts after the engine-provided quote expiry
or after fifteen minutes without a successful publication check. It never
recomputes selection, price, fair probability, EV or grades. The browser reads
this endpoint every thirty seconds and hides unverified pending verdicts after
an error. Final results remain visible.

Each decision window contains only the spread and total verdicts. A finished
game shows its final score and the model's first W, L or PUSH grades. MISSED
remains MISSED, including after a final; it never implies a retrospective pick.
TEASE is a priced leg needing a partner, not an executed ticket. Its displayed
final model grade is explicitly the original locked straight-pick grade.

The retired interactive calculator's positive source-text assertions were
replaced with reader entrypoint checks. Server/domain/numerical assertions are
retained. `locked-board.test.tsx` verifies published states, final grades,
freshness and last-good behavior. `week-board-ui.test.tsx` verifies the new
read-only request path and interactions.
