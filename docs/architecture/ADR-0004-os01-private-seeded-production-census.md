# ADR-0004: Private-seeded qualification of the public production census

- **Status:** Accepted for the bounded OS-01 census qualification lane; operational acceptance remains evidence-gated
- **Decision date:** 2026-08-27
- **Owners:** Prediction Engine OS
- **Scope:** OS-01 schema-authority prestate census only
- **Related decision:** Supersedes ADR-0003's assumption that an owner-only staging deployment can certify production D1 and its resulting prohibition on a bounded production qualification deployment. ADR-0003 remains the historical authority for the owner-only deterministic-build mechanism.

## Context

OS-01 cannot authorize a production schema migration until it has an exact, read-only census of the production D1 prestate. The owner-only staging project has independent resource bindings. It can qualify the bridge mechanism, but it cannot read the production D1 binding and therefore cannot certify the production prestate. Attaching the production database to staging is not an available control-plane operation and treating a staging database as equivalent would substitute an assumption for evidence.

The deployed analytics site is intentionally public. Temporarily changing production access to owner-only would alter user-visible behavior, widen the rollback surface, and contradict the current access decision. Leaving a deterministic public build context, on the other hand, would make the temporary server credentials computable. Canonicalizing two non-identical packages or accepting a remotely rebuilt package would also weaken the exact-package gate.

The qualification must therefore preserve public access while keeping the temporary build context private, binding two clean local builds to one short-lived live session, and making the census route independently unguessable and removable. This is a migration qualification operation, not prospective capture: it may not activate a scheduler, create a forecast origin, or replay any missed origin.

## Decision

Use a temporary, public-production census bridge built under one private-seeded, in-memory qualification session. The site remains public throughout the operation; only the census route is protected.

### 1. Frozen clean baseline and bounded activation

Before activation, record the currently accepted clean deployment and source state. The rollback baseline for this decision is production version 165 at source commit `e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd`. The temporary bridge may exist only for the OS-01 census window and may perform only the frozen, read-only census operations.

The complete qualification session, including builds, proof construction, deployment, census, and cleanup, has a maximum lifetime of two hours. Expiry closes the session; it never extends itself and cannot be converted into a standing maintenance route.

### 2. One live coordinator and one in-memory seed

A single live coordinator creates one cryptographically random 32-byte master seed. That process retains the seed only in mutable memory for the entire C0/C1 build, proof, census, and cleanup sequence. The seed must never be written to a file, environment variable, command-line argument, source tree, build artifact, receipt, log, or control-plane field. The coordinator zeroes the seed and all retained raw context material on normal completion, rejection, timeout, signal handling, or error cleanup.

No second process may reconstruct or resume the session from persisted state. If the coordinator dies, the qualification is rejected and cleanup uses the independently saved clean deployment; the census is not resumed under a new seed.

### 3. Domain-separated C0 and C1 contexts

The coordinator derives C0 and C1 build contexts with HMAC-SHA-256 under a versioned OS-01 domain. The derivation binds at least the run identity, role, exact source anchor, trusted production target, pinned toolchain and patch closure, and frozen attestation contract. C0 and C1 use distinct role domains, so their contexts and the server credentials derived from them cannot collide.

The Vinext qualification patch derives each of its temporary credentials under a separate closed subdomain. Reusing a derived value across credential purposes, build roles, targets, or runs is prohibited.

Receipts may persist only domain-separated SHA-256 commitments to the seed and each derived context, plus non-secret transcript hashes and run metadata. They may not persist the seed, a raw context, an encoding of either, or a value from which either can be recovered. C0 and C1 receipts must share one seed commitment and run identity while carrying different context commitments.

### 4. Exact local artifacts only

Both roles are built in fresh, sanitized Git worktrees from exact commits with the pinned package manager, Vinext patch, lockfile mapping, and installed runtime closure. Qualification context is supplied as exactly 32 bytes on standard input. Oversized, undersized, missing, or trailing input is a hard failure.

The deployment archive is assembled twice, once from each verified C1 worktree, by a deterministic PAX-tar and zero-timestamp gzip packager using frozen Unicode-code-point ordering, normalized metadata, and content-hash rules. The two archives must be byte-identical. The exact archive that passed inspection is the only archive that may be submitted for save and deployment. Remote building, server-side rebuilding, output normalization, and package substitution are prohibited. The connector reopens the supplied absolute path, so the read is within the trusted connector and exclusive-host boundary rather than being kernel-attested to the inspected inode.

Saving the version requires a closed trusted-uploader assertion that binds the exact local archive hash, byte count, file-list root, file count, package-content root, opaque Sites archive hash, source commit, version identity, upload method, and an explicit `remoteBuildRequested = false` fact. The same assertion binds a compare-and-swap source push from the observed clean head to the temporary C1 head. This is a trusted Sites-controller assertion, not hardware-backed attestation; without it the run is rejected.

