---
name: Wallet balance visibility
description: Confirmed staff-role rules for balances shown in Manage Users.
---

Agents may see client and vendor wallet balances in the shared staff user list, but not balances for agents, administrators, or founders. Administrators and founders may see all balances. Preserve each account's owner-only wallet access in personal wallet views.

**Why:** The user explicitly selected client/vendor-only visibility for agents; this is a product privacy boundary.

**How to apply:** Enforce the scope in both the Supabase wallet SELECT policy and the Manage Users UI. UI filtering is defense in depth and does not replace RLS.
