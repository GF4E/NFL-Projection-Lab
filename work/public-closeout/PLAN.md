# Immutable weekly closeout reader

Read the engine's publication index, then hash-verified receipt/artifacts at pinned commits. Provide read-only bounded JSON routes and a weekly report; connect Season to that report's immutable season snapshot, keeping the live board and its marker evidence independent. Test integrity failures, fallbacks and render identity. Preserve board layout and the build-output-only deployment mirror. Source remains GF4E/NFL-Projection-Lab main.

Tier 1: fixed allowlisted artifact names, exact bytes, SHA256, no client-provided upstream URLs, no refits from reports. Tier 2 REVIEW REQUESTED: Season follows the last complete closeout rather than displaying provisional midweek updates. Label the week/date clearly and retain a live-board link. When the index does not yet exist, retain named legacy Season data; integrity failures must not be presented as verified.

Publish after source checks through the existing approved mirror, with the main source commit in provenance. Exact HTTP byte verification serves the engine's closeout precondition; a deploy success alone does not complete this dependency or the broader rebuild.