Derived Vinext credentials may appear only where the trusted server runtime requires them. Raw or encoded seed/context material, and every known derived credential marker, must be absent from tracked source, client assets, static assets, source maps, logs, receipts, deployment metadata, control-plane payloads, census responses, cleanup responses, and user-visible output. The live coordinator dynamically scans proof bytes, all public census response bytes, the census receipt, decoded cleanup-response bodies, the session receipt, and any rejection receipt before they are accepted or persisted. A client-side, logged, persisted-evidence, or public-response occurrence is a hard rejection.

### 5. Independent census authorization

The census route uses a separate cryptographically random 256-bit bearer token. It is not the master seed, a build context, or a Vinext-derived credential. It is scoped to the one run, expires no later than the two-hour session boundary, and is compared only by the server-side bridge. The token is supplied transiently through the bounded deployment control and is removed during cleanup. Mutable entropy and source buffers are zeroized; unavoidable immutable request-header material is confined to the one live process and is neither persisted nor claimed to be zeroizable before process termination.

Unauthenticated, malformed, expired, or mismatched census requests fail closed without querying D1. The authorized route is read-only, performs no DDL or DML, exposes only the frozen census projection, and has no provider, quota, scheduler, capture, model, or forecast capability. Every ordinary public route remains available under the unchanged public access policy.

### 6. Deployment, census, and source restoration

The coordinator and control-plane operator must execute the following ordered transaction:

1. Verify the saved clean version, exact source head, public access projection, production D1 binding identity, and absence of activation controls.
2. Build and verify C0, then prepare and verify the C1 source anchor within the same live seeded session.
3. Build C1 locally, verify its exact archive and server-only credential boundary, and save that archive without a remote build.
4. Update the source head and short-lived qualification controls using an explicit expected-old-head compare-and-swap assertion, then deploy the exact saved C1 archive while leaving site access public.
5. Prove that deployed source, archive, access projection, binding identity, session commitments, and control metadata match the frozen contract before issuing the single authenticated read-only census.
6. Preserve the content-addressed census receipt, remove every qualification control, redeploy clean version 165, and verify that the census route is gone and ordinary public behavior is restored.
7. Restore the prior source head with an expected-C1-head compare-and-swap operation. Persist the pre-restore, expected-old, restored, and independently observed post-restore heads; verify the restored tree against the saved clean source state. Never overwrite an independently advanced head.

The census receipt is evidence of the observed production prestate at its stated time. It is not evidence of continuous remote attestation, production capture, prospective forecasts, or future schema state.

### 7. Crash cleanup and no replay

Rollback does not require the master seed. At any failure after a temporary control or bridge is staged, the controller emits a structured `cleanup_required` event, atomically publishes a bounded immutable rejection receipt, closes its input interface, and zeroes the live secrets. The first recovery action is then to remove the qualification controls and redeploy the saved clean version 165. The operator verifies public access, ordinary routes, binding metadata, decoded response bytes, census-route absence, fresh quota metadata, and source-head restoration.

Every command and acceptance receipt requires an active, unexpired coordinator. Proof and cleanup observations must be fresh, monotonically ordered, and inside the session lifecycle. The cleanup evidence includes the observation time and exact response body hash for `/sunday`, census `GET`, and census `POST`, rather than accepting caller-supplied status integers without bytes. Network-call abort deadlines remain armed through bounded response-body recovery and cannot extend beyond the session expiry. Before the first census request, the controller atomically publishes an immutable receipt-reservation sidecar; a failed run retains that reservation and cannot be retried in the same qualification directory. A rejection receipt may be scanned and written during terminal teardown after expiry, but it can never become acceptance evidence.

Verified cleanup first produces a non-accepting `session-receipt.json`. While the
target-global lock remains held, the controller closes the descriptor/inode-bound phase
ledger at `session_complete` and publishes `session-acceptance.json`, which binds the
cleanup receipt hash, run, seed commitment, source anchor, lock identity, and the exact
canonical ledger bytes. Machine acceptance requires both artifacts, the verified
seven-entry success chain, and absence of a rejection receipt. A crash or publication
failure before the acceptance marker leaves the run unaccepted and the lock retained;
the lock is eligible for release only after acceptance publication.

A failed or expired run is terminal. Preserve its rejection receipt, generate no substitute prospective record, and do not replay or relabel a missed pre-kickoff origin. This lane has no authority to activate capture or forecast scheduling at all.

## Options considered

### A. Owner-only staging census

| Dimension | Assessment |
|---|---|
| Production evidence | Insufficient: staging cannot certify the production D1 prestate |
| Public-site risk | Low |
| Security | Strong isolation |
| Decision | Retain for mechanism tests only; reject as production census evidence |

