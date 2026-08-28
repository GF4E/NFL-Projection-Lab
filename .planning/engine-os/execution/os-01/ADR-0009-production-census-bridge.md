# ADR-0009: Read-only production census through an isolated live-base bridge

- **Status:** Frozen before hosted qualification; amended by ADR-0004 for the
  private-seeded public-production lifecycle
- **Date:** 2026-08-27
- **Scope:** OS-01 production-prestate discovery only
- **Machine-readable contracts:**
  - `config/os01-production-census.v1.json`
  - `config/os01-production-prestate-classes.v1.json`
  - `config/os01-census-attestation.v1.json`
  - `config/os01-census-trusted-targets.v1.json`

## Problem

The migration-only authority candidate contains migrations `0017` through `0020`,
while production is receipted only through `0016`. Deploying the authority tree merely
to inspect production would let the Sites packaging layer overlay those migrations and
could change the database before its prestate was known. A database census cannot be
allowed to cause the migration it is supposed to authorize.

## Decision

The original C0 v1 identity is terminally rejected by
`c0-v1-rejection-receipt.v1.json`. Its commit, tree, and archive remain preserved as
rejection evidence only. C0 v2 is the sole replacement candidate after adding the closed `plays`
content-table authorization, token-keyed aggregate page evidence, and a reproducible
two-worktree installed-toolchain closure. No v1 qualification result is carried forward.

Use three separate, immutable source identities.

1. **A0 authority.** The clean controller, migration candidate, classifiers, tests, and
   contracts. A0 is never deployed for this census.
2. **C0 bridge.** One direct commit on the exact accepted live source commit
   `e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd`. It retains the live Worker byte for byte
   as a dynamically loaded normal-site runtime and adds only the provider-free census
   entry, its three named controls, and boundary tests. Its `drizzle` tree still ends at
   `0016`. The only candidate C0 identity eligible to seek qualification is commit
   `2977c9e8cb6ead16b37ec926e35c93d5fb89c04f`, tree
   `aa44004fe32eec464d543aa337560f46fe4faf36`, with canonical Git-archive digest
   `42e26efccc5d97c79c595171b90875408e469fe58a56cb5fea331cbeb0612be7`
   over 9,820,160 bytes.
3. **C1 attested bridge.** One direct child of C0 that changes only the frozen source
   anchor literal and readiness boolean.

A0 and C0 are not trusted merely because a receipt names them. The controller compares
the exact Git bytes of `worker/env-boundary.ts`, `worker/os01-census-operator.ts`, and
`worker/os01-census-source-anchor.ts`; the resulting relation root enters the compiled
source anchor. Two distinct clean worktrees must produce identical C0 manifests, and
two other distinct worktrees must produce identical C1 manifests. Every worktree is
credential-free and contains no `.env*` input.

The controller additionally reconstructs a 580-package installed build-toolchain
closure from every tracked project dependency and development-dependency declaration,
while requiring `vinext`, `vite`, `@cloudflare/vite-plugin`, and the `tsx` authority loader,
including dependency, peer, optional, and
missing-optional edges and hashes of every regular package file. It binds exact Node
and pnpm executable bytes, lockfile, workspace patch map, and patch bytes. The frozen
same-host v4 closure also binds the tracked project manifest, the complete canonical
`@pnpm/exe` runtime package tree, the direct Git and bsdtar executables, the exact `tsx`
CLI and loader closure, and the full selected Python framework tree used by
qualification; Git runs with external helpers disabled and an isolated configuration,
and Python runs in isolated mode. Its root is
`139a4448086f6e955de8ff32cfe26fa11464b89cd9597e2bc8c7b367e79eb6fc`.
This proves repeatability on the identified macOS arm64 qualification host, not a
cross-platform or hardware-rooted supply-chain claim, and it does not close Apple
system frameworks or dynamic libraries outside the explicitly recorded Python
framework and system-resource evidence.

The C1 static census dependency closure may contain only the environment boundary and
census operator. The retained site runtime must remain a dynamic entry. Provider
markers, quota code, and the normal runtime are prohibited from the static census
closure. The full bundle may still contain the retained site runtime; the qualified
claim is execution-closure isolation for the census request, not provider-code absence
from every dynamic chunk.

