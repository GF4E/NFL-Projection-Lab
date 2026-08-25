# Odds API credential exposure response

Status: provider rotation blocked on account-owner action; deployed secret removed.

## Actions completed

- Removed `ODDS_API_KEY` from the Sites production environment on 2026-08-25.
- Disabled authenticated market ingestion when the key, immutable R2 evidence binding, or current quota state is absent.
- Added request redaction that excludes query credentials, authorization headers, and cookies from source manifests.
- Added fail-closed quota preflight and append-only response-header usage events.
- Scanned tracked source/configuration paths and found no live Odds API credential.

## Required owner action

1. Sign in to The Odds API account dashboard.
2. Generate a replacement key. This invalidates the exposed key.
3. Provide the replacement only through the Sites secret environment editor; never paste it into source, a commit, a URL, an issue, or a chat.
4. Confirm the old key returns the provider's invalid/deactivated-key response.
5. Seed current quota usage from the provider dashboard before re-enabling scheduled capture.

Until those steps pass, market capture remains intentionally disabled and the last-good published lines may be served only with a stale label.

## Evidence still required to close the incident

- Provider-side regeneration timestamp.
- Old-key negative check.
- Replacement-key server-side health check.
- Post-build source-map and client-bundle scan.
- Deployment receipt for the environment revision that contains only the replacement secret.
