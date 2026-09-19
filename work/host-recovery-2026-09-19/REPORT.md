# Host disk recovery

Before: root 8.7 GiB, 100% used, zero available. Main consumers: repository 3.2 GiB (including 1.0 GiB Git objects, 1.6 GiB work records, 652 MiB outputs); swap 2 GiB (retained); /usr 1.7 GiB; runtime 1.3 GiB, including approximately 1 GiB of package cache; /var 529 MiB.

Removed only package-manager caches and rotated logs: apt-get clean; micromamba clean --all (no force-pkgs-dirs, no environment symlink targets found in the cache); disposable apt repository indexes; journal rotation/vacuum to 32 MiB; normal logrotate policy. removed-files.json lists each removed pathname and logical bytes. Cache removal inventories are not disk-savings estimates because package hardlinks share blocks. Kept all repository evidence, forecasts, grades, fit artifacts, Git objects, the installed runtime, and swap. No test outputs were deleted; only ignored.

After cleanup: 719 MiB available, 92% used. Verified installed numpy 1.26.4, scipy 1.13.1, pandas 2.2.3 import successfully. Installed ops/cloud/journald/nfl-retention.conf: 32 MiB journal maximum, 512 MiB filesystem reserve, 8 MiB journal files. This controls journal growth, not repository growth; remaining capacity is limited.

The scheduler resumed after cache cleanup and before maintenance pause; it committed pending final-feed.json and subsequently refreshed its source and published the DET-BUF final grade. Verified remote commit 5d73c989aa5b1b467926d4baae7424fb2e3be84f, tracked host tree clean. Preserved the pre-recovery modified feed snapshot as final-feed-host.json. Do not ignore final-feed.json: it is a publication record.

Untracked triage: all 440 paths are generated tests, verified against tests/test_week1_{slip,t75,scorecard,market_distribution,live_weather,pricing,followups,harvest}.py. triage.json lists every path. Narrow directory ignore rules added; zero untracked artifacts to commit, zero unknowns. Tracked historical test fixtures remain tracked. No blanket work/ ignore.

Capture/daily timers briefly paused after recovery for reconciliation, then restored after the ignore rules reached the host. No unscheduled provider capture invoked. See after-host.txt for final service and free-space verification. No research was run before host recovery.