## Census behavior

- The route is hidden unless all three temporary controls exist, the compiled anchor
  matches, the 256-bit bearer digest matches, and expiry is no more than two hours away.
- Authentication and expiry complete before D1 is resolved.
- Every query uses an explicit `first-primary` read-only session.
- Schema is classified before table content is scanned. Unknown or incompatible state
  produces a bounded `blocked_before_content_scan` receipt and no content-table scan.
- A supported prestate receives two independent full passes. Schema, columns, row
  cardinality, token-keyed page MACs, table roots, foundation state, and pass roots must
  match. Content scanning is limited to the closed `plays` table and any other table is
  refused before a content query; raw rows and unkeyed row hashes are never persisted.
- Responses contain keyed evidence and counts, never row values. AES-GCM continuations and a
  domain-separated HMAC bind request, continuation, sequence, query statistics,
  observation time, and payload.
- The controller atomically publishes an immutable receipt-reservation sidecar before
  the first network call. The final receipt is then published under a separate exclusive
  name and never overwrites an existing receipt. A failed run retains the reservation
  and cannot be retried under the same qualification directory.
- No migration, repair, provider request, provider secret read, quota reservation,
  capture activation, forecast, or interface change is authorized.

## Hosted control-plane boundary

Qualification follows this monotonic lifecycle:

`preregistered → access_verified → controls_staged → bridge_deployed → pre_census_verified → census_complete → post_census_verified → controls_removed → clean_successor_deployed → cleanup_verified → session_complete`

Any incomplete run after `controls_staged` is rejected and requires cleanup. The Sites
projection must prove the target-specific access contract: owner-only custom access for
the retired staging lane, or the exact public production origin with one owner and no
additional principals for ADR-0004. It must also prove exactly the three secret census
controls, capture-gate absence, the saved source commit, successful temporary
deployment, matching environment revision, and the configured logical bindings.
Environment projection reads only key, type, and secrecy metadata;
it never dereferences values. Preservation of unrelated values therefore relies on the
Sites environment-update contract that only explicitly listed keys change; it is not
claimed as value-by-value observation. Cleanup removes exactly the temporary controls, deploys
an owner-only inert 410 successor for staging or restores the clean live source for
production, removes the census route, and verifies target-appropriate bindings.

Cleanup is necessary but is not itself acceptance. While the target-global lock is
still descriptor/inode owned, the controller publishes a non-accepting cleanup receipt,
closes the append-only phase ledger at `session_complete`, and atomically publishes a
separate acceptance marker that binds the exact cleanup-receipt hash and exact ledger
bytes. A missing marker, a neighboring rejection receipt, a corrupt ledger, or any
identity/hash mismatch is unaccepted. Only after the marker exists may the lock be
released; a crash before publication retains the lock and fails closed.

Sites connector observations are authenticated but not server-signed. Sites does not
expose a physical D1 identifier, a definitive current-live deployment identifier, or a
reproducible mapping from the uploaded gzip bytes to its canonical archive hash. The
receipt therefore states the explicit trust boundary
`trusted_sites_connector_plus_trusted_controller_plus_exclusive_qualification_host`,
keeps local package identity separate from the opaque Sites archive identity, and uses
the compiled operator response as the execution-time deployment check. It does not
claim cryptographic remote attestation or physical-D1 identity.

The first C1 build session under authority `df05ea3558e7e501fe63c467c79352e56790eb9b`
was rejected before external mutation because Vinext had already copied the tracked
hosting document into `dist`, while the local packager attempted to add the same output
path a second time. The immutable rejection receipt and phase ledger are retained beside
this ADR. Packaging contract v2 reads and binds every candidate input, collapses a path
collision only when both byte sequences are identical, and rejects any conflicting
collision. The TypeScript package-manifest calculation enforces the same rule; neither
implementation may silently overwrite a path.

