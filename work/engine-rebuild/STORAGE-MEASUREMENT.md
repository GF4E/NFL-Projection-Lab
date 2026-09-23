# Durable storage observations

The approved 20 GiB migration remains verified; this increment measures remaining capacity rather than asserting that free space is a durable reserve. No additional resource purchase, deletion, model change, candidate fitting or forecast activation.

The existing minute monitor now retains the first physical filesystem observation in each five-minute bucket, in hourly files under `/var/lib/nfl-engine-monitor/storage`. Its new systemd StateDirectory survives reboot, while operational liveness stays under `/run`. Existing mount dependencies and hardening remain. Both root and artifact filesystems carry filesystem identity, total/available bytes and available inodes. A changed identity starts a separate series. Durable hourly data precedes the recoverable latest cursor. Collection errors raise their own finding without hiding disk exhaustion.

Read-only summaries distinguish net consumption from positive sampled depletion and disclose missing intervals. A normalized short-window daily rate is an extrapolation, never a measured day. No summary can automatically qualify headroom. Transient writes between samples, Git repacking, backup/restore workspace, full historical experiment outputs and future growth remain separate reserve components.

CONVENTIONS: Tier 1 first observation per five-minute bucket, matching the existing minute monitor; gaps greater than two observation intervals are disclosed without interpolation. Tier 2 REVIEW REQUESTED remains for any future reserve horizon or safety allowance; no such threshold is installed here.

Eight measurement tests pass on the actual Linux runtime under the service identity; systemd unit validation passes. Forty-five focused local storage/watchdog tests and the broader 484-test projection suite pass. One earlier fixture omitted the existing observer epoch; that failed log is preserved, and the fixture was corrected without weakening production checks.

The full captured lifecycle is profiled independently in an isolated directory with synthetic availability/clocks/finals, under one worker, a 4 GiB address-space ceiling and a 570-second deadline. It uses the existing refit/prepare/lock/rollback/grading harness; no providers or production writes. Measurements occur before atomic namespace operations, while staging files still exist, and count allocated blocks once per inode. This is an observed workload peak, not a proof of the largest possible write.

Confidence: high in measurement integrity, meaning it survives the obvious retry, clock, identity and collection-failure alternatives. Lower to medium if independent host measurements disagree. Sustained headroom remains unqualified pending elapsed-time and workload evidence.
