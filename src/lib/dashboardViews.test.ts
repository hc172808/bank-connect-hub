import { describe, expect, test } from "bun:test";
import { canUseBankingView, isStaffRole, staffDashboardPath } from "./dashboardViews";

describe("staff banking views", () => {
  for (const role of ["admin", "founder", "agent"] as const) {
    test(`${role} can use the regular dashboard and banking actions`, () => {
      expect(canUseBankingView(role, "/client")).toBe(true);
      expect(canUseBankingView(role, "/send-money")).toBe(true);
      expect(canUseBankingView(role, "/virtual-cards")).toBe(true);
      expect(canUseBankingView(role, "/admin/users")).toBe(false);
    });
  }
  test("staff returns to the correct privileged dashboard", () => {
    expect(staffDashboardPath("admin")).toBe("/admin");
    expect(staffDashboardPath("founder")).toBe("/admin");
    expect(staffDashboardPath("agent")).toBe("/agent");
  });
  test("clients and vendors do not get staff switching", () => {
    expect(isStaffRole("client")).toBe(false);
    expect(isStaffRole("vendor")).toBe(false);
    expect(canUseBankingView("vendor", "/client")).toBe(false);
    expect(canUseBankingView(null, "/client")).toBe(false);
  });
});