# Engine OS R1-v2 independent target audit

R1-v2 is a new protocol identity. It does not edit or resume terminal R1-v1.
It reuses only R1-v1's frozen 64-game sample and the exact captured official NFL
gamebook hashes.

The workflow is intentionally waiting for people. Two distinct natural-person
reviewers, a third natural-person adjudicator, and a fourth non-reviewing
identity coordinator are required. The coordinator keeps the private identity
ledger outside the repository; public artifacts use pseudonyms and one-way
person commitments.

The executable state machine is `scripts/engine_os_r1_v2.py`. Start it in an
empty workspace with:

```sh
python3 scripts/engine_os_r1_v2.py freeze-protocol --workspace artifacts/engine-os/r1-v2
python3 scripts/engine_os_r1_v2.py prepare-review-bundles --workspace artifacts/engine-os/r1-v2
```

No reviewer or adjudicator may be synthesized by an AI or reused across roles.
Until the complete commit-reveal, adjudication, truth freeze, and unblinded gate
all verify, the workflow remains `awaiting_human_review` with
`r2Authorized=false`.
