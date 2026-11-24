import { render, screen, waitFor } from "@testing-library/react";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import React from "react";

const mocks = vi.hoisted(() => ({
  authState: {
    user: null as null | {
      id: string;
      email: string;
      role: string;
      name?: string;
    },
    loading: false,
    logout: vi.fn(),
  },
  location: { pathname: "/admin/users", search: "?tab=accounts" },
  traderState: {
    authenticated: true,
    loading: false,
    accounts: [] as Array<Record<string, unknown>>,
    activeAccount: null as null | Record<string, unknown>,
    hasActiveAccount: false,
    hasPurchasedChallenge: false,
    evaluationRisk: {},
    orders: [],
    positions: [],
    trades: [],
    submitting: false,
    selectAccount: vi.fn(),
    placeOrder: vi.fn(),
    closePosition: vi.fn(),
    updateNote: vi.fn(),
  },
}));

type MockLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "children"
> & {
  to?: string;
  children?:
    React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode);
  end?: boolean;
};

vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...rest }: MockLinkProps) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {typeof children === "function"
        ? children({ isActive: false })
        : children}
    </a>
  ),
  NavLink: ({ to, children, end: _end, ...rest }: MockLinkProps) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {typeof children === "function"
        ? children({ isActive: false })
        : children}
    </a>
  ),
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="mock-navigate" data-to={to} />
  ),
  Outlet: () => <div data-testid="mock-outlet">Protected Content</div>,
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useParams: () => ({}),
  useLocation: () => mocks.location,
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mocks.authState,
}));

vi.mock("@/lib/useTraderState", () => ({
  useTraderState: () => mocks.traderState,
}));

vi.mock("@/lib/useLiveMarket", () => ({
  DEFAULT_MARKET_SYMBOLS: ["NIFTY", "BANKNIFTY"],
  EXCHANGE_INDEX_SYMBOLS: ["NIFTY", "BANKNIFTY"],
  useLiveMarketQuotes: () => ({
    quotes: [
      {
        symbol: "NIFTY",
        ltp: 24500,
        changePct: 0.42,
        exchange: "NSE",
        lot: 75,
      },
    ],
    quoteMap: {
      NIFTY: {
        symbol: "NIFTY",
        ltp: 24500,
        changePct: 0.42,
        exchange: "NSE",
        lot: 75,
      },
    },
    marketStatus: "CLOSED",
    flashMap: {},
    loading: false,
    refresh: vi.fn(),
  }),
  useLiveCandles: () => ({
    candles: [
      {
        time: 1731650000,
        open: 24400,
        high: 24520,
        low: 24380,
        close: 24500,
        volume: 1200,
      },
    ],
    quote: {
      symbol: "NIFTY",
      ltp: 24500,
      changePct: 0.42,
      exchange: "NSE",
      lot: 75,
    },
    loading: false,
    refreshing: false,
  }),
  searchMarketSymbols: vi.fn(async () => []),
  formatPrice: (n: number) => String(n ?? 0),
}));

vi.mock("@/components/CandleChart", () => ({
  CandleChart: () => <div data-testid="mock-candle-chart" />,
}));

vi.mock("@/components/Showcase3D", () => ({
  default: () => null,
}));

vi.mock("@/components/BrandLogo", () => ({
  default: () => <span>IndiFunded</span>,
}));

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
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, data: json };
}

