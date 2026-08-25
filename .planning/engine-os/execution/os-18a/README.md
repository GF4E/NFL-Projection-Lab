# OS-18A local credential-response audit

Audit date: 2026-08-25
Status: **BLOCKED — provider-owner rotation and remote deployment proof required**

This receipt intentionally contains no credential value, matched line excerpt, or
credential fingerprint.

## Scope and method

The audit used `scripts/security_scan.py`, whose output is metadata-only. It
scans:

- tracked and untracked working-tree text;
- ignored build/runtime outputs under `dist`, `build`, `.next`, `.openai`, and
  `.wrangler`;
- `.env*` and log files in the repository root;
- gzip-compressed evidence artifacts;
- every reachable Git blob; and
- every reachable Git commit object, including author/committer metadata and
  commit messages.

The scanner checks provider-token prefixes, private-key material, bearer-token
literals, credential-bearing query strings, literal secret assignments, private
access literals, unlabelled 32-character vendor-shaped hex strings, non-example
email addresses, and absolute home-directory paths. Known content hashes,
deployment/database/project identifiers, and package-manager peer-dependency
hashes are treated as identifiers rather than credentials.

Commands used:

```sh
python3 -m unittest -q tests/test_security_scan.py
python3 scripts/security_scan.py \
  --json-output .planning/engine-os/execution/os-18a/secret-scan.json \
  --fail-on none
```

## Local results

| Gate | Result | Evidence |
|---|---|---|
| Scanner redaction regression tests | PASS | 7 tests passed; serialized findings retain no value or excerpt |
| Current tree and ignored build outputs: credential patterns | PASS | zero credential findings |
| Reachable Git blobs and commit objects: credential patterns | PASS | zero credential findings |
| Built browser/server output: embedded credential patterns | PASS locally | included in the zero-finding scan; remote deployment is not proven by this result |
| Incident note records removal of the deployed `ODDS_API_KEY` | PASS as documentation only | `docs/security/INCIDENT-2026-08-25-ODDS-KEY.md` |
| Provider-side revocation of the exposed key | BLOCKED | requires account-owner login |
| Replacement key works only from the server environment | BLOCKED | replacement has not been generated or installed with a deployment receipt |
| Old key returns an invalid/deactivated response | BLOCKED | must be checked by the provider account owner without sharing the value |

The machine-readable local scan is `secret-scan.json`. The latest
predeployment scan contains 578 personal-data findings but no credential
findings:

- 307 non-example emails in reachable Git commit metadata;
- 268 non-example emails in reachable historical blobs; and
- 3 absolute home-directory paths in reachable history or test fixtures.

Those personal-data findings do not prove an active credential, but they block
the later OS-18B public-history/public-artifact gate. A separate metadata and
history rewrite decision is required before claiming that the repository has no
personal state. The current built client also still contains legacy teammate
identity labels; that is an OS-18B blocker even though it is not an API-secret
finding.

## Exact owner action required

1. Sign in to The Odds API dashboard and regenerate/revoke the exposed key.
2. Confirm in the dashboard that the prior credential is inactive. Do not paste
   either credential into chat, source, issues, logs, or a URL.
3. Retain the replacement outside the repository and chat. Do not install it
   until OS-19A proves atomic quota reservation and the actual-schedule budget.
4. After that gate passes, add it only to the deployed server-side
   `ODDS_API_KEY` secret while keeping acquisition disabled.
5. Record the provider rotation time and the deployment environment-revision
   receipt without recording the key, then seed current quota counters from the
   provider dashboard.
6. Run one server-side health check, confirm that the old key fails, rebuild,
   and rerun this scanner against the build and source maps.

Until all six steps have receipts, OS-18A remains blocked and authenticated
market ingestion must remain disabled. The documented deployed-secret removal
is not a substitute for provider-side revocation.