### B. Temporarily make production owner-only

| Dimension | Assessment |
|---|---|
| Production evidence | Sufficient in principle |
| Public-site risk | High: changes intended access and user-visible behavior |
| Rollback surface | Larger |
| Decision | Rejected |

### C. Public production with a public deterministic context

| Dimension | Assessment |
|---|---|
| Reproducibility | Strong |
| Credential safety | Unacceptable: server credentials become computable |
| Decision | Rejected |

### D. Public production with one private-seeded session

| Dimension | Assessment |
|---|---|
| Production evidence | Reads the actual bound production D1 |
| Public-site behavior | Unchanged outside the protected route |
| Reproducibility | Exact within the live C0/C1 session; commitments remain auditable |
| Operational complexity | Higher because cleanup and one-process continuity are mandatory |
| Decision | Selected |

## Trust boundary and limitations

The trusted computing base for this bounded operation is the reviewed tracked controller, the pinned Git commits and toolchain closure, the patched Vinext runtime, fresh sanitized worktrees, an exclusive non-hostile qualification host, the one live in-memory coordinator, the Sites connector and control plane, the submitted inspected archive, and the production D1 binding exposed to that deployment.

The control-plane projections and content hashes prove consistency among the locally inspected package, saved version metadata, deployment metadata, and returned census bytes under that trust boundary. They are not hardware-backed remote attestation and cannot prove facts the Sites control plane does not expose. Environment values are never read: unrelated-value preservation relies on the Sites operation contract that only listed keys change. Pre/post executable measurements detect persistent drift but cannot defeat hostile same-user transient path substitution on macOS. The design also does not prove that the database remained unchanged before or after the census instant; later migration authority must compare the census, backup, migration, and post-state receipts under the OS-01 contract.

Terminal acceptance additionally depends on one frozen in-memory controller trust object created from the live source, build, archive, mutation-intent, proof, target, and lock state before census. Exact recovered evidence bytes are checked against that object after cleanup. The acceptance marker records only its fingerprint; that fingerprint is not a signature, and the evidence bundle cannot authenticate itself offline if the independently retained trust object is lost or reconstructed from the bundle.

The bridge briefly increases production code surface. Its safety depends on exact package inspection, a short authorization lifetime, read-only queries, prompt cleanup, and the known-good rollback deployment. This decision authorizes no provider-secret access, provider request, quota action, model execution, runtime DDL, prospective capture, or missed-origin replay.

## Acceptance conditions

The bounded production census is accepted only if all of the following are proven in one unexpired session:

- the target is the trusted production project, exact D1 binding, and unchanged public access projection;
- the C0 and C1 builds come from the exact committed source anchors and pinned runtime closure;
- independent clean builds satisfy the frozen exact-byte evidence checks for their roles;
- C0 and C1 share one run and seed commitment, have distinct context commitments, and persist no seed or raw context material;
- every derived credential is absent from client/static output, tracked source, logs, receipts, and metadata;
- the saved-version metadata and trusted uploader assertion bind the submitted locally inspected archive, and no remote build was requested;
- the independent C1 packagers produced byte-identical archives and the uploader assertion records the connector-path-read trust boundary;
- unauthorized route requests fail before D1 access, while the one authorized request returns the frozen read-only census projection;
- the session finishes within two hours;
- proof, response, control-plane, census-receipt, non-accepting session-receipt, terminal acceptance-marker, exact phase-ledger, and rejection-receipt bytes pass the live qualification-material scan;
- qualification controls are removed, clean version 165 is redeployed, fresh decoded responses prove the route is unavailable and public behavior is restored, and compare-and-swap evidence proves the source head is safely restored; unrelated environment values are not observed and are covered only by the listed-key update contract;
- production migration remains dormant until the census is classified and the remaining OS-01 migration, backup, restore, rollback, and post-state gates independently pass.

Any missing, inconsistent, late, corrupt, or unverifiable proof rejects the run. A rejected run supplies no reusable qualification evidence except its immutable rejection receipt.

## Consequences

- OS-01 can inspect the actual production D1 prestate without making the public site private or publishing a deterministic credential context.
- Reproducibility is intentionally session-scoped: a later run uses a new seed and commitments and must qualify from the beginning.
- The clean deployment and source state become mandatory rollback dependencies and must be verified before activation.
- Owner-only staging remains useful for isolated failure and mechanism tests, but it cannot substitute for production-prestate evidence.
- The architecture accepts a small, tightly bounded production exposure in exchange for truthful evidence; failure handling therefore prioritizes cleanup over diagnosis.
- Completion of this lane does not accept full OS-01, any model, any forecast ledger, or prospective scientific evidence.
