---
name: New financial feature pages
description: BudgetPlanner, SavingsGoals, Beneficiaries, VirtualCards — all localStorage-backed
---

## Pages added
- `/budget` → `src/pages/BudgetPlanner.tsx` — monthly budget per category, auto-calculates spend from transactions table
- `/savings` → `src/pages/SavingsGoals.tsx` — savings goals with emoji/color, manual top-up tracking
- `/beneficiaries` → `src/pages/Beneficiaries.tsx` — saved contacts, verifies against profiles.phone_number, quick-send button
- `/virtual-cards` → `src/pages/VirtualCards.tsx` — deterministic card numbers from user UUID hash, freeze/unfreeze, online toggle

## Storage
All use localStorage keyed by user.id: `vbank_budgets_v1_{userId}`, `vbank_savings_goals_v1_{userId}`, `vbank_beneficiaries_v1_{userId}`, `vbank_vcards_v1_{userId}`

**Why:** Avoids Supabase schema changes. Downside: data is device-local. If DB persistence needed later, move to Supabase with `as never` table cast pattern.

## Menu
Menu.tsx now uses `menuSections` (array of { title, items[] }) instead of flat `menuItems` array.
