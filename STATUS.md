# Current status

Date: 2026-09-07, Europe/Rome.

Current step: Week 1 pricing operations — coverage diagnosis and four-book board complete; T65 refresh/T60 artifact scheduler operational. Actual game-window captures remain pending. Models, power simulation and teasers remain deferred.

Last verified commit before this status update: `f9d5b79236a9cea41e90a592be06849300f60483` on `engine-v2`. Run `git log -1 --format=%H` for the commit containing the latest status update.

Credits remaining: **79 of 300**; 221 accounted (217 confirmed + 4 held), including 18 reserved for upcoming refreshes and 61 unallocated. This operations update spent **0**. [Evidence](work/week1-operations-v1/experiment.json)

Next decision needed from Gabe: **NONE** within current scope and budget. Approval is needed before exceeding the cap, deleting files or changing a registered gate.

Launchd execution is verified after Full Disk Access was granted. The hourly heartbeat appeared in the actual launchd log; 29 tests passed, none failed. A waiting periodic job can show `not running` between successful invocations. [Verification](work/week1-operations-v1/experiment.json)

Local schedule timezone: **Europe/Rome (CEST)**. The opener's T65 refresh is **Thursday September 10 at 01:15**; T60 is 01:20. The US Thursday game's T65 refresh is **Friday September 11 at 01:30**; T60 is 01:35. Both are explicit in the [schedule](work/week1-followups-v1/schedule.json); registered UTC times are unchanged.
