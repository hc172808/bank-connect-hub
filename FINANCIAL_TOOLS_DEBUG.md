# Financial Tools Debug List

Audit date: 2026-09-24

Scope reviewed:

- `src/pages/FinancialTools.tsx`
- `src/pages/BudgetPlanner.tsx`
- `src/pages/SavingsGoals.tsx`
- `src/pages/ClientDashboard.tsx`
- `src/pages/Menu.tsx`

## Findings

### 1. Monthly expense and savings metrics use all-time records — High

**Status:** Fixed

`FinancialTools` labels the expense total as “This Month,” but `totalExpenses` currently sums every stored expense. The savings rate also uses all stored income and expenses, so the displayed monthly health metrics become inaccurate as soon as a user has records from an earlier month.

**Fix:** Scope expense and income calculations used by the monthly summary, savings rate, and category breakdown to the current calendar month.

**File:** `src/pages/FinancialTools.tsx`

### 2. Dashboard and Savings Goals use different localStorage keys — High

**Status:** Open

`SavingsGoals` saves under `vbank_savings_goals_v1_<userId>`, while `ClientDashboard` reads `savings_goals_<userId>`. The dashboard savings widget therefore does not show goals created on the Savings Goals page.

**Fix:** Introduce one shared storage-key helper and use it in both pages. Preserve a one-time read of the legacy key if existing users have data there.

**Files:** `src/pages/SavingsGoals.tsx`, `src/pages/ClientDashboard.tsx`

### 3. Financial Tools can save invalid numeric values — High

**Status:** Open

Expense and income forms only check whether the amount field is non-empty. `parseFloat()` can save `NaN`, zero, or negative values, which then corrupt totals and health calculations. Debt values have similar gaps: negative totals, negative remaining balances, remaining balances above the original debt, and invalid rates are accepted.

**Fix:** Validate finite positive amounts at the form boundary and enforce debt ranges before saving.

**File:** `src/pages/FinancialTools.tsx`

### 4. Corrupt localStorage can break page initialization — Medium

**Status:** Open

`FinancialTools` and `SavingsGoals` call `JSON.parse()` without a recovery path. A malformed or manually edited localStorage value can prevent the page from loading.

**Fix:** Parse through a guarded helper, reset invalid data to an empty state, and show a recoverable warning where appropriate.

**Files:** `src/pages/FinancialTools.tsx`, `src/pages/SavingsGoals.tsx`

### 5. “Mark Paid” deletes a debt instead of recording a payment — Medium

**Status:** Open

The Debt tab labels the action “Mark Paid,” but it removes the full debt record immediately. This loses the debt history and does not update the remaining balance incrementally.

**Fix:** Add a payment flow that reduces `remaining`, keeps the debt until fully paid, and only removes/archive it after confirmation.

**File:** `src/pages/FinancialTools.tsx`

### 6. Financial Tools data is device-local only — Medium

**Status:** Open

Expenses, income, and debts are stored in browser localStorage. They do not follow the user to another device, browser, or a reinstalled app, and they are not available to server-side financial reports.

**Fix:** Move these records to authenticated Supabase tables or a server-backed financial ledger after the data model and migration are approved.

**File:** `src/pages/FinancialTools.tsx`

### 7. Currency is hard-coded to dollars — Low

**Status:** Open

Financial Tools displays `$` for wallet balance, expenses, income, debt, and net worth regardless of the user's configured currency.

**Fix:** Use the app's shared currency setting and formatter for all financial values.

**File:** `src/pages/FinancialTools.tsx`

## Fix order

1. Correct monthly metrics (current fix).
2. Repair the dashboard/Savings Goals storage-key mismatch.
3. Reject invalid financial amounts and debt ranges.
4. Recover safely from malformed localStorage.
5. Replace destructive debt deletion with payment tracking.
6. Move Financial Tools records to durable authenticated storage.
7. Apply the shared currency formatter.

## Verification plan

- Run TypeScript validation and a production build after each fix.
- Recheck the affected page and dependent dashboard behavior after each fix.
- Test with empty data, current-month data, prior-month data, malformed localStorage, zero/negative amounts, and a zero wallet balance.