import { describe, expect, it } from "vitest";
import { applyLiveQuoteToCandle } from "../lib/chart-live-quote";

describe("chart price synchronization", () => {
  const now = Date.parse("2026-11-23T04:32:00Z");
  const candle = {
    time: Date.parse("2026-11-23T04:30:00Z") / 1000,
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 30,
  };
  const quote = {
    ltp: 103,
    updatedAt: new Date(now).toISOString(),
    source: "NSE",
    marketStatus: "LIVE",
  };

  it("updates only the active candle and preserves its open and volume", () => {
    expect(applyLiveQuoteToCandle(candle, quote, "5m", now)).toEqual({
      ...candle,
      high: 103,
      close: 103,
    });
    expect(candle.close).toBe(101);
    expect(
      applyLiveQuoteToCandle(candle, { ...quote, ltp: 98 }, "5m", now)?.low,
    ).toBe(98);
  });

  it("rejects simulated, cached, closed, stale, out-of-period and implausible prices", () => {
    for (const invalid of [
      { ...quote, tickLive: true },
      { ...quote, candle },
      { ...quote, source: "Cache" },
      { ...quote, source: "Option-Chain" },
      { ...quote, marketStatus: "CLOSED" },
      { ...quote, updatedAt: new Date(now - 180000).toISOString() },
      { ...quote, updatedAt: new Date(now + 240000).toISOString() },
      { ...quote, ltp: 70 },
    ])
      expect(applyLiveQuoteToCandle(candle, invalid, "5m", now)).toBeNull();
    expect(applyLiveQuoteToCandle(candle, quote, "1m", now)).toBeNull();
  });
});
