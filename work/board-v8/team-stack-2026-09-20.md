# Team matchup readability update

Away team is the first line; home team is the second. Each line uses the existing 24px team-logo asset and team code. Projected-winner bolding and actual-winner highlights are unchanged. Matchup rows are 64px on desktop and 132px on mobile; ERROR rows retain their 24px drawing lanes inside larger targets.

Verification: 26 UI/domain tests passed; TypeScript and production build passed. Browser checks at 1280, 390 and 360px verify away/home order, vertical separation, loaded logos, unchanged column geometry, winner styling, expansion and no horizontal page overflow. No console errors. Screenshots are in team-stack-screenshots/.

No model inputs, projections, locked results or gates changed.

Confidence: high — the layout is verified in the browser at desktop and mobile widths and preserves existing interactions. Lower to medium if another supported browser shows clipping or fails to load the existing logo assets.
