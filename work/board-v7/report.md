# BOARD v7 delivery review

Implementation uses the registered forecast unchanged. Display-only evidence is generated from each issuing version's pinned team residual distribution, separately from every frozen projection and grade. Header trust: 23 of 28 as-issued team observations inside 80%. Two retrospective Week 1 games remain visible, labeled no lock in ERROR, and are excluded from calibration.

## Explicit specification conflicts / review requested

The user has not yet answered the clarification. These conservative accessibility choices are implemented and remain clearly identified exceptions to literal conflicting clauses:

- Mobile ERROR lane remains 24px, inside a 44px row target. Sixteen rows require only 33px of scrolling at 390x844; desktop rows remain 24px and all fit at 1280x900. POINTS rows remain 88px mobile and 64px desktop. Both lenses share axis pixel widths.
- Muted text uses #8791A0 instead of #6B7483 to satisfy the binding 4.5:1 text contrast requirement; original hairlines remain unchanged.
- The stored 1–5 confidence field is labeled Conviction on the edit form, to avoid a third use of confidence on the site. Its stored values and validation are unchanged.
- ERROR bands use the original issuing version, not today's replacement distribution, so band position, hit status and immutable forecast evidence agree.

## Requirement-by-requirement review

1. Legacy navigable UI states now render the projection board or Season. No betting controls or personal names render. Integer display only; engine precision unchanged.
2. One ordered week slate, manual persistent-within-page POINTS/ERROR lens; no automatic lens switch on data refresh. Separate no-lock/not-played lanes.
3. Tokens, rows without backgrounds, neutral reading text, team-color markers/bands, display/mono/sans typography. Muted contrast exception above.
4. Shared 0–45 mapping, 50% bands, expected dots and labels, observed rings/connectors, signed errors and interval-status readout. Off-scale actual score displayed at edge.
5. Shared -30–30 mapping; per-team issued 50/80 bounds translated to error space. Footer counts qualified observations only.
6. Stable kickoff and absolute-error sorts; maximum of the two absolute team errors is the game sort key; unavailable errors last in both directions. Disabled without any FINAL.
7. One expanded row, always POINTS; WHY, Against, shared entry, contribution table; engine-order sheet blocks, trajectories, outdoor weather, version/freeze/distribution hash. Zero-contribution inputs and sheet blocks open individually. Collapsed WHY absent from DOM.
8. Winner probability and season interval hit rate supplied by issuing forecast evidence; no edge interpretation.
9. Single header with week/trust/lens/sort/Season, then one axis label row.
10. Four Season blocks: weekly convergence and three reference labels (uncomputed floor gap), margin/total calibration and PIT, five closest/furthest with contribution tables, five historical seasons with current season bold. Historical reference is reused development evidence, not a new holdout. Climatology uses earlier-season training scores only.
11. Shared pre/post-lock entry server rules retained. Engine/ours comparison on edited games, MAE and supplied margin/total coverage; best/worst tag evidence. No eligible edits currently.
12. No horizontal scroll at 360/390/1280; accessible mobile ERROR exception above.
13. Gold keyboard focus, descriptive row labels, textual intervals/errors, logo alt text, first-paint band scale, 200ms lens transition and expansion, reduced-motion support.
14. 22 UI/cache/immutability tests, 3 board evidence tests, 218 Week1 regression tests; typecheck/build pass. Browser checks include known value 20.25, all rendered marker positions, outside-band geometry, row identity, one expansion, full ERROR slate, empty states, decimal/forbidden-text absence, global styles and 360px overflow.
15. Plan, report, browser measurements and requested screenshots retained under work/board-v7. Commits and deployment receipt reported separately after publication.

## Evidence and limitations

Known-fixture mapping error <=0.004px; all observed marker mapping errors <0.02px. Desktop ERROR slate fits 1280x900. Mobile ERROR slate is 877px high at 390x844. Browser image tests use pinned real board/evidence data; a separately labeled known-value fixture is used only for geometry assertions. The application-route check intercepts the API with the same pinned data; live publication is checked separately.

The engine publisher now generates matching sidecar evidence on each publication. Cloud artifact allowlist includes outputs/board-v7; reports never refit. A mismatched sidecar fails closed to unavailable calibration instead of using another publication's intervals.

Least sure: mutually incompatible 24px mobile rows and 44px touch targets. Kept the chart lane at 24px and enlarged only the mobile row target to 44px.

Paid provider credits: 0. No model or gate change; no PFF addition or experiment queue change.
