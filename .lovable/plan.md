# Build Plan — 5 features

Big scope, so I'll build in 2 phases. Phase A has no external dependencies and ships immediately. Phase B needs you to connect Twilio and set up an email sender domain — I'll prompt for those when we get there.

## Phase A — Build now (no setup needed)

### 1. RBAC route guards
- Add `<RoleGuard allow={['admin']}>` wrapper component using existing `useAuth` + `user_roles`.
- Wrap every admin route, every agent route, every client-only route in `App.tsx`.
- On role mismatch → redirect to the user's correct dashboard + toast "Access denied".
- Server-side already enforced via RLS + `has_role()`; this just stops direct-URL navigation.

### 2. Reversal visibility & fund hold UX
- Already in DB: when admin/agent approves, funds are deducted from recipient immediately and returned to sender after 1h (`approve_fund_reversal` + `process_pending_reversals`).
- Add a **"Pending Reversal Hold"** banner on `ClientDashboard` for the recipient — shows amount, time remaining, "cannot be used".
- Add a **"Reversal in progress"** card on requester's dashboard with countdown until funds return.
- Add notification badge linking to `RequestReversal` / `ManageReversals`.

### 3. Announcements / Ads system
- New table `announcements` (title, body, image_url, link_url, starts_at, ends_at, is_active, created_by).
- Admin page `AdminAnnouncements.tsx` — CRUD, schedule start/end, enable/disable toggle.
- Carousel widget on `ClientDashboard` showing only active ads where `now() BETWEEN starts_at AND ends_at`.

### 4. Admin shell (predefined safe commands)
- New page `AdminConsole.tsx` with a terminal-style UI.
- Whitelisted commands invoked via a new edge function `admin-console`:
  - `process-reversals` → calls `process_pending_reversals()`
  - `recalc-balances` → recomputes wallet from `transactions`
  - `clear-stale-sessions` → marks `device_sessions` inactive >30d as revoked
  - `kyc-stats`, `tx-stats`, `flag-large-tx` — read-only reports
  - `help` — list commands
- Server checks `has_role(admin)`; every command logged to `audit_logs`.

### 5. Multi-country support + country bans
- New table `countries` (code, name, dial_code, is_allowed, is_banned_by_admin).
- Seed with Guyana (+592), Trinidad (+1868), Jamaica (+1876), USA (+1), UK (+44), Canada (+1), Suriname (+597), Brazil (+55), India (+91), Nigeria (+234).
- Replace `GuyanaPhoneInput` with generic `CountryPhoneInput` (keeps +592 as default).
- Admin page `AdminCountries.tsx` — toggle allowed/banned.
- Signup blocks banned countries. Existing +592 users unaffected.

## Phase B — After Phase A (requires your input)

### 6. Email + WhatsApp notifications
- KYC status changes → email + WhatsApp to the user.
- Suspicious activity alerts → email + WhatsApp to all admins.
- Triggered by DB triggers calling an edge function `send-alert-notification`.
- **You'll need to:**
  - Connect the **Twilio** connector (I'll prompt).
  - Set up your **email sender domain** in Lovable Cloud (I'll prompt).

## Technical notes
- Migrations: `announcements`, `countries`, optional `reversal_holds` view.
- Edge functions: `admin-console`, later `send-alert-notification`.
- New components: `RoleGuard`, `CountryPhoneInput`, `AnnouncementCarousel`, `ReversalHoldBanner`.
- All admin actions write to `audit_logs`.

Ready to start Phase A?
