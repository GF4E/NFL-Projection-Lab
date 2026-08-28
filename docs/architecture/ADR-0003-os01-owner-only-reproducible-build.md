# ADR-0003: Owner-only reproducible build mode for the OS-01 census bridge

The earlier C0 v1 identity is preserved only as terminal rejection evidence. The C0 v2
identity below is a clean replacement and does not inherit v1 qualification evidence.

## Status

Accepted only for the retired owner-only staging qualification. Superseded for the
production census by ADR-0004's private-seeded, single-session contract. A public or
production build from the owner-only public-context mode remains prohibited.

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

The sole candidate bridge foundation pending the terminal qualification receipt is the exact C0 commit
`2977c9e8cb6ead16b37ec926e35c93d5fb89c04f`, tree
`aa44004fe32eec464d543aa337560f46fe4faf36`, and canonical Git-archive digest
`42e26efccc5d97c79c595171b90875408e469fe58a56cb5fea331cbeb0612be7`
(9,820,160 bytes). It is a direct child of clean production source commit
`e8c3b23dc0bd59b66099fd08c52dd39ae23f65bd`; no other commit with the same
name-status projection is interchangeable with it.

Qualification also binds the installed build dependency graph, not only the lockfile.
The frozen same-host closure contains 580 packages rooted from all 29 dependency and
development-dependency declarations in the tracked project manifest. It separately
requires `vinext`, `vite`, `@cloudflare/vite-plugin`, and the `tsx` authority loader to
remain declared, hashes every regular package file, records dependency, peer, optional,
and missing-optional edges, and binds the tracked project manifest, exact Node and pnpm
launcher bytes, the complete canonical `@pnpm/exe` runtime tree, the exact `tsx` CLI and
loader closure, the direct Git and bsdtar executables, and the full selected Python
framework tree used by qualification.
Git runs with external helpers disabled and an isolated configuration; Python runs in
isolated mode. Its v4 closure root is
`139a4448086f6e955de8ff32cfe26fa11464b89cd9597e2bc8c7b367e79eb6fc`.
Two clean C0 worktrees reproduced that root independently. This is content closure on
one identified macOS arm64 host; it is not an independent cross-platform or
hardware-backed supply-chain attestation, and it does not claim content closure over
Apple system frameworks or dynamic libraries outside the explicitly recorded Python
framework and system-resource evidence. Pre/post closure checks detect persistent
drift, but Node's path-based process launch on this host cannot kernel-bind the measured
inode to execution against a hostile same-user transient substitution. The qualification
host is therefore required to be exclusive and non-hostile for the bounded run.

Build ID and RSC deployment identity use Vinext's supported `generateBuildId` and
`deploymentId` configuration in the temporary bridge source. For the owner-only staging
lane, the public context is deterministically derived from the authority contract,
exact bridge or deployment commit, pinned toolchain closure, role, and owner-only target
identity. It is not a secret and may never be used as a security boundary. ADR-0004
replaces that input for production with two domain-separated contexts derived from one
ephemeral 32-byte master seed retained only by the live qualification coordinator.

The controller rejects this mode unless all of the following are true:

- the target is owner-only when the public-context mode is used, or it is the exact
  configured production target and the live private-seed coordinator is supplied;
- the exact C0 commit, tree, archive bytes, patch, pnpm mapping, 580-package installed
  build closure, tracked project manifest, Node, pnpm launcher and runtime tree, Git,
  Python, and bsdtar executable bytes, installed Vinext
  runtime closure, and deterministic IDs match the frozen contract before and after
  every build or packaging use;
- ordinary package scripts do not contain the hidden mode flag;
- raw, hexadecimal, and Base64 context encodings are absent from every emitted file;
- two distinct clean worktrees produce identical build evidence; and
- the temporary deployment is retired to an inert owner-only tombstone for staging, or
  exact clean public version 165 is restored and verified under ADR-0004 for production.

The census route still has an independent short-lived authorization token and remains read-only. The bridge has no provider dependency, provider credential access, capture activation, forecast mutation, or runtime DDL authority.

## Consequences

The exact-package gate can be reproduced without making normal production credentials deterministic. The patch and its applied runtime closure become supply-chain evidence and must be reviewed whenever Vinext changes. A Vinext upgrade invalidates this qualification contract until the upstream behavior is re-audited and the patch is either removed or replaced.

Because the owner-only public context makes its derived server credentials computable,
any attempt to deploy that mode to the public project is a hard rejection. Production
may use only ADR-0004's ephemeral private-seed mode, exact local archive path, bounded
lifecycle, and verified clean restoration. If the applicable access, entropy, archive,
or retirement boundary cannot be proven, OS-01 remains blocked rather than falling
back to output normalization.
