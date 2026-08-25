# OS-00 Evidence and Ownership Freeze

This directory freezes the pre-OS scientific evidence and the authoritative engine boundaries. It does not run or promote a model.

## Files

- `evidence-inventory.json` lists every frozen Git-designated file and large Model Lab result object by byte count and SHA-256.
- `evidence-inventory.sha256` protects the inventory bytes inside the Git commit.
- `ownership-registry.json` assigns current and planned tables, object families, jobs, modules, and secret names to exactly one plane.
- `docs/architecture/ADR-0001-prediction-engine-authority.md` explains the decision, trade-offs, quarantine, and known transition work.
- `scripts/verify_os00_evidence.py` verifies the inventory, nested artifact manifests, terminal statuses, source index, and every cached source object.
- `scripts/verify_os00_ownership.py` detects unmapped D1 or Supabase tables and verifies the request/job quarantine controls.

## Clean-checkout and cache contract

The verification boundary has three independently testable layers:

1. **Checkout:** The 17 code, configuration, protocol, and contract files designated for Git must be tracked and must match the inventory.
2. **Artifacts:** The 19 scored outputs must exist either at their working-copy paths or in an artifact cache restored from R2. The cache may mirror repository paths or use `sha256/<digest>`, `sha256/<first-two>/<digest>`, `objects/<filename>`, or `<digest>`.
3. **Sources:** `source-index.json` plus all 33 source objects must be restored. The current working-copy layout is `.model-lab-cache/module-one/{source-index.json,objects/*}`. A unified restored cache may instead use `sha256/<digest>`, `sha256/<first-two>/<digest>`, `model-lab/raw/sha256/<digest>`, or `<digest>`.

The verifier never downloads an upstream URL. Current provider bytes are not a substitute for the preserved input.

### Working-copy verification

```bash
python3 scripts/verify_os00_evidence.py --scope all
python3 scripts/verify_os00_ownership.py
python3 -m unittest tests/test_os00_evidence_verifier.py
```

### Clean-clone verification after R2 restore

```bash
python3 scripts/verify_os00_evidence.py \
  --scope checkout \
  --require-git-tracked

python3 scripts/verify_os00_evidence.py \
  --scope artifacts \
  --artifact-cache-root /path/to/restored-model-lab-artifacts

python3 scripts/verify_os00_evidence.py \
  --scope sources \
  --source-cache-root /path/to/restored-model-lab-sources

python3 scripts/verify_os00_ownership.py
```

Use `--json` on either verifier for CI output. `--scope all` may combine the external cache arguments.

## Current receipt

On 2026-08-25, the working-copy verification passed:

- 70 files and 620,780,101 bytes verified.
- 33 of 33 source objects verified.
- Module 1 remained `reject_all`; Module 2 v7 remained `protocol_invalid`; Module 2 v8 remained `reject_all`.
- 74 current D1 table names and 25 quarantined Supabase table names were fully mapped.
- Three verifier tamper/missing-object tests passed.
- The `/sunday` maintenance side effect is removed, public Worker GET routes use a SELECT-only D1 wrapper, the legacy job endpoint returns 410, and its runner is a no-I/O tombstone.

## Open preservation and quarantine gates

- The 17 Git-designated Model Lab files are present but untracked in the current working tree. `--require-git-tracked` correctly fails until the integration commit includes them.
- The 502,101,912-byte source cache and 117,991,406 bytes of scored outputs are verified locally but are not yet durably uploaded to R2. OS-03 owns that upload and restore proof.
- Supabase job execution is retired, but login, callback, team-auth, and client sources still exist. They must leave the active dependency graph and their deployed variables must be removed before ARC-02 is fully accepted.
- Runtime DDL remains until OS-01 makes migrations authoritative.
- Heavy lifecycle fitting remains in the Worker until OS-15 establishes the compute runner.

These are explicit failed or pending gates. Their existence does not change the frozen scientific conclusions.