describe("API Security, Real-Time Sync, Admin Account Control & Terminal Lock", () => {
  const origAdminEmail = process.env["ADMIN_EMAIL"];
  const origAdminPw = process.env["ADMIN_PASSWORD"];
  let adminToken = "";
  let traderToken = "";
  let traderId = "";

  beforeAll(async () => {
    process.env["ADMIN_EMAIL"] = "admin@indifunded.com";
    process.env["ADMIN_PASSWORD"] = "TestAdminPass!2026";

    const admRes = await apiCall("POST", "/auth/admin-login", {
      body: { email: "admin@indifunded.com", password: "TestAdminPass!2026" },
    });
    expect(admRes.status).toBe(200);
    adminToken = String(admRes.data.token || "");
    expect(adminToken.startsWith("ifa.")).toBe(true);

    const email = `trader_${Date.now()}@example.com`;
    const reg = await apiCall("POST", "/auth/signup", {
      body: {
        name: "Arjun Patel",
        email,
        password: "Password@123",
        phone: "9876543210",
      },
    });
    expect(reg.status).toBe(200);
    traderId = String(reg.data.id || "");

    const login = await apiCall("POST", "/auth/local-login", {
      body: { email, password: "Password@123" },
    });
    expect(login.status).toBe(200);
    traderToken = String(login.data.token || "");
    expect(traderToken.startsWith("ift.")).toBe(true);
  });

  afterAll(() => {
    if (origAdminEmail === undefined) delete process.env["ADMIN_EMAIL"];
    else process.env["ADMIN_EMAIL"] = origAdminEmail;
    if (origAdminPw === undefined) delete process.env["ADMIN_PASSWORD"];
    else process.env["ADMIN_PASSWORD"] = origAdminPw;
  });

  it("rejects unauthenticated and non-admin requests with 401/403 and sets no-store headers", async () => {
    const unauthAdmin = await apiCall("GET", "/admin/users");
    expect(unauthAdmin.status).toBe(401);
    expect(unauthAdmin.headers.get("cache-control")).toContain("no-store");

    const unauthAccts = await apiCall("GET", "/admin/accounts");
    expect(unauthAccts.status).toBe(401);

    const unauthTrading = await apiCall("GET", "/me/trading-state");
    expect(unauthTrading.status).toBe(401);

    const traderForbiddenUsers = await apiCall("GET", "/admin/users", {
      token: traderToken,
    });
    expect(traderForbiddenUsers.status).toBe(403);

    const traderForbiddenAccts = await apiCall("GET", "/admin/accounts", {
      token: traderToken,
    });
    expect(traderForbiddenAccts.status).toBe(403);
  });

  it("hides unpublished draft blogs from non-admins with 404 while allowing admin access", async () => {
    const slug = `internal-draft-${Date.now()}`;
    const createRes = await apiCall("POST", "/blogs", {
      token: adminToken,
      body: {
        title: "Internal Draft Post",
        slug,
        excerpt: "Secret draft",
        content: "Unpublished content",
        published: false,
      },
    });
    expect(createRes.status).toBe(200);

    const publicGet = await apiCall("GET", `/blogs/${slug}`);
    expect(publicGet.status).toBe(404);

    const traderGet = await apiCall("GET", `/blogs/${slug}`, {
      token: traderToken,
    });
    expect(traderGet.status).toBe(404);

    const adminGet = await apiCall("GET", `/blogs/${slug}`, {
      token: adminToken,
    });
    expect(adminGet.status).toBe(200);
    expect(adminGet.data.slug).toBe(slug);
  });

  it("increments /sync/version on admin settings edits and streams SSE init event", async () => {
    const v1 = await apiCall("GET", "/sync/version");
    expect(v1.status).toBe(200);
    expect(v1.headers.get("cache-control")).toContain("no-store");
    const initialVer = Number(v1.data.version);

    const newAnnouncement = `Live Sync Notice ${Date.now()}`;
    const putRes = await apiCall("PUT", "/settings", {
      token: adminToken,
      body: { announcement: { enabled: true, text: newAnnouncement } },
    });
    expect(putRes.status).toBe(200);

    const v2 = await apiCall("GET", "/sync/version");
    expect(Number(v2.data.version)).toBeGreaterThan(initialVer);

    const publicSettings = await apiCall("GET", "/settings");
    expect(publicSettings.data.announcement?.text).toBe(newAnnouncement);

    const { handleApi } = await import("@/server/api-handler");
    const ctrl = new AbortController();
    const sseRes = await handleApi(
      new Request("http://localhost:3000/api/sync/stream", {
        signal: ctrl.signal,
      }),
      "sync/stream",
    );
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("content-type")).toContain("text/event-stream");
    const reader = sseRes.body?.getReader();
    const firstChunk = reader ? await reader.read() : null;
    const text = firstChunk?.value
      ? new TextDecoder().decode(firstChunk.value)
      : "";
    expect(text).toContain("event: sync");
    await reader?.cancel();
    ctrl.abort();
  });

  it("tracks DB-verified has_purchased_challenge & full Admin trader account controls", async () => {
    // 1. Before purchase/allocation: has_purchased_challenge is false
    const beforeState = await apiCall("GET", "/me/trading-state", {
      token: traderToken,
    });
    expect(beforeState.status).toBe(200);
    expect(beforeState.data.has_purchased_challenge).toBe(false);

    const beforeDash = await apiCall("GET", "/me/dashboard", {
      token: traderToken,
    });
    expect(beforeDash.status).toBe(200);
    expect(beforeDash.data.has_purchased_challenge).toBe(false);

    // 2. Admin provisions a Challenge account for the trader
    const createAcct = await apiCall(
      "POST",
      `/admin/users/${traderId}/accounts`,
      {
        token: adminToken,
        body: {
          account_type: "Challenge",
          plan_name: "Pro",
          starting_capital: 300000,
          profit_split: 70,
          max_loss_limit: 20,
          daily_loss_limit_pct: 5,
        },
      },
    );
    expect(createAcct.status).toBe(200);
    const acctId = String(createAcct.data.account?.id || "");
    expect(acctId).toBeTruthy();

    // 3. Now DB verification confirms has_purchased_challenge === true
    const afterState = await apiCall("GET", "/me/trading-state", {
      token: traderToken,
    });
    expect(afterState.status).toBe(200);
    expect(afterState.data.has_purchased_challenge).toBe(true);

    // 4. Admin lists all accounts & edits balance/risk directly
    const allAccts = await apiCall("GET", "/admin/accounts", {
      token: adminToken,
    });
    expect(allAccts.status).toBe(200);
    const list = allAccts.data as Array<{ id?: string; user_name?: string }>;
    expect(
      list.some((a) => a.id === acctId && a.user_name === "Arjun Patel"),
    ).toBe(true);

    const patchAcct = await apiCall("PATCH", `/admin/accounts/${acctId}`, {
      token: adminToken,
      body: { balance: 345000, status: "Funded", daily_loss_limit_pct: 6 },
    });
    expect(patchAcct.status).toBe(200);
    expect(patchAcct.data.balance).toBe(345000);
    expect(patchAcct.data.status).toBe("Funded");

    // 5. Admin verifies KYC & inspects full ledger
    const kycRes = await apiCall("PATCH", `/admin/users/${traderId}/kyc`, {
      token: adminToken,
      body: { status: "verified", admin_note: "PAN matched" },
    });
    expect(kycRes.status).toBe(200);
    expect(kycRes.data.kyc?.status).toBe("verified");

    const ledgerRes = await apiCall("GET", `/admin/users/${traderId}/ledger`, {
      token: adminToken,
    });
    expect(ledgerRes.status).toBe(200);
    expect(Array.isArray(ledgerRes.data.accounts)).toBe(true);
    expect(Array.isArray(ledgerRes.data.transactions)).toBe(true);
    expect(ledgerRes.data.transactions.length).toBeGreaterThanOrEqual(2);

    // 6. Admin resets account back to starting capital
    const resetRes = await apiCall("POST", `/admin/accounts/${acctId}/reset`, {
      token: adminToken,
    });
    expect(resetRes.status).toBe(200);
    expect(resetRes.data.account?.balance).toBe(300000);
  });

  it("returns instant market candles and quotes with no-store headers", async () => {
    const candles = await apiCall("GET", "/market/candles?symbol=NIFTY&tf=5m");
    expect(candles.status).toBe(200);
    expect(candles.headers.get("cache-control")).toContain("no-store");
    expect(candles.data.candles.length).toBeGreaterThan(0);

    const quotes = await apiCall(
      "GET",
      "/market/quotes?symbols=NIFTY,BANKNIFTY",
    );
    expect(quotes.status).toBe(200);
    expect(quotes.data.quotes.length).toBe(2);
  });
});

