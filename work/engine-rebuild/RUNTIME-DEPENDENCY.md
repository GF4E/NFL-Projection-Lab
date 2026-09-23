# Installed scoring dependency qualification

Infrastructure correction only. The live scientific runtime lacked scoringrules even though the environment YAML requested it: the explicit conda restoration file excludes pip wheels. Fresh inspection established the absence. No model fitting, point/distribution change, experiment registration, control promotion or paid provider request occurred.

## Exact package and restoration

Installed the previously selected scoringrules 0.10.0 pure-Python wheel, SHA256 `b29d3489e62e830cb4e321c4d070e3099c148097f21b2bc4eb0fce4f6bd6a248`, from the recorded public PyPI release. It requires Python >=3.11, NumPy >=1.25 and SciPy >=1.10, already met. Optional acceleration extras were not installed; the engine selects the NumPy backend. Wheel metadata and the original wheel are retained, the latter in private recovery storage on the Mac and host.

`ops/cloud/pip-requirements.txt` is the hash-pinned pip lock. Both conda bootstrap branches install it with binary-only, hash-required and no-dependency flags, then check compatibility. The YAML's duplicate pip section was removed so an unhashed earlier pip step cannot run first. The unchanged conda explicit lock remains the scientific base; it cannot alone restore the entire runtime. These controls follow [pip secure-install documentation](https://pip.pypa.io/en/stable/topics/secure-installs/). Four command-level tests exercise YAML and explicit paths, missing requirements and failed installation; these do not pretend to rebuild a full conda runtime.

## Host evidence

An isolated wheel installation under nflengine passed all 84 calibration tests before installation into `/opt/nfl-runtime/env`. The live addition ran under the existing cloud-dispatch lock, with a 45-second command ceiling and no scientific dependency resolution or upgrade. `pip check` passes; the service account imports the installed package without a special PYTHONPATH.

Before/after receipts at 18:23:23Z and 18:24:17Z on 2026-09-23 show exactly one new package, scoringrules 0.10.0, and none removed or upgraded. Every one of 2,988 NumPy/SciPy/pandas files retains its aggregate content identity. Sixteen current bundle-backed forecasts reproduce exactly before and after; all 52 original lock/grade hashes and the active fit `801ef07927ea59bc112fc955ad86249b981d5e60a0f4a9636f39b2eb23be623f` are unchanged. Host checkout at the after receipt: `99d64cc4f383b116e3ae567664ab288cf68462ca`. This is direct host/runtime verification, not an inferred deployment from repository configuration.

After installation, the actual service account passed 84 calibration tests, 218 frozen Week 1 tests and five scoring reconciliation tests (307 total); all tests used the installed package without a canary path. Isolated removal/absence rollback also passed. See scoring-runtime-installed-tests.log and scoring-runtime-rollback-canary.log. Scheduled capture and watchdog services subsequently reported successful execution.

Evidence: scoring-runtime-before.json, scoring-runtime-after.json, scoring-runtime-parity.json, scoring-runtime-installed.log, scoring-runtime-isolated.log and tests-runtime-bootstrap.log. Package inventories and hashes are public-safe; credentials and wheel archives stay private.

## Recovery and remaining scope

Package rollback for this exact addition is removal of scoringrules under the same dispatch exclusion, followed by the original package inventory and forecast-parity checks. There was no prior scoringrules version to restore and no dependencies were changed. The retained wheel can reapply the exact release. An isolated disposable environment verifies installation and removal to the absent state; it is not represented as a production rollback or full-runtime restoration.

Actual historical workload resources, corrected deployed-control authority, Tuesday registration, public closeout/refit ordering and real reviewer decisions still govern E-CAL. Installing its library does not satisfy those conditions or start fitting. The storage peak profile remains INCOMPLETE_DEADLINE; full-tree traversal and competing host work are possible contributors, not diagnosed causes. Existing logs cannot apportion their costs. A later profile must retain intermediate evidence before retrying the fixed limit. Daily capacity observations continue; no headroom alert was cleared.

Least certain: the full historical workload's resource behavior; the fixture suite does not settle it, so no experiment starts on this evidence alone.

Confidence: near-total in the narrow package/forecast parity claim, meaning arithmetic and hashes on verified files and rows. Lower to high if independent inventory or forecast reproduction differs. This is not a confidence rating for predictive improvement or full operational readiness.
