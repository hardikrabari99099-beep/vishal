import { describe, expect, it } from "vitest";
import { evaluation, ACCOUNT, makeCandles, TRADES } from "@/lib/demo-trading";

describe("evaluation progress maths", () => {
  it("computes target progress and remaining allowances", () => {
    const e = evaluation({
      ...ACCOUNT,
      starting_capital: 500000,
      balance: 520000,
      profit_target: 40000,
      daily_loss_limit: 15000,
      daily_loss_used: 3000,
      overall_loss_limit: 50000,
      max_drawdown_used: 10000,
      min_trading_days: 10,
      trading_days_done: 6,
    });
    expect(e.progress).toBe(50);
    expect(e.remaining_target).toBe(20000);
    expect(e.daily_loss_left).toBe(12000);
    expect(e.overall_loss_left).toBe(40000);
    expect(e.remaining_days).toBe(4);
  });
  it("never shows progress above 100% or below 0%", () => {
    expect(evaluation({ ...ACCOUNT, balance: 600000 }).progress).toBe(100);
    expect(evaluation({ ...ACCOUNT, balance: 400000 }).progress).toBe(0);
  });
});

describe("sample trades", () => {
  it("calculates P&L by side", () => {
    const sell = TRADES.find((t) => t.id === "T-90108")!;
    expect(sell.pnl).toBeCloseTo((52260 - 52198.5) * 30);
  });
  it("candles are stable for the same instrument and timeframe", () => {
    expect(makeCandles("NIFTY", "5m", 5)).toEqual(
      makeCandles("NIFTY", "5m", 5),
    );
  });
});
