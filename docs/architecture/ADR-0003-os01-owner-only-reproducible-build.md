# ADR-0003: Owner-only reproducible build mode for the OS-01 census bridge

## Status

Accepted for the bounded OS-01 census qualification lane only. It is prohibited for public or production deployments.

## Context

OS-01 requires two independent builds of the temporary census bridge to produce the same exact package before that bridge may read production D1 through the owner-only staging project. Stock Vinext 1.0.0-beta.2 does not satisfy that requirement. It generates fresh preview, revalidation, prerender, and hybrid-session credentials on every build. It also embeds an absolute middleware source path in the App Router server bundle. Those values change chunk contents, chunk names, manifests, and dependent imports.

Treating the differences as harmless, accepting a canonicalized projection, or comparing one artifact with itself would weaken the frozen exact-package gate. Persisting a private build seed across source-anchor preparation, packaging, deployment, and later controller validation would create a new credential-lifecycle problem.

## Decision

The project pins a pnpm patch to Vinext 1.0.0-beta.2. The patch adds an explicit hidden qualification mode that:

1. accepts exactly 32 context bytes on standard input;
2. derives six build credentials with HMAC-SHA-256, a versioned domain prefix, and distinct closed labels;
3. keeps Vinext's original cryptographic randomness unchanged when qualification mode is absent;
4. converts only the embedded middleware diagnostic path from an absolute checkout path to a stable project-relative path; and
5. zeroes retained context buffers after the build.

Build ID and RSC deployment identity use Vinext's supported `generateBuildId` and `deploymentId` configuration in the temporary bridge source. The public context is deterministically derived from the authority contract, exact bridge or deployment commit, pinned toolchain closure, role, and owner-only target identity. It is not a secret and may never be used as a security boundary.

The controller rejects this mode unless all of the following are true:

- the target access mode is `owner_only`;
- the exact patch, pnpm mapping, installed Vinext runtime closure, and deterministic IDs match the frozen contract;
- ordinary package scripts do not contain the hidden mode flag;
- raw, hexadecimal, and Base64 context encodings are absent from every emitted file;
- two distinct clean worktrees produce identical build evidence; and
- the temporary deployment is retired to an inert owner-only tombstone before OS-01 acceptance.

The census route still has an independent short-lived authorization token and remains read-only. The bridge has no provider dependency, provider credential access, capture activation, forecast mutation, or runtime DDL authority.

## Consequences

The exact-package gate can be reproduced without making normal production credentials deterministic. The patch and its applied runtime closure become supply-chain evidence and must be reviewed whenever Vinext changes. A Vinext upgrade invalidates this qualification contract until the upstream behavior is re-audited and the patch is either removed or replaced.

Because the qualification context makes its derived server credentials computable, any attempt to deploy a qualification-built package to the public project is a hard rejection. If owner-only access or immediate retirement cannot be proven, OS-01 remains blocked rather than falling back to output normalization.
