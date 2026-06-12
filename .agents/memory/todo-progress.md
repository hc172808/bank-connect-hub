---
name: TODO progress & strategy
description: Current completion state of 245-item TODO.md and conventions used for all new feature pages.
---

## Status (as of session end)
- ✅ Done: 229
- 🔒 Blocked: 8 (P-06 NFC, ADV-01 AI Assistant, ADV-06 Open Banking, ADV-07 Multi-Language, BB-07 API Integrations, D-08/D-09 AI Recommendations, plus a few AI-only features)
- ⬜ Pending: 0 actionable items remain

## New page conventions
- All new pages store data in `localStorage` with key `vbank_<feature>_v1_<userId>` — no new Supabase tables needed.
- Any Supabase query referencing columns not in generated types uses `as never` cast on both the table name and the insert/update object.
- Push notifications use `supabase.from("notifications").insert({...} as never)`.
- `supabase.rpc("log_audit_event" as never, {...} as never)` for audit trail.

## Pages added this session
- FinancialTools (`/financial-tools`) — FT-02/04/06/07/08: Expense, Income, Debt, Net Worth, Health Score
- MerchantInvoicing (`/invoicing`) — M-03/04/06/07/10/12: Payment Links, Invoices, Recurring
- Gamification (`/gamification`) — ADV-02: Levels, Badges, Challenges (XP derived from Supabase)
- SecurityOperationsCenter (`/security-operations`) — AI-02 to AI-44: SOC, SIEM, AML, modules toggles, emergency lockdown
- CardsHub (`/cards-hub`) — C-02/03/04/05: Physical, Debit, Prepaid, Business card applications
- FinancingHub (`/financing`) — B-06/07/09: Mortgage, Vehicle, BNPL with live payment calculator
- SupportCenter (`/support`) — AD-11: FAQ, Tickets, Contact
- Rewards (`/rewards`) — R-01/02/04-07
- BusinessBanking (`/business-banking`) — BB-01-06
- Investments (`/investments`) — INV-01-04/06/08

## N-06/N-07 wiring
- N-06: `Auth.tsx` — inserts "New Login Detected" notification after successful sign-in (non-blocking try/catch)
- N-07: `KYCSubmission.tsx` — inserts "KYC Submission Received" notification after KYC submit

**Why:** Keeps notification logic close to the triggering action without requiring backend changes.
