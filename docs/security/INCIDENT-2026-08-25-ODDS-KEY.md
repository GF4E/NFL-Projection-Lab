# Odds API credential exposure response

Status: provider rotation blocked on account-owner action; application credential lane severed.

## Actions completed

- Removed `ODDS_API_KEY` from the visible Sites production-environment inventory on 2026-08-25.
- A post-deployment probe still observed the legacy Worker binding as truthy despite the empty Sites inventory. The final Worker therefore removes every `ODDS_API_KEY` read and always passes `undefined` to acquisition until OS-18A/OS-19A are accepted.
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
- Deployment receipt for a later environment revision that contains only the replacement secret after OS-19A acceptance.
