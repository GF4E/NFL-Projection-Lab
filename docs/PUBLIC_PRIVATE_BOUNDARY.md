# Public and private boundary

## Public repository

The public repository contains the reusable analytics engine, model lifecycle,
data schemas, tests, non-production examples, methodology, and a neutral demo
interface.

## Private production state

The following remain outside the public repository:

- Provider credentials and environment values.
- ChatGPT Sites or other hosting project identifiers and bindings.
- Database contents, production snapshots, caches, and logs.
- Personal configuration, access grants, and browser subscriptions.
- Licensed or trademarked image assets.

Production deploys from its existing private hosting remote. GitHub receives a
sanitized public branch. The two histories are intentionally separate.

## Safe synchronization

Public releases are prepared from reviewed source, with production-only files
removed and example configuration substituted. A release is pushed only after
tests, lint, type checking, a production build, a secret scan, and a trademark
asset check pass.
