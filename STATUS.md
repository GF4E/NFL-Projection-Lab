# Current status

Date: 2026-09-08, Europe/Rome.

Current step: harvest-three follow-up and paper-rule registration complete. T60-issued historical forecast validation is blocked by archive provenance/coverage; stitched forecasts are diagnostic only. [Report](work/harvest-weather-followup-v1/REPORT.md). Prospective weather dispatch remains to be implemented before paper collection.

Last verified commit before this update: `59183797544f07c96de5b943afca0079db348fee` on `engine-v2`; use `git log -1 --format=%H` for this update.

Active [board](outputs/week1-pricing/b8abbbed73959c5e/week1_board.csv) and [pricing](outputs/week1-pricing/b8abbbed73959c5e/pricing.csv) are offline replays of saved quotes, not refreshed odds. Model fields cover game markets; player props retain consensus-only pricing. Caesars still has no priced quotes in these captures.

Credits: 221 accounted, 79 remaining; 18 reserved for scheduled live refreshes. This run spent 0. Next decision from Gabe: NONE within authorized scope. [Experiment](work/market-distribution-v1/experiment.json)

T65 refresh schedule remains unchanged: opener Thursday September 10, 01:15 CEST; US Thursday game Friday September 11, 01:30 CEST. Actual T60 grading remains pending the scheduled artifacts, final results, and executed-book closing quotes for CLV. No closing-price collection was added.

Generate the [scorecard](outputs/scorecard.csv) with `/opt/anaconda3/bin/python3.12 -B -m engine.scorecard --scorecard`. Current logs have no picks; zero counts are not performance evidence. [Joint-log experiment](work/joint-scorecard-v1/experiment.json).

Weekly review: Tuesday 09:00 app-local, active. [Verification](work/harvest-elo-v1/verification.json). No live model location was changed and no Odds API credits were used. No immediate action required from Gabe. ANY/A and totals-companion research is now executable; prospective qualification remains separate.
