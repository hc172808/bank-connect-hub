import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import pg from "pg";

// Integration tests against the managed database. Every test rolls back;
// no approval/processing RPC is called and no wallet/transfer is written.
// The sandbox-managed PostgreSQL endpoint uses its own certificate chain.
const client = new pg.Client({ ssl: { rejectUnauthorized: false } });
let transfer: { id: string; sender_id: string; receiver_id: string; amount: string };
let adminId: string;
let otherId: string;

beforeAll(async () => {
  await client.connect();
  const eligible = await client.query(`
    SELECT t.id, t.sender_id, t.receiver_id, t.amount
    FROM public.transactions t
    WHERE t.status = 'completed' AND t.transaction_type = 'transfer'
      AND t.amount > 0 AND t.sender_id <> t.receiver_id
      AND NOT EXISTS (SELECT 1 FROM public.fund_reversals r
        WHERE r.transaction_id = t.id AND r.status IN ('pending', 'approved', 'completed'))
    ORDER BY t.created_at DESC LIMIT 1`);
  if (!eligible.rows[0]) throw new Error("An eligible existing transfer is required; no funds will be seeded.");
  transfer = eligible.rows[0];
  const admin = await client.query("SELECT user_id FROM public.user_roles WHERE role = 'admin' LIMIT 1");
  if (!admin.rows[0]) throw new Error("An existing admin is required.");
  adminId = admin.rows[0].user_id;
  const other = await client.query(`SELECT p.id FROM public.profiles p
    WHERE p.id <> $1 AND NOT EXISTS (SELECT 1 FROM public.user_roles r
      WHERE r.user_id=p.id AND r.role::text IN ('admin','agent','founder')) LIMIT 1`, [transfer.sender_id]);
  if (!other.rows[0]) throw new Error("An existing non-staff account is required.");
  otherId = other.rows[0].id;
});
afterAll(async () => { await client.end(); });

async function asUser(userId: string) {
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("SET LOCAL ROLE authenticated");
}
async function rpc(name: "request_fund_reversal" | "reject_fund_reversal", args: unknown[]) {
  const params = args.map((_, i) => `$${i + 1}`).join(",");
  const result = await client.query(`SELECT public.${name}(${params}) AS result`, args);
  return result.rows[0].result;
}
async function rollbackTest(run: () => Promise<void>) {
  await client.query("BEGIN");
  try { await run(); } finally { await client.query("ROLLBACK"); }
}
async function request() {
  await asUser(transfer.sender_id);
  const result = await rpc("request_fund_reversal", [transfer.id, "Rollback-only reversal verification"]);
  expect(result.success).toBe(true);
  return result.reversal_id as string;
}
async function snapshot() {
  await client.query("RESET ROLE");
  return (await client.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(w) ORDER BY w.id) FROM public.wallets w) wallets,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.transactions t) transfers`)).rows[0];
}

describe("fund reversals (rollback-only integration)", () => {
  test("requests and rejections do not move funds or write transfers", async () => rollbackTest(async () => {
    const before = await snapshot();
    const id = await request();
    await asUser(adminId);
    expect((await rpc("reject_fund_reversal", [id])).success).toBe(true);
    expect(await snapshot()).toEqual(before);
  }));
  test("request amount and identities come from the original transfer", async () => rollbackTest(async () => {
    const id = await request();
    const row = (await client.query("SELECT * FROM public.fund_reversals WHERE id=$1", [id])).rows[0];
    expect(row.amount).toBe(transfer.amount);
    expect(row.requester_id).toBe(transfer.sender_id);
    expect(row.recipient_id).toBe(transfer.receiver_id);
    expect(row.status).toBe("pending");
  }));
  test("another user cannot request a reversal of the sender's transfer", async () => rollbackTest(async () => {
    await asUser(otherId);
    expect((await rpc("request_fund_reversal", [transfer.id, null])).success).toBe(false);
  }));
  test("a pending request blocks duplicates", async () => rollbackTest(async () => {
    await request();
    expect((await rpc("request_fund_reversal", [transfer.id, null])).success).toBe(false);
  }));
  test("reason cannot exceed 500 characters", async () => rollbackTest(async () => {
    await asUser(transfer.sender_id);
    expect((await rpc("request_fund_reversal", [transfer.id, "x".repeat(501)])).success).toBe(false);
  }));
  test("non-staff users cannot reject requests", async () => rollbackTest(async () => {
    const id = await request();
    await asUser(otherId);
    expect((await rpc("reject_fund_reversal", [id])).success).toBe(false);
  }));
  test("admin rejection persists the decision and notifies the requester", async () => rollbackTest(async () => {
    const id = await request();
    await asUser(adminId);
    expect((await rpc("reject_fund_reversal", [id])).success).toBe(true);
    const row = (await client.query("SELECT * FROM public.fund_reversals WHERE id=$1", [id])).rows[0];
    expect(row.status).toBe("rejected");
    expect(row.approved_by).toBe(adminId);
    expect(row.funds_held_at).toBe(null);
    expect(row.funds_returned_at).toBe(null);
    await client.query("RESET ROLE");
    const notice = await client.query(`SELECT id FROM public.notifications
      WHERE user_id=$1 AND title='Reversal request rejected' AND created_at >= transaction_timestamp()`, [transfer.sender_id]);
    expect(notice.rows.length).toBe(1);
  }));
  test("a rejected request cannot be rejected twice", async () => rollbackTest(async () => {
    const id = await request();
    await asUser(adminId);
    expect((await rpc("reject_fund_reversal", [id])).success).toBe(true);
    expect((await rpc("reject_fund_reversal", [id])).success).toBe(false);
  }));
  test("a rejected transfer can be requested again", async () => rollbackTest(async () => {
    const id = await request();
    await asUser(adminId);
    expect((await rpc("reject_fund_reversal", [id])).success).toBe(true);
    expect(await request()).not.toBe(id);
  }));
  test("authenticated callers cannot write reversal statuses directly", async () => rollbackTest(async () => {
    await asUser(adminId);
    const privileges = (await client.query(`SELECT
      has_table_privilege(current_user, 'public.fund_reversals', 'INSERT') AS insert_allowed,
      has_table_privilege(current_user, 'public.fund_reversals', 'UPDATE') AS update_allowed`)).rows[0];
    expect(privileges.insert_allowed).toBe(false);
    expect(privileges.update_allowed).toBe(false);
  }));
});