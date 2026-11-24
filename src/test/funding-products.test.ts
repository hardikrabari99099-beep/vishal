import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FUNDING_PRODUCTS,
  PRODUCT_TYPES,
  computeAccountRiskSnapshot,
  normalizeFundingProductsConfig,
  resolveFundingProductSelection,
} from "@/lib/funding-products";

const quotePrices = vi.hoisted(() => ({
  RELIANCE: 1000,
  TCS: 1000,
  INFY: 1000,
  SBIN: 1000,
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
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
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

async function signupAndLogin(name: string, idx: number) {
  const email = `fp_trader_${idx}_${Math.random().toString(36).slice(2, 7)}@example.com`;
  const signup = await apiCall("POST", "/auth/signup", {
    body: { name, email, password: "Password@123", phone: "9876543210" },
  });
  expect(signup.status).toBe(200);
  const login = await apiCall("POST", "/auth/local-login", {
    body: { email, password: "Password@123" },
  });
  expect(login.status).toBe(200);
  return {
    email,
    userId: String(signup.data.id || ""),
    token: String(login.data.token || ""),
  };
}

async function purchaseAndCompleteOrder({
  adminToken,
  email,
  name,
  productType,
  accountSize,
  drawdownMode,
  payoutCycle,
  planId,
}: {
  adminToken: string;
  email: string;
  name: string;
  productType?: string;
  accountSize?: number;
  drawdownMode?: string;
  payoutCycle?: string;
  planId?: string;
}) {
  const upi = await apiCall("POST", "/orders/upi", {
    body: {
      customer_name: name,
      customer_email: email,
      customer_phone: "9876543210",
      utr: `UTR${Math.floor(100000000 + Math.random() * 900000000)}`,
      ...(productType
        ? {
            product_type: productType,
            account_size: accountSize,
            drawdown_mode: drawdownMode,
            payout_cycle: payoutCycle,
          }
        : { plan_id: planId }),
    },
  });
  expect(upi.status).toBe(200);
  const done = await apiCall("PATCH", `/orders/${upi.data.id}/status`, {
    token: adminToken,
    body: { status: "completed" },
  });
  expect(done.status).toBe(200);
  return upi.data;
}

describe("Funding products config & pure risk snapshot math", () => {
  it("normalizes default tiers and resolves Instant Funding & 1-Step selections", () => {
    const cfg = normalizeFundingProductsConfig(DEFAULT_FUNDING_PRODUCTS);
    expect(cfg.instant_funding.tiers.map((t) => t.size)).toEqual([
      50000, 100000, 200000, 300000, 500000, 1000000,
    ]);
    expect(cfg.one_step.tiers.map((t) => t.size)).toEqual([
      100000, 200000, 300000, 500000, 1000000,
    ]);

    const instMonthly = resolveFundingProductSelection(cfg, {
      product_type: PRODUCT_TYPES.INSTANT,
      account_size: 100000,
      drawdown_mode: "eod",
      payout_cycle: "monthly",
    });
    expect(instMonthly.ok).toBe(true);
    if (instMonthly.ok) {
      expect(instMonthly.rules.profit_split).toBe(90);
      expect(instMonthly.rules.daily_loss_limit_pct).toBe(3);
      expect(instMonthly.rules.trailing_drawdown_pct).toBe(5);
      expect(instMonthly.rules.buffer_pct).toBe(3);
      expect(instMonthly.rules.drawdown_mode).toBe("eod");
    }

    const oneStep = resolveFundingProductSelection(cfg, {
      product_type: PRODUCT_TYPES.ONE_STEP,
      account_size: 100000,
    });
    expect(oneStep.ok).toBe(true);
    if (oneStep.ok) {
      expect(oneStep.challenge_fee).toBe(2999);
      expect(oneStep.rules.profit_target_pct).toBe(10);
      expect(oneStep.rules.daily_loss_limit_pct).toBe(3);
      expect(oneStep.rules.overall_loss_limit_pct).toBe(6);
      expect(oneStep.rules.min_trading_days).toBe(3);
      expect(oneStep.rules.no_time_limit).toBe(true);
    }
  });

  it("distinguishes Intraday vs EOD trailing drawdown and 3% profit buffer reservation", () => {
    const baseAccount = {
      id: "acct-math",
      product_type: PRODUCT_TYPES.INSTANT,
      account_type: "Funded",
      status: "Funded",
      starting_capital: 100000,
      balance: 100000,
      daily_starting_balance: 100000,
      highest_recorded_equity: 100000,
      eod_high_watermark: 100000,
      daily_loss_limit_pct: 3,
      trailing_drawdown_pct: 5,
      buffer_pct: 3,
      profit_split: 80,
      payout_cycle: "biweekly",
    };

    // Intraday: +₹10k unrealized pushes peak to 1,10,000 and floor to 1,04,500
    const intradaySnap = computeAccountRiskSnapshot({
      account: { ...baseAccount, drawdown_mode: "intraday" },
      positions: [{ symbol: "RELIANCE", qty: 50, avg: 1000 }],
      quoteMap: { RELIANCE: { ltp: 1200 } },
    });
    expect(intradaySnap.current_equity).toBe(110000);
    expect(intradaySnap.highest_recorded_equity).toBe(110000);
    expect(intradaySnap.trailing_drawdown_floor).toBe(104500);

    // EOD: +₹10k unrealized keeps eod watermark at 1,00,000 and floor at 95,000 before settlement
    const eodSnap = computeAccountRiskSnapshot({
      account: { ...baseAccount, drawdown_mode: "eod" },
      positions: [{ symbol: "RELIANCE", qty: 50, avg: 1000 }],
      quoteMap: { RELIANCE: { ltp: 1200 } },
    });
    expect(eodSnap.current_equity).toBe(110000);
    expect(eodSnap.eod_high_watermark).toBe(100000);
    expect(eodSnap.trailing_drawdown_floor).toBe(95000);

    // Buffer math: +₹2,500 closed profit (< ₹3,000 3% buffer) => 0 withdrawable
    const underBuffer = computeAccountRiskSnapshot({
      account: { ...baseAccount, balance: 102500, realized_pnl: 2500 },
    });
    expect(underBuffer.buffer_satisfied).toBe(false);
    expect(underBuffer.withdrawable_profit).toBe(0);

    // +₹5,000 closed profit => ₹2,000 above ₹3,000 buffer => 80% = ₹1,600 withdrawable
    const overBuffer = computeAccountRiskSnapshot({
      account: { ...baseAccount, balance: 105000, realized_pnl: 5000 },
    });
    expect(overBuffer.buffer_satisfied).toBe(true);
    expect(overBuffer.withdrawable_profit).toBe(1600);
    expect(overBuffer.payout_eligible).toBe(true);
  });
});

describe("IndiFunded Instant Funding & 1-Step Challenge Automated Engine E2E", () => {
  const origAdminEmail = process.env["ADMIN_EMAIL"];
  const origAdminPw = process.env["ADMIN_PASSWORD"];
  let adminToken = "";

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T06:00:00Z")); // 11:30 IST

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

  it("1. Admin configures Instant Funding & 1-Step prices independently without altering Classic plans", async () => {
    const beforePlans = await apiCall("GET", "/plans");
    expect(beforePlans.status).toBe(200);

    const cfgBefore = await apiCall("GET", "/admin/funding-products", {
      token: adminToken,
    });
    expect(cfgBefore.status).toBe(200);

    const updatedInstTiers = cfgBefore.data.instant_funding.tiers.map(
      (t: Record<string, unknown>) =>
        t["size"] === 100000
          ? { ...t, intraday_price: 4999, eod_price: 5999 }
          : t,
    );
    const updatedOneTiers = cfgBefore.data.one_step.tiers.map(
      (t: Record<string, unknown>) =>
        t["size"] === 200000 ? { ...t, price: 5799 } : t,
    );

    const putRes = await apiCall("PUT", "/admin/funding-products", {
      token: adminToken,
      body: {
        instant_funding: { tiers: updatedInstTiers },
        one_step: { tiers: updatedOneTiers },
      },
    });
    expect(putRes.status).toBe(200);

    const pubCfg = await apiCall("GET", "/funding-products");
    expect(pubCfg.status).toBe(200);
    const t1LInst = pubCfg.data.instant_funding.tiers.find(
      (t: { size: number }) => t.size === 100000,
    );
    expect(t1LInst.intraday_price).toBe(4999);
    expect(t1LInst.eod_price).toBe(5999);
    const t1LOne = pubCfg.data.one_step.tiers.find(
      (t: { size: number }) => t.size === 100000,
    );
    expect(t1LOne.price).toBe(2999);
    const t2LOne = pubCfg.data.one_step.tiers.find(
      (t: { size: number }) => t.size === 200000,
    );
    expect(t2LOne.price).toBe(5799);

    const afterPlans = await apiCall("GET", "/plans");
    expect(afterPlans.data).toEqual(beforePlans.data);
  });

  it("2. Instant Funding payment auto-activates Funded account and reserves 3% profit buffer with 80% bi-weekly split", async () => {
    const trader = await signupAndLogin("Vikram Instant", 1);
    const order = await purchaseAndCompleteOrder({
      adminToken,
      email: trader.email,
      name: "Vikram Instant",
      productType: PRODUCT_TYPES.INSTANT,
      accountSize: 100000,
      drawdownMode: "intraday",
      payoutCycle: "biweekly",
    });
    expect(order.amount).toBe(4999);

    const acctsRes = await apiCall("GET", "/me/accounts", {
      token: trader.token,
    });
    expect(acctsRes.status).toBe(200);
    const acct = acctsRes.data.accounts[0];
    expect(acct.product_type).toBe(PRODUCT_TYPES.INSTANT);
    expect(acct.status).toBe("Funded");
    expect(acct.account_type).toBe("Funded");
    expect(acct.daily_loss_limit_pct).toBe(3);
    expect(acct.trailing_drawdown_pct).toBe(5);
    expect(acct.buffer_pct).toBe(3);
    expect(acct.profit_split).toBe(80);
    expect(acct.profit_target_pct).toBe(0);
    expect(acct.trading_enabled).toBe(true);

    // Realize +₹2,000 (< ₹3,000 buffer)
    quotePrices.RELIANCE = 1000;
    const buy1 = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 10,
        type: "MARKET",
      },
    });
    expect(buy1.status).toBe(200);
    quotePrices.RELIANCE = 1200;
    const sell1 = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 10,
        type: "MARKET",
      },
    });
    expect(sell1.status).toBe(200);

    const payouts1 = await apiCall("GET", "/me/payouts", {
      token: trader.token,
    });
    expect(payouts1.data.accounts[0].buffer_satisfied).toBe(false);
    expect(payouts1.data.accounts[0].withdrawable_profit).toBe(0);
    expect(payouts1.data.accounts[0].payout_eligible).toBe(false);

    // Realize another +₹2,000 => ₹4,000 closed profit (₹1,000 above ₹3,000 buffer => ₹800 withdrawable)
    const buy2 = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 10,
        type: "MARKET",
      },
    });
    expect(buy2.status).toBe(200);
    quotePrices.RELIANCE = 1400;
    const sell2 = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 10,
        type: "MARKET",
      },
    });
    expect(sell2.status).toBe(200);

    const payouts2 = await apiCall("GET", "/me/payouts", {
      token: trader.token,
    });
    expect(payouts2.data.accounts[0].buffer_satisfied).toBe(true);
    expect(payouts2.data.accounts[0].withdrawable_profit).toBe(800);
    expect(payouts2.data.accounts[0].payout_eligible).toBe(true);
  });

  it("3. Instant Funding 3% daily loss breach auto-fails account, closes positions, cancels pending orders, logs breach, and blocks trading", async () => {
    const trader = await signupAndLogin("Daily Breach Trader", 2);
    await purchaseAndCompleteOrder({
      adminToken,
      email: trader.email,
      name: "Daily Breach Trader",
      productType: PRODUCT_TYPES.INSTANT,
      accountSize: 100000,
      drawdownMode: "intraday",
      payoutCycle: "monthly",
    });

    const acct = (await apiCall("GET", "/me/accounts", { token: trader.token }))
      .data.accounts[0];
    expect(acct.profit_split).toBe(90);

    quotePrices.TCS = 1000;
    // Pending LIMIT order (must get auto-cancelled on breach)
    const limitOrd = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "TCS",
        side: "BUY",
        qty: 5,
        type: "LIMIT",
        limit_price: 900,
      },
    });
    expect(limitOrd.status).toBe(200);
    expect(limitOrd.data.order.status).toBe("Pending");

    // Open BUY 20 qty @ 1000
    const mktOrd = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "TCS",
        side: "BUY",
        qty: 20,
        type: "MARKET",
      },
    });
    expect(mktOrd.status).toBe(200);

    // Drop TCS to 840 => -₹3,200 open loss (> 3% ₹3,000 daily loss limit)
    quotePrices.TCS = 840;
    const evalRes = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: { account_id: acct.id, quote_overrides: { TCS: 840 } },
    });
    expect(evalRes.status).toBe(200);
    expect(evalRes.data.breached).toBe(1);

    const hist = await apiCall(
      "GET",
      `/admin/funding-accounts/${acct.id}/history`,
      {
        token: adminToken,
      },
    );
    expect(hist.status).toBe(200);
    expect(hist.data.account.status).toBe("Failed");
    expect(hist.data.account.trading_enabled).toBe(false);
    expect(hist.data.account.breach_code).toBe("DAILY_LOSS_LIMIT");
    expect(hist.data.positions).toHaveLength(0);
    expect(hist.data.breaches).toHaveLength(1);
    expect(hist.data.breaches[0].cancelled_orders_count).toBe(1);
    expect(hist.data.breaches[0].closed_positions_count).toBe(1);
    const cancelledLimit = hist.data.orders.find(
      (o: { id: string }) => o.id === limitOrd.data.order.id,
    );
    expect(cancelledLimit.status).toBe("Cancelled");

    // Dashboard failure notification recorded
    const notifRes = await apiCall("GET", "/me/notifications", {
      token: trader.token,
    });
    expect(
      notifRes.data.some(
        (n: { type: string; title: string }) =>
          n.type === "risk" && n.title.includes(acct.account_number),
      ),
    ).toBe(true);

    // Further trading must be permanently blocked
    const blocked = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "TCS",
        side: "BUY",
        qty: 1,
        type: "MARKET",
      },
    });
    expect(blocked.status).toBe(403);
    expect(blocked.data.code).toBe("ACCOUNT_FAILED");
  });

  it("4. Instant Funding 5% Intraday trailing drawdown raises floor with live peak and breaches on 5% drop from peak", async () => {
    const trader = await signupAndLogin("Intraday Peak Trader", 3);
    await purchaseAndCompleteOrder({
      adminToken,
      email: trader.email,
      name: "Intraday Peak Trader",
      productType: PRODUCT_TYPES.INSTANT,
      account_size: 100000,
      accountSize: 100000,
      drawdownMode: "intraday",
      payoutCycle: "biweekly",
    } as never);

    const acct = (await apiCall("GET", "/me/accounts", { token: trader.token }))
      .data.accounts[0];
    quotePrices.INFY = 1000;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "INFY",
        side: "BUY",
        qty: 50,
        type: "MARKET",
      },
    });

    // Spike to 1200 => equity ₹1,10,000 => trailing floor becomes ₹1,04,500
    quotePrices.INFY = 1200;
    const peakEval = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: { account_id: acct.id, quote_overrides: { INFY: 1200 } },
    });
    expect(peakEval.data.breached).toBe(0);
    const updatedAcct = peakEval.data.results[0].account;
    expect(updatedAcct.highest_recorded_equity).toBe(110000);
    expect(updatedAcct.trailing_drawdown_floor).toBe(104500);

    // Drop to 1088 => equity ₹1,04,400 (< ₹1,04,500 floor, while still net profitable on day!)
    quotePrices.INFY = 1088;
    const dropEval = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: { account_id: acct.id, quote_overrides: { INFY: 1088 } },
    });
    expect(dropEval.data.breached).toBe(1);
    expect(dropEval.data.results[0].account.status).toBe("Failed");
    expect(dropEval.data.results[0].account.breach_code).toBe(
      "TRAILING_DRAWDOWN",
    );
  });

  it("5. Instant Funding 5% EOD trailing drawdown ignores intraday spikes until EOD settlement", async () => {
    const trader = await signupAndLogin("EOD Trader", 4);
    await purchaseAndCompleteOrder({
      adminToken,
      email: trader.email,
      name: "EOD Trader",
      productType: PRODUCT_TYPES.INSTANT,
      accountSize: 100000,
      drawdownMode: "eod",
      payoutCycle: "biweekly",
    });

    const acct = (await apiCall("GET", "/me/accounts", { token: trader.token }))
      .data.accounts[0];
    quotePrices.SBIN = 1000;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: acct.id,
        symbol: "SBIN",
        side: "BUY",
        qty: 50,
        type: "MARKET",
      },
    });

    // Intraday spike to 1200 (equity ₹1,10,000) BEFORE EOD settlement: watermark stays ₹1,00,000
    quotePrices.SBIN = 1200;
    const beforeEod = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: {
        account_id: acct.id,
        quote_overrides: { SBIN: 1200 },
        settle_eod: false,
      },
    });
    expect(beforeEod.data.breached).toBe(0);
    expect(beforeEod.data.results[0].account.eod_high_watermark).toBe(100000);
    expect(beforeEod.data.results[0].account.trailing_drawdown_floor).toBe(
      95000,
    );

    // Intraday pullback to 960 (equity ₹98,000) MUST NOT breach EOD floor (95,000) nor 3% daily loss (97,000)
    quotePrices.SBIN = 960;
    const pullback = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: {
        account_id: acct.id,
        quote_overrides: { SBIN: 960 },
        settle_eod: false,
      },
    });
    expect(pullback.data.breached).toBe(0);
    expect(pullback.data.results[0].account.status).toBe("Funded");

    // Rally back to 1200 and run explicit EOD settlement => watermark locks ₹1,10,000, floor ₹1,04,500
    quotePrices.SBIN = 1200;
    const settled = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: {
        account_id: acct.id,
        quote_overrides: { SBIN: 1200 },
        settle_eod: true,
      },
    });
    expect(settled.data.breached).toBe(0);
    expect(settled.data.results[0].account.eod_high_watermark).toBe(110000);
    expect(settled.data.results[0].account.trailing_drawdown_floor).toBe(
      104500,
    );

    // Subsequent pullback to 1085 (equity ₹1,04,250 <= ₹1,04,500) breaches EOD trailing drawdown!
    quotePrices.SBIN = 1085;
    const postEodBreach = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: { account_id: acct.id, quote_overrides: { SBIN: 1085 } },
    });
    expect(postEodBreach.data.breached).toBe(1);
    expect(postEodBreach.data.results[0].account.breach_code).toBe(
      "TRAILING_DRAWDOWN",
    );
    expect(postEodBreach.data.results[0].account.status).toBe("Failed");
  });

  it("6. 1-Step Challenge breaches independently on 3% daily loss and on 6% overall loss across days", async () => {
    // Part A: 3% daily loss breach
    const traderDaily = await signupAndLogin("1Step Daily Fail", 5);
    const ordA = await purchaseAndCompleteOrder({
      adminToken,
      email: traderDaily.email,
      name: "1Step Daily Fail",
      productType: PRODUCT_TYPES.ONE_STEP,
      accountSize: 100000,
    });
    expect(ordA.amount).toBe(2999);

    const acctA = (
      await apiCall("GET", "/me/accounts", { token: traderDaily.token })
    ).data.accounts[0];
    expect(acctA.product_type).toBe(PRODUCT_TYPES.ONE_STEP);
    expect(acctA.status).toBe("Active");
    expect(acctA.profit_target_pct).toBe(10);
    expect(acctA.daily_loss_limit_pct).toBe(3);
    expect(acctA.overall_loss_limit_pct).toBe(6);
    expect(acctA.min_trading_days).toBe(3);
    expect(acctA.no_time_limit).toBe(true);

    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: traderDaily.token,
      body: {
        account_id: acctA.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 30,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 895; // -₹3,150 (-3.15%)
    const resDaily = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: { account_id: acctA.id, quote_overrides: { RELIANCE: 895 } },
    });
    expect(resDaily.data.breached).toBe(1);
    expect(resDaily.data.results[0].account.breach_code).toBe(
      "DAILY_LOSS_LIMIT",
    );

    // Part B: 6% overall loss breach across multiple days (<3% each day)
    const traderOverall = await signupAndLogin("1Step Overall Fail", 6);
    await purchaseAndCompleteOrder({
      adminToken,
      email: traderOverall.email,
      name: "1Step Overall Fail",
      productType: PRODUCT_TYPES.ONE_STEP,
      accountSize: 100000,
    });
    const acctB = (
      await apiCall("GET", "/me/accounts", { token: traderOverall.token })
    ).data.accounts[0];

    // Day 1: -₹2,500
    vi.setSystemTime(new Date("2026-11-10T06:30:00Z"));
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: traderOverall.token,
      body: {
        account_id: acctB.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 25,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 900;
    await apiCall("POST", "/me/orders", {
      token: traderOverall.token,
      body: {
        account_id: acctB.id,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 25,
        type: "MARKET",
      },
    });

    // Day 2: -₹2,500 (balance -> ₹95,000; daily loss < 3%, overall drawdown 5% < 6%)
    vi.setSystemTime(new Date("2026-11-11T06:30:00Z"));
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: traderOverall.token,
      body: {
        account_id: acctB.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 25,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 900;
    await apiCall("POST", "/me/orders", {
      token: traderOverall.token,
      body: {
        account_id: acctB.id,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 25,
        type: "MARKET",
      },
    });
    const midState = await apiCall(
      "GET",
      `/me/trading-state?account_id=${acctB.id}`,
      {
        token: traderOverall.token,
      },
    );
    expect(midState.data.activeAccount.status).toBe("Active");
    expect(midState.data.activeAccount.balance).toBe(95000);

    // Day 3: open -₹1,100 loss => equity ₹93,900 (< ₹94,000 6% overall loss floor; daily loss only 1.15%!)
    vi.setSystemTime(new Date("2026-11-12T06:30:00Z"));
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: traderOverall.token,
      body: {
        account_id: acctB.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 11,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 900;
    const overallEval = await apiCall("POST", "/admin/risk/evaluate", {
      token: adminToken,
      body: {
        account_id: acctB.id,
        quote_overrides: { RELIANCE: 900 },
        now_iso: "2026-11-12T06:35:00Z",
      },
    });
    expect(overallEval.data.breached).toBe(1);
    expect(overallEval.data.results[0].account.breach_code).toBe(
      "MAX_OVERALL_LOSS",
    );
    expect(overallEval.data.results[0].account.status).toBe("Failed");
  });

  it("7. 1-Step Challenge waits for 3 trading days even after 10% profit, then auto-passes & creates live Funded account", async () => {
    vi.setSystemTime(new Date("2026-11-10T06:00:00Z"));
    const trader = await signupAndLogin("1Step Winner", 7);
    await purchaseAndCompleteOrder({
      adminToken,
      email: trader.email,
      name: "1Step Winner",
      productType: PRODUCT_TYPES.ONE_STEP,
      accountSize: 100000,
    });

    const challengeAcct = (
      await apiCall("GET", "/me/accounts", { token: trader.token })
    ).data.accounts[0];

    // Day 1: realize +₹10,500 (> 10% target) with only 1 trading day
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: challengeAcct.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 50,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 1210;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: challengeAcct.id,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 50,
        type: "MARKET",
      },
    });
    const day1 = await apiCall(
      "GET",
      `/me/trading-state?account_id=${challengeAcct.id}`,
      {
        token: trader.token,
      },
    );
    expect(day1.data.activeAccount.balance).toBe(110500);
    expect(day1.data.activeAccount.trading_days_done).toBe(1);
    expect(day1.data.activeAccount.status).toBe("Active");

    // Day 2: execute 1 small trade (+₹50) => 2 trading days -> STILL Active
    vi.setSystemTime(new Date("2026-11-11T06:00:00Z"));
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: challengeAcct.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 5,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 1010;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: challengeAcct.id,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 5,
        type: "MARKET",
      },
    });
    const day2 = await apiCall(
      "GET",
      `/me/trading-state?account_id=${challengeAcct.id}`,
      {
        token: trader.token,
      },
    );
    expect(day2.data.activeAccount.trading_days_done).toBe(2);
    expect(day2.data.activeAccount.status).toBe("Active");

    // Day 3: execute 1 trade => 3 distinct IST trading days + >=10% profit => Auto PASS & Auto Funded!
    vi.setSystemTime(new Date("2026-11-12T06:00:00Z"));
    quotePrices.RELIANCE = 1000;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: challengeAcct.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 5,
        type: "MARKET",
      },
    });
    quotePrices.RELIANCE = 1010;
    await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: challengeAcct.id,
        symbol: "RELIANCE",
        side: "SELL",
        qty: 5,
        type: "MARKET",
      },
    });

    const acctsRes = await apiCall("GET", "/me/accounts", {
      token: trader.token,
    });
    const passedChallenge = acctsRes.data.accounts.find(
      (a: { id: string }) => a.id === challengeAcct.id,
    );
    const fundedChild = acctsRes.data.accounts.find(
      (a: { parent_account_id?: string }) =>
        a.parent_account_id === challengeAcct.id,
    );

    expect(passedChallenge.status).toBe("Passed");
    expect(passedChallenge.funded_eligible).toBe(true);
    expect(passedChallenge.trading_days_done).toBe(3);

    expect(fundedChild).toBeTruthy();
    expect(fundedChild.product_type).toBe(PRODUCT_TYPES.ONE_STEP_FUNDED);
    expect(fundedChild.status).toBe("Funded");
    expect(fundedChild.account_number).toMatch(/^IF-1F-/);
    expect(fundedChild.starting_capital).toBe(100000);
    expect(fundedChild.trading_enabled).toBe(true);

    // Notification recorded
    const notifs = await apiCall("GET", "/me/notifications", {
      token: trader.token,
    });
    expect(
      notifs.data.some((n: { title: string }) =>
        n.title.includes("1-Step Challenge Passed"),
      ),
    ).toBe(true);

    // Trading blocked on the Passed challenge account, permitted on the new Funded account
    const blockedPassed = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: passedChallenge.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 1,
        type: "MARKET",
      },
    });
    expect(blockedPassed.status).toBe(403);
    expect(blockedPassed.data.code).toBe("CHALLENGE_PASSED");

    const allowedFunded = await apiCall("POST", "/me/orders", {
      token: trader.token,
      body: {
        account_id: fundedChild.id,
        symbol: "RELIANCE",
        side: "BUY",
        qty: 2,
        type: "MARKET",
      },
    });
    expect(allowedFunded.status).toBe(200);
  });

  it("8. Updating Classic evaluation_risk settings leaves Instant Funding & 1-Step accounts completely untouched", async () => {
    const classicTrader = await signupAndLogin("Classic Holder", 8);
    await purchaseAndCompleteOrder({
      adminToken,
      email: classicTrader.email,
      name: "Classic Holder",
      planId: "plan-starter",
    });

    const instantTrader = await signupAndLogin("Instant Unaffected", 9);
    await purchaseAndCompleteOrder({
      adminToken,
      email: instantTrader.email,
      name: "Instant Unaffected",
      productType: PRODUCT_TYPES.INSTANT,
      accountSize: 50000,
      drawdownMode: "intraday",
      payoutCycle: "biweekly",
    });

    // Admin modifies Classic global evaluation_risk
    const putSettings = await apiCall("PUT", "/settings", {
      token: adminToken,
      body: {
        evaluation_risk: {
          profit_target_pct: 12,
          max_loss_limit: 18,
          daily_loss_limit_pct: 4,
          min_trading_days: 7,
          total_trading_days: 20,
          trades_per_day: 4,
          profit_accuracy_pct: 70,
          profit_split: 75,
        },
      },
    });
    expect(putSettings.status).toBe(200);

    const classicAcct = (
      await apiCall("GET", "/me/accounts", { token: classicTrader.token })
    ).data.accounts[0];
    expect(classicAcct.product_type).toBe(PRODUCT_TYPES.CLASSIC);
    expect(classicAcct.profit_target_pct).toBe(12);
    expect(classicAcct.max_loss_limit).toBe(18);
    expect(classicAcct.daily_loss_limit_pct).toBe(4);
    expect(classicAcct.profit_split).toBe(75);

    const instantAcct = (
      await apiCall("GET", "/me/accounts", { token: instantTrader.token })
    ).data.accounts[0];
    expect(instantAcct.product_type).toBe(PRODUCT_TYPES.INSTANT);
    expect(instantAcct.daily_loss_limit_pct).toBe(3);
    expect(instantAcct.trailing_drawdown_pct).toBe(5);
    expect(instantAcct.profit_split).toBe(80);
    expect(instantAcct.profit_target_pct).toBe(0);
  });
});