describe("Frontend Route Guards & TradingTerminal Search Unlock", () => {
  beforeEach(() => {
    mocks.authState.user = null;
    mocks.authState.loading = false;
    mocks.location = { pathname: "/admin/users", search: "" };
    mocks.traderState.hasPurchasedChallenge = false;
    mocks.traderState.hasActiveAccount = false;
    mocks.traderState.activeAccount = null;
  });

  it("blocks unauthenticated and trader users from /admin via AdminLayout", async () => {
    const { default: AdminLayout } = await import("@/views/admin/AdminLayout");

    // Unauthenticated -> /login?next=...
    const { unmount } = render(<AdminLayout />);
    let nav = screen.getByTestId("mock-navigate");
    expect(nav.getAttribute("data-to")).toBe("/login?next=%2Fadmin%2Fusers");
    unmount();

    // Non-admin trader -> /app
    mocks.authState.user = { id: "u1", email: "t@example.com", role: "user" };
    render(<AdminLayout />);
    nav = screen.getByTestId("mock-navigate");
    expect(nav.getAttribute("data-to")).toBe("/app");
    expect(screen.queryByTestId("mock-outlet")).not.toBeInTheDocument();
  });

  it("blocks unauthenticated and admin users from /app via UserDashboardLayout", async () => {
    const { default: UserDashboardLayout } =
      await import("@/views/app/UserDashboardLayout");
    mocks.location = { pathname: "/app/terminal", search: "" };

    // Unauthenticated -> /login?next=...
    const { unmount } = render(<UserDashboardLayout />);
    let nav = screen.getByTestId("mock-navigate");
    expect(nav.getAttribute("data-to")).toBe("/login?next=%2Fapp%2Fterminal");
    unmount();

    // Admin -> /admin
    mocks.authState.user = {
      id: "adm",
      email: "admin@indifunded.com",
      role: "admin",
    };
    render(<UserDashboardLayout />);
    nav = screen.getByTestId("mock-navigate");
    expect(nav.getAttribute("data-to")).toBe("/admin");
    expect(screen.queryByTestId("mock-outlet")).not.toBeInTheDocument();
  });

  it("renders disabled search with 'Purchase a challenge to unlock' tooltip until purchased, then unlocks", async () => {
    const { TradingTerminal } = await import("@/views/app/TraderScreens");
    mocks.traderState.hasPurchasedChallenge = false;
    const { rerender } = render(<TradingTerminal embedded />);

    const lockedInput = screen.getByTestId("terminal-search-input");
    expect(lockedInput).toBeDisabled();
    expect(lockedInput).toHaveAttribute(
      "title",
      "Purchase a challenge to unlock",
    );
    expect(screen.getByTestId("terminal-search-wrapper")).toHaveAttribute(
      "title",
      "Purchase a challenge to unlock",
    );
    expect(screen.getByTestId("terminal-search-lock-overlay")).toHaveAttribute(
      "aria-label",
      "Purchase a challenge to unlock",
    );

    mocks.traderState.hasPurchasedChallenge = true;
    mocks.traderState.hasActiveAccount = true;
    mocks.traderState.activeAccount = {
      id: "acct-1",
      account_number: "IF-CH-1001",
      plan_name: "Pro",
      status: "Active",
      starting_capital: 300000,
      balance: 300000,
      realized_pnl: 0,
    };
    rerender(<TradingTerminal embedded />);

    await waitFor(() => {
      expect(screen.getByTestId("terminal-search-input")).not.toBeDisabled();
    });
    expect(
      screen.queryByTestId("terminal-search-lock-overlay"),
    ).not.toBeInTheDocument();
  });
});
