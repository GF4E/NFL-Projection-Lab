# Week 1 coverage and T60 follow-up

[Active four-book board](../../outputs/week1-pricing/09647eb114428dc7/week1_board.csv) · [Pricing](../../outputs/week1-pricing/09647eb114428dc7/pricing.csv) · [Coverage matrix](../../work/week1-followups-v1/coverage-matrix-final.csv) · [Experiment](../../work/week1-followups-v1/experiment.json)

The regenerated board contains 1 qualifying offer, executable at DraftKings. Filter thresholds and devig mathematics are unchanged. Each row identifies its execution book. This is a captured consensus-price screen, not a predictive model or a claim that the quote remains available. [Result](../../work/week1-pricing-v1/result-09647eb114428dc7.json)

BetMGM alternates were successfully recaptured. Its three available alternate-yardage props are one-sided Over offers and cannot independently be devigged. The other requested BetMGM prop keys were not listed. Caesars was present in the market catalogue but returned no priced quotes. Catalogue absence alone does not prove a subscription restriction; no further coverage retries are scheduled. [Full matrix and request evidence](../../work/week1-followups-v1/experiment.json)

Credits: 217 provider-confirmed plus 4 conservatively held, 221 accounted against the unchanged 300-credit cap. Another 18 credits are ring-fenced for the scheduled refreshes. [Ledger](../../work/week1-pricing-v1/credits.jsonl)

## Scheduled operation

`com.gabe.nfl-week1-t60` is loaded with a 15-second interval, but its first background Python run stalls opening code. The same script succeeds manually. Background execution is **not verified**, so scheduled T60 delivery is blocked pending resolution of that file-access stall. macOS Documents permission is suspected, not established. See the experiment runtime verification and saved process sample. A mainline request at T65 is shared by games with the same kickoff. The T60-deadline artifact freezes in the preceding minute using that capture, never after the deadline. Its actual creation time and input time are recorded separately. The schedule covers all Week 1 games. [Schedule](../../work/week1-followups-v1/schedule.json)

This Mac must remain awake, logged in and online. An unavailable machine, failed capture, changed kickoff or missed cutoff creates a MISSED record. No retrospective T60 artifact is fabricated. Future T60 files do not exist yet. Successful output will be under `outputs/week1-t60/<group>/T60-board.csv` and `T60-pricing.csv` with an immutable receipt. The existing daily engine-v2 autosave preserves generated artifacts.

Verify:
```sh
/opt/anaconda3/bin/python3.12 -B -m unittest discover -s tests -p 'test_week1*.py'
```
Replay this named capture set without spending:
```sh
/opt/anaconda3/bin/python3.12 -B scripts/week1_pricing.py --manifest work/week1-followups-v1/combined-manifest.json
```
The normal `scripts/append_pick.py` workflow now accepts BetMGM, Caesars, FanDuel and DraftKings. Paper and execution records remain separate. [Verification](../../work/week1-followups-v1/verification.json)
