# Current status

Date: 2026-09-08, Europe/Rome.

Current step: empirical market residual distribution, pricing integration and offline grading delivered. The September 8 request authorizes this scope now; other deferred model experiments remain unchanged.

Last verified commit before this update: `e55945d1c55bd13e726f56ef1618f45be58fa177` on `engine-v2`. `git log -1 --format=%H` identifies the commit containing this status.

Active [board](outputs/week1-pricing/b8abbbed73959c5e/week1_board.csv) and [pricing](outputs/week1-pricing/b8abbbed73959c5e/pricing.csv) are offline replays of saved quotes, not refreshed odds. Model fields cover game markets; player props retain consensus-only pricing. Caesars still has no priced quotes in these captures.

Credits: 221 accounted, 79 remaining; 18 reserved for scheduled live refreshes. This run spent 0. Next decision from Gabe: NONE within authorized scope. [Experiment](work/market-distribution-v1/experiment.json)

T65 refresh schedule remains unchanged: opener Thursday September 10, 01:15 CEST; US Thursday game Friday September 11, 01:30 CEST. Actual T60 grading remains pending the scheduled artifacts, final results, and executed-book closing quotes for CLV. No closing-price collection was added.