The successor C1 build session under authority
`a25de1194454abd8d182cb7dc72362056e19d75c` proved that collision repair but was
also rejected before external mutation. The canonical archive inspector treated the
two-byte sequence `1f8b` anywhere in a member as a complete gzip signature. That
sequence occurs naturally in the deployed Roboto WOFF/WOFF2 and PNG bytes even though
none contains a gzip member. The immutable v5 rejection receipt and phase ledger are
retained beside this ADR. The corrected contract recognizes gzip only with its
mandatory RFC 1952 compression-method byte `08`, recognizes bzip2 only with its
mandatory level byte, and relies on checksum-valid TAR recognition rather than the
ordinary text substring `ustar`. Valid nested containers remain rejected at any
offset, while partial magic sequences in ordinary binary assets are regression-tested.

Authority v6 subsequently produced a reproducible 387-file deployment archive and
passed the corrected real-asset boundary, but independent review found that its
TypeScript secondary verifier omitted the Python inspector's `.txz` and `.zstd`
suffixes. The session was deliberately closed and rejected before external mutation;
its immutable receipt and four-entry phase ledger are retained beside this ADR. The
successor contract enumerates every Python-forbidden suffix in a TypeScript parity
regression so the secondary verifier cannot silently narrow the primary policy. The
same review also found that both implementations accepted a `ustar` marker before
checking its recorded header checksum. The successor removes that shortcut and proves
that valid legacy and ustar headers are rejected or accepted only by checksum, while an
invalid ustar lookalike remains an ordinary member.
The final parity rule counts only complete canonical eight-byte checksum fields
toward the bounded ambiguity threshold and strips padding only at the field ends.
Malformed terminators, internal spaces, and overlapping six/seven-digit candidates
are tested against both implementations at and beyond the 4,096-candidate limit.
Python carries that candidate count across archive-member read windows; the ambiguity
budget is member-scoped in both implementations rather than resetting at each stream
chunk. The tests invoke the Python inspector directly as well as the composite
TypeScript boundary so one verifier cannot mask a divergence in the other.
Forbidden suffix normalization is ASCII-only in both implementations. Ordinary
non-ASCII compatibility characters such as the long s are not silently folded into a
blocked suffix, while ASCII uppercase variants remain blocked; direct Python and
TypeScript regressions bind that identical policy.

The terminal success verifier consumes the exact deployment proof, exact external-
mutation intent, census receipt, cleanup receipt, terminal phase ledger, acceptance
marker, and an independently retained in-memory controller trust boundary. The live
boundary pins the target, commits, source anchor, exact proof and intent bytes, archive
and package roots, and production-session lock. Receipt v4 and acceptance marker v3
supersede the earlier internally consistent but forgeable v3/v2 relationship check.
A coordinated rewrite of every unsigned evidence artifact cannot qualify while the
live boundary remains fixed.

The marker's `trustBoundaryRoot` is only a fingerprint of that caller-supplied live
boundary; it is not a signature or standalone authentication. The terminal verifier
is authoritative only inside the one live controller process, where the frozen trust
object is retained independently and never reconstructed from the evidence bundle.
Offline arbitrary-bundle authenticity remains unproved unless a future design stores
that trust root in an independent authenticated channel. The source-restoration proof
must still name the exact deployment and live-base tree objects pinned by the trusted
deployment proof.

The controller verifies the inspected archive immediately before and after the upload
request, but the Sites connector reopens the supplied absolute path. Binding that path
read to the inspected inode is therefore a trusted connector and exclusive-host
assumption, not a kernel-attested fact. Likewise, executable closure measurements before
and after each launch detect persistent drift but cannot defeat a hostile same-user
process performing a transient path substitution on this macOS host. Qualification is
valid only on the exclusive, non-hostile local host named by the receipt.

## Acceptance boundary

Staging qualification proves the bridge and control-plane mechanism only. Production
prestate is accepted only after the same anchored bridge reads the trusted production
origin, yields the required receipt, removes its controls, and restores the clean live
source identity and observable metadata under the trust boundary above. If provider-value
access would be required at any point, production census
is blocked. Current migrations `0019` and `0020` remain undeployable until the production
receipt proves a supported prestate and the isolated migration, rollback, and restore
gates pass.
