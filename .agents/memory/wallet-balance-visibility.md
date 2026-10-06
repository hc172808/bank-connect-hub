---
name: Wallet balance visibility
description: Confirmed staff-role rules for balances shown in Manage Users.
---

Agents may see client and vendor wallet balances in the shared staff user list, but not balances for agents, administrators, or founders. Administrators and founders may see all balances. Preserve each account's owner-only wallet access in personal wallet views.

**Why:** The user explicitly selected client/vendor-only visibility for agents; this is a product privacy boundary.

**How to apply:** Enforce the scope in both the Supabase wallet SELECT policy and the Manage Users UI. UI filtering is defense in depth and does not replace RLS.

Staff balance endpoints that use the Supabase service role must enforce the same role scope themselves: admins/founders may read all balances; agents may read only client/vendor balances and never staff wallets.

**Why:** Service-role database clients bypass RLS, so an endpoint that returns wallet data must apply the authorization boundary before sending any records to the browser.

**How to apply:** Validate the staff bearer token and current role on the server for each request, filter agent results server-side, and keep full account-detail routes admin/founder-only.
