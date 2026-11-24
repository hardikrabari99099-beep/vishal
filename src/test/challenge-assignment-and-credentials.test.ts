import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PRODUCT_TYPES } from "@/lib/funding-products";

const quotePrices = vi.hoisted(() => ({
  RELIANCE: 1000,
  TCS: 1000,
  NIFTY: 24500,
}));

vi.mock("@/server/market-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/market-data")>();
  return {
    ...actual,
    getQuotes: vi.fn(async (rawSymbols?: string[]) => {
      const syms =
        Array.isArray(rawSymbols) && rawSymbols.length
          ? rawSymbols
          : Object.keys(quotePrices);
      const quotes = syms.map((s) => {
        const inst = actual.resolveInstrument(s);
        const key = String(inst.symbol || s).toUpperCase();
        const ltp = quotePrices[key as keyof typeof quotePrices] ?? 1000;
        return {
          symbol: key,
          name: inst.name,
          exchange: inst.exchange,
          lot: inst.lot,
          ltp,
          open: ltp,
          high: ltp,
          low: ltp,
          prevClose: ltp,
          change: 0,
          changePct: 0,
          source: "test-mock",
          timestamp: new Date().toISOString(),
        };
      });
      return { quotes, fetchedAt: new Date().toISOString() };
    }),
  };
});

