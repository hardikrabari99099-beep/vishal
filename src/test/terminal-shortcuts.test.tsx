import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";

const mocks = vi.hoisted(() => ({
  authState: {
    user: {
      id: "u1",
      email: "trader@example.com",
      role: "user",
      name: "Test Trader",
    },
    loading: false,
    logout: vi.fn(),
  },
  location: { pathname: "/app/terminal", search: "" },
  traderState: {
    authenticated: true,
    loading: false,
    accounts: [
      {
        id: "acct-1",
        account_number: "IF-CH-1001",
        plan_name: "Pro",
        status: "Active",
        starting_capital: 300000,
        balance: 300000,
        realized_pnl: 0,
      },
    ],
    activeAccount: {
      id: "acct-1",
      account_number: "IF-CH-1001",
      plan_name: "Pro",
      status: "Active",
      starting_capital: 300000,
      balance: 300000,
      realized_pnl: 0,
    } as Record<string, unknown> | null,
    hasActiveAccount: true,
    hasPurchasedChallenge: true,
    evaluationRisk: {},
    orders: [],
    positions: [],
    trades: [],
    submitting: false,
    selectAccount: vi.fn(),
    placeOrder: vi.fn(),
    closePosition: vi.fn(),
    closeAllPositions: vi.fn(),
    cancelOrder: vi.fn(),
    updateNote: vi.fn(),
    refresh: vi.fn(),
  },
}));

type MockLinkProps = Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "children"
> & {
  to?: string;
  children?:
    React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode);
};

vi.mock("@/lib/router-compat", () => ({
  Link: ({ to, children, ...rest }: MockLinkProps) => (
    <a href={typeof to === "string" ? to : "#"} {...rest}>
      {typeof children === "function"
        ? children({ isActive: false })
        : children}
    </a>
  ),
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
        kind: "INDEX",
        lot: 75,
      },
    ],
    quoteMap: {
      NIFTY: {
        symbol: "NIFTY",
        ltp: 24500,
        changePct: 0.42,
        exchange: "NSE",
        kind: "INDEX",
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
      kind: "INDEX",
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

vi.mock("@/components/BrandLogo", () => ({
  default: () => <span>IndiFunded</span>,
}));

function ShortcutHarness({
  onBuy,
  onSell,
  onEsc,
}: {
  onBuy: () => void;
  onSell: () => void;
  onEsc: () => void;
}) {
  useKeyboardShortcuts({
    b: onBuy,
    s: onSell,
    Escape: onEsc,
  });

  return (
    <div>
      <input data-testid="shortcut-input" />
      <textarea data-testid="shortcut-textarea" />
    </div>
  );
}

describe("useKeyboardShortcuts hook & TradingTerminal keyboard shortcuts", () => {
  beforeEach(() => {
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
  });

  it("handles B, S, and Esc globally while ignoring letter shortcuts in form fields and modified chords", () => {
    const onBuy = vi.fn();
    const onSell = vi.fn();
    const onEsc = vi.fn();
    render(<ShortcutHarness onBuy={onBuy} onSell={onSell} onEsc={onEsc} />);

    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "S" });
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onSell).toHaveBeenCalledTimes(1);

    // Modified chords (Ctrl+B, Meta+S, Alt+B) must not fire
    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    fireEvent.keyDown(window, { key: "b", altKey: true });
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onSell).toHaveBeenCalledTimes(1);

    // Typing B / S in inputs or textareas must not fire shortcuts
    const input = screen.getByTestId("shortcut-input");
    const textarea = screen.getByTestId("shortcut-textarea");
    fireEvent.keyDown(input, { key: "b" });
    fireEvent.keyDown(textarea, { key: "s" });
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onSell).toHaveBeenCalledTimes(1);

    // Escape still dispatches even when focus is inside an input so modals close cleanly
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onEsc).toHaveBeenCalledTimes(1);
  });

  it("switches BUY/SELL side with B and S in embedded TradingTerminal while respecting input focus", async () => {
    const { TradingTerminal } = await import("@/views/app/TraderScreens");
    render(<TradingTerminal embedded />);

    const buyBtn = screen.getByTestId("terminal-side-buy");
    const sellBtn = screen.getByTestId("terminal-side-sell");
    expect(buyBtn.className).toContain("is-buy");

    fireEvent.keyDown(window, { key: "s" });
    expect(sellBtn.className).toContain("is-sell");

    // Typing 'b' inside search input must not toggle side back to BUY
    const searchInput = screen.getByTestId("terminal-search-input");
    fireEvent.keyDown(searchInput, { key: "b" });
    expect(sellBtn.className).toContain("is-sell");

    fireEvent.keyDown(window, { key: "B" });
    expect(buyBtn.className).toContain("is-buy");
  });

  it("opens Buy/Sell Order Ticket on B/S in standalone TradingTerminal and closes modal on Esc", async () => {
    const { TradingTerminal } = await import("@/views/app/TraderScreens");
    render(<TradingTerminal />);

    expect(screen.queryByText("Place Order")).not.toBeInTheDocument();

    // Press 'b' -> opens Place Order modal set to BUY
    fireEvent.keyDown(window, { key: "b" });
    await waitFor(() => {
      expect(screen.getByText("Place Order")).toBeInTheDocument();
    });
    expect(screen.getByTestId("terminal-side-buy").className).toContain(
      "is-buy",
    );

    // Press 's' while ticket modal is open -> flips ticket to SELL
    fireEvent.keyDown(window, { key: "s" });
    expect(screen.getByTestId("terminal-side-sell").className).toContain(
      "is-sell",
    );

    // Press 'Escape' -> closes Place Order modal
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Place Order")).not.toBeInTheDocument();
    });

    // Press 's' when modal is closed -> opens Place Order modal set to SELL
    fireEvent.keyDown(window, { key: "s" });
    await waitFor(() => {
      expect(screen.getByText("Place Order")).toBeInTheDocument();
    });
    expect(screen.getByTestId("terminal-side-sell").className).toContain(
      "is-sell",
    );
  });

  it("opens and closes the buy dialog without an account", async () => {
    mocks.traderState.hasActiveAccount = false;
    mocks.traderState.hasPurchasedChallenge = false;
    mocks.traderState.activeAccount = null;
    const { TradingTerminal } = await import("@/views/app/TraderScreens");
    render(<TradingTerminal />);

    fireEvent.click(screen.getByTestId("terminal-chart-buy-btn"));
    expect(
      await screen.findByTestId("purchase-first-dialog"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    await waitFor(() =>
      expect(
        screen.queryByTestId("purchase-first-dialog"),
      ).not.toBeInTheDocument(),
    );
  });

  it("opens the NIFTY buy ticket for an active account", async () => {
    const { TradingTerminal } = await import("@/views/app/TraderScreens");
    render(<TradingTerminal />);
    fireEvent.click(screen.getByTestId("terminal-chart-buy-btn"));
    expect(await screen.findByText("Place Order")).toBeInTheDocument();
  });
});
