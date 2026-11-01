# Dashboard architecture
- Reuse the client banking route tree for authenticated staff on explicit banking paths; never change their authenticated role to switch views, so staff authorization remains intact.
- Keep dashboard path classification in `src/lib/dashboardViews.ts` and both switching controls in `DashboardSwitcher`; this prevents staff routes from being captured by banking fallbacks.
- Scope the mockup-inspired neon tokens to `.banking-dashboard`; other pages retain runtime theme settings.
- Personal dashboards read the signed-in user's wallet separately from bank reserves and on-chain balances, so the views do not imply these are interchangeable funds.