async function apiCall(
  method: string,
  path: string,
  { body, token }: { body?: unknown; token?: string } = {},
) {
  const { handleApi } = await import("@/server/api-handler");
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["authorization"] = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const req = new Request(`http://localhost:3000/api/${cleanPath}`, init);
  const splat = cleanPath.split("?")[0] || "";
  const res = await handleApi(req, splat);
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

describe("Post-payment admin assignment, Classic automated rules, and admin credential visibility", () => {
  const origAdminEmail = process.env["ADMIN_EMAIL"];
  const origAdminPw = process.env["ADMIN_PASSWORD"];
  let adminToken = "";

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-16T06:00:00Z")); // Monday 11:30 IST

    process.env["ADMIN_EMAIL"] = "admin@indifunded.com";
    process.env["ADMIN_PASSWORD"] = "TestAdminPass!2026";
    const admRes = await apiCall("POST", "/auth/admin-login", {
      body: { email: "admin@indifunded.com", password: "TestAdminPass!2026" },
    });
    expect(admRes.status).toBe(200);
    adminToken = String(admRes.data.token || "");
  });

  afterAll(() => {
    vi.useRealTimers();
    if (origAdminEmail === undefined) delete process.env["ADMIN_EMAIL"];
    else process.env["ADMIN_EMAIL"] = origAdminEmail;
    if (origAdminPw === undefined) delete process.env["ADMIN_PASSWORD"];
    else process.env["ADMIN_PASSWORD"] = origAdminPw;
  });

  it("1. Stores trader login password for Admin inspection while omitting it from client auth endpoints", async () => {
    const email = `cred_trader_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const initialPw = "SecretPass!99";

    const signup = await apiCall("POST", "/auth/signup", {
      body: {
        name: "Cred Trader",
        email,
        password: initialPw,
        phone: "9876543210",
      },
    });
    expect(signup.status).toBe(200);
    expect(signup.data.login_password).toBeUndefined();
    expect(signup.data.password_hash).toBeUndefined();

    const login = await apiCall("POST", "/auth/local-login", {
      body: { email, password: initialPw },
    });
    expect(login.status).toBe(200);
    expect(login.data.user.login_password).toBeUndefined();
    expect(login.data.user.password_hash).toBeUndefined();
    const traderToken = String(login.data.token || "");
    const userId = String(signup.data.id || "");

    const meRes = await apiCall("GET", "/auth/me", { token: traderToken });
    expect(meRes.status).toBe(200);
    expect(meRes.data.login_password).toBeUndefined();
    expect(meRes.data.password_hash).toBeUndefined();

    // Admin sees email + login_password in /admin/users and /admin/users/:id/ledger
    const adminUsers = await apiCall("GET", "/admin/users", {
      token: adminToken,
    });
    expect(adminUsers.status).toBe(200);
    const foundUser = adminUsers.data.find(
      (u: { id: string }) => u.id === userId,
    );
    expect(foundUser).toBeTruthy();
    expect(foundUser.email).toBe(email);
    expect(foundUser.login_password).toBe(initialPw);

    const ledgerRes = await apiCall("GET", `/admin/users/${userId}/ledger`, {
      token: adminToken,
    });
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.data.user.email).toBe(email);
    expect(ledgerRes.data.user.login_password).toBe(initialPw);

    // Trader syncing password via /auth/record-credentials updates admin-visible password
    const recordedPw = "TraderChanged!2026";
    const recRes = await apiCall("POST", "/auth/record-credentials", {
      token: traderToken,
      body: { password: recordedPw },
    });
    expect(recRes.status).toBe(200);
    expect(recRes.data.ok).toBe(true);

    // Admin resets trader login password via POST /admin/users/:id/password
    const resetPw = "AdminReset!777";
    const resetRes = await apiCall("POST", `/admin/users/${userId}/password`, {
      token: adminToken,
      body: { password: resetPw },
    });
    expect(resetRes.status).toBe(200);
    expect(resetRes.data.user.login_password).toBe(resetPw);

    // Trader can log in with the new password and /auth/me still hides it
    const reLogin = await apiCall("POST", "/auth/local-login", {
      body: { email, password: resetPw },
    });
    expect(reLogin.status).toBe(200);
    expect(reLogin.data.user.login_password).toBeUndefined();
  });

  it("2. Post-payment Admin Order Assignment provisions Classic Challenge and enforces automated daily loss breach", async () => {
    const email = `classic_fail_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const signup = await apiCall("POST", "/auth/signup", {
      body: {
        name: "Classic Risk Fail",
        email,
        password: "Password@123",
        phone: "9876543210",
      },
    });
    expect(signup.status).toBe(200);
    const login = await apiCall("POST", "/auth/local-login", {
      body: { email, password: "Password@123" },
    });
    const traderToken = String(login.data.token || "");

    // Create a pending UPI order
    const upi = await apiCall("POST", "/orders/upi", {
      body: {
        customer_name: "Classic Risk Fail",
        customer_email: email,
        customer_phone: "9876543210",
        utr: `UTR${Math.floor(100000000 + Math.random() * 900000000)}`,
        plan_id: "plan-starter",
      },
    });
    expect(upi.status).toBe(200);

    // Admin assigns IndiFunded Classic Challenge with strict automated rules (5% daily, 10% max loss)
    const assign = await apiCall(
      "POST",
      `/admin/orders/${upi.data.id}/assign-challenge`,
      {
        token: adminToken,
        body: {
          product_type: PRODUCT_TYPES.CLASSIC,
          plan_id: "plan-starter",
          plan_name: "IndiFunded Starter ₹1L",
          starting_capital: 100000,
          profit_target_pct: 10,
          daily_loss_limit_pct: 5,
          max_loss_limit: 10,
          min_trading_days: 2,
          total_trading_days: 30,
          profit_split: 80,
        },
      },
    );
    expect(assign.status).toBe(200);
    expect(assign.data.order.status).toBe("completed");
    expect(assign.data.account.product_type).toBe(PRODUCT_TYPES.CLASSIC);
    expect(assign.data.account.automation_enabled).toBe(true);
    expect(assign.data.account.status).toBe("Active");
    const acctId = String(assign.data.account.id || "");

    // Place a trade and hit >5% daily loss (₹5,000 on ₹1,00,000)
    quotePrices.RELIANCE = 1000;
    const buy = await apiCall("POST", "/me/orders", {
      token: traderToken,
      body: {
        account_id: acctId,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 50,
        type: "MARKET",
      },
    });
    expect(buy.status).toBe(200);

    // Drop RELIANCE from 1000 -> 880 = -₹6,000 unrealized loss -> triggers automated DAILY_LOSS_LIMIT
    quotePrices.RELIANCE = 880;
    const stateAfterDrop = await apiCall(
      "GET",
      `/me/trading-state?account_id=${acctId}`,
      {
        token: traderToken,
      },
    );
    expect(stateAfterDrop.status).toBe(200);
    expect(stateAfterDrop.data.activeAccount.status).toBe("Failed");
    expect(stateAfterDrop.data.activeAccount.trading_enabled).toBe(false);
    expect(stateAfterDrop.data.activeAccount.breach_code).toBe(
      "DAILY_LOSS_LIMIT",
    );
    expect(stateAfterDrop.data.positions.length).toBe(0);
  });

  it("3. Automated Classic Challenge auto-passes and creates Funded account upon target + min_trading_days", async () => {
    const email = `classic_pass_${Math.random().toString(36).slice(2, 7)}@example.com`;
    await apiCall("POST", "/auth/signup", {
      body: {
        name: "Classic Winner",
        email,
        password: "Password@123",
        phone: "9876543210",
      },
    });
    const login = await apiCall("POST", "/auth/local-login", {
      body: { email, password: "Password@123" },
    });
    const traderToken = String(login.data.token || "");

    const upi = await apiCall("POST", "/orders/upi", {
      body: {
        customer_name: "Classic Winner",
        customer_email: email,
        customer_phone: "9876543210",
        utr: `UTR${Math.floor(100000000 + Math.random() * 900000000)}`,
        plan_id: "plan-starter",
      },
    });
    expect(upi.status).toBe(200);

    const assign = await apiCall(
      "POST",
      `/admin/orders/${upi.data.id}/assign-challenge`,
      {
        token: adminToken,
        body: {
          product_type: PRODUCT_TYPES.CLASSIC,
          plan_id: "plan-starter",
          plan_name: "IndiFunded Starter ₹1L",
          starting_capital: 100000,
          profit_target_pct: 10,
          daily_loss_limit_pct: 5,
          max_loss_limit: 10,
          min_trading_days: 2,
          total_trading_days: 30,
          profit_split: 80,
        },
      },
    );
    expect(assign.status).toBe(200);
    const acctId = String(assign.data.account.id || "");

    // Day 1: realize +₹10,500 (> 10% profit target), 1 trading day done -> still Active
    vi.setSystemTime(new Date("2026-11-16T06:00:00Z"));
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: traderToken,
      body: {
        account_id: acctId,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 50,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 1210;
    await apiCall("POST", "/me/orders", {
      token: traderToken,
      body: {
        account_id: acctId,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 50,
        type: "MARKET",
      },
    });
    const day1 = await apiCall(
      "GET",
      `/me/trading-state?account_id=${acctId}`,
      {
        token: traderToken,
      },
    );
    expect(day1.data.activeAccount.trading_days_done).toBe(1);
    expect(day1.data.activeAccount.status).toBe("Active");

    // Day 2: execute 1 small profitable trade => 2 distinct days + >=10% target => Auto PASS + Funded!
    vi.setSystemTime(new Date("2026-11-17T06:00:00Z"));
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: traderToken,
      body: {
        account_id: acctId,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 5,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 1010;
    await apiCall("POST", "/me/orders", {
      token: traderToken,
      body: {
        account_id: acctId,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 5,
        type: "MARKET",
      },
    });

    const acctsRes = await apiCall("GET", "/me/accounts", {
      token: traderToken,
    });
    const passed = acctsRes.data.accounts.find(
      (a: { id: string }) => a.id === acctId,
    );
    const funded = acctsRes.data.accounts.find(
      (a: { parent_account_id?: string }) => a.parent_account_id === acctId,
    );
    expect(passed.status).toBe("Passed");
    expect(passed.funded_eligible).toBe(true);
    expect(funded).toBeTruthy();
    expect(funded.status).toBe("Funded");
    expect(funded.account_number).toMatch(/^IF-FD-/);
    expect(funded.trading_enabled).toBe(true);
  });
});
