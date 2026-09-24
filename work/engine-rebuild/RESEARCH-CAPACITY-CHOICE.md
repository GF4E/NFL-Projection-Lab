# Proposed research-capacity correction — not approved or executed

The production droplet is recorded as `s-1vcpu-512mb-10gb`; live Linux reports 480,497,664 physical bytes. At 2026-09-24 03:05:37 UTC MemAvailable was 198,443,008 bytes. Existing full-size research canaries repeatedly exceeded their protective 256 MiB cgroup. The latest exact-result local workflow passes in 35.057 seconds but samples 458,489,856 resident bytes. Platform measurements are not interchangeable, and this is no proof that the real experiment will fit a larger worker. Do not launch another full-size production-host trial merely because local allocation improved.

The existing Mac has 36 GiB RAM but no installed Linux container/VM tools. Its RSS observer qualifies diagnosis, not the already required hard Linux resource supervisor. A new VM stack could avoid recurring cost, but adds another runtime to maintain and qualify. The simpler proposal is a CPU/RAM-only resize of the existing droplet to the regular one-vCPU / one-GiB plan, preserving its disk and approved external storage.

## Concrete proposed cost and scope

Official current pricing: 512 MiB regular plan USD 4/month, one GiB regular plan USD 6/month. Increment is USD 2/month before tax. The already approved 20 GiB volume remains USD 2/month; combined droplet plus volume would be USD 8/month before tax and other account services. Do not assume the user-reported USD 3.29 promotional credit applies or remains valid. Verify the account's current size, target availability and exact price before action; stop if the quote exceeds this proposal.

Sources checked 2026-09-23 Pacific:
- https://www.digitalocean.com/pricing/droplets
- https://docs.digitalocean.com/products/droplets/how-to/resize/

The provider supports CPU/RAM-only resizing and requires shutdown. Its estimate is roughly one minute per GB of used root disk, potentially shorter. Reserve a ten-minute maintenance window, outside captures/locks and the three cutoffs, rather than promising zero downtime. Increasing disk is not proposed; it would prevent reversing disk capacity.

## Execution after explicit approval

1. Verify current and target plan/price through authenticated provider state. Recheck the next production deadline and active operation handles. Defer if the maintenance reserve is unavailable.
2. Acquire the existing ownership fence, pause the five NFL timers and drain active work. Do not kill a paid request or let the Mac standby double-capture. Preserve their exact prior states and all durable dispatch receipts.
3. Refresh and verify the existing off-host record/private-state backup and runtime/source recovery evidence, including all locks, first grades and active pointers. No additional paid snapshot is authorized by this proposal.
4. Gracefully shut down. Submit one CPU/RAM-only resize with disk resizing false, retain the provider action ID, and reconcile that exact action before retrying an uncertain response. Restart after completion.
5. Verify actual RAM, both persistent mounts and their identities, installed runtime/source/active fit, all original record hashes, service-user durable writes and original timer states. Restore exactly the previously active timers; observe subsequent scheduled capture/grade/watchdog receipts.
6. Run the full-size isolated calibration canary under one worker, the existing 4 GiB address-space ceiling and a stricter host-sized cgroup chosen after measuring headroom, zero swap and the 570-second operational deadline. Keep production input/output read-only and networking disabled. Only a complete execution, ledger, exact retry and report qualifies this workload. Failure does not authorize another resize or a model change.
7. Report installed size, actual incremental price, provider action result, preservation and live scheduled recovery evidence, and remaining experiment prerequisites. If operational validation fails, retain the old model and explicitly reconcile rollback; never restore stale files over new locked records.

Approval is necessary because the adopted rebuild scope prohibits new spending without explicit authority; storage approval covers the 20 GiB volume, not CPU/RAM resizing. No approval is inferred from silence. This is an infrastructure-capacity proposal, not a statistical gate amendment.

Confidence: medium that one GiB is sufficient for this measured workload; this relies on cross-platform memory evidence and a future bounded host trial. Lower to low if independent Linux measurement or actual pregame workloads need materially more memory. No accuracy improvement is claimed.
