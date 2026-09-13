# Independent final-score refresh

The hourly model preparation snapshot is no longer the source of truth for current finals. Each successful ownership-checked capture tick checks a separate football-only final feed, throttled to 60 seconds. A busy dispatch lock is retried by the existing 15-second timer. Network/validation failures retain last-good results and do not advance the success timestamp, so the next tick retries. No paid provider calls or model refits are added.

Completed results require nonnegative integer team scores and matching result/total fields. Raw source bytes are pinned by SHA-256. The publisher grades the original issued card once; existing grade files are preferred even if the feature snapshot is stale or the provider later changes its result. Original lock files are never rewritten. The trend report is regenerated from the newly published board in the same dispatch.

Verification: 218 week1 tests passed, including failure/retry, completed-result validation, dispatch contention, frozen projection retention, and first-grade immutability. Cloud and live-board verification follows deployment.
