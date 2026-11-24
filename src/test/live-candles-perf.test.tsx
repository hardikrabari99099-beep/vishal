import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { api } from "@/lib/api";
import { useLiveCandles } from "@/lib/useLiveMarket";
import ScrollProgress from "@/components/ScrollProgress";

function CandlesProbe({ symbol, tf }: { symbol: string; tf: string }) {
  const { candles, loading } = useLiveCandles(symbol, tf, {
    pollMs: 0,
    enabled: true,
  });
  return (
    <div data-testid="candles-probe">
      {loading ? "loading" : candles.length}
    </div>
  );
}

describe("Performance & Hang Prevention Guards", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("caps baseline candle retries at 2 backoff attempts instead of infinite 650ms polling", async () => {
    vi.useFakeTimers();
    const sym = `BASELOOP_${Date.now()}`;
    const getSpy = vi
      .spyOn(api, "get")
      .mockImplementation(async (url: string) => {
        if (url === "/market/candles") {
          return {
            data: {
              isBaseline: true,
              marketStatus: "CLOSED",
              candles: [
                {
                  time: 1731650000,
                  open: 100,
                  high: 102,
                  low: 99,
                  close: 101,
                  volume: 500,
                },
              ],
              quote: { symbol: sym, ltp: 101, prevClose: 100, changePct: 1 },
            },
          } as never;
        }
        return { data: {} } as never;
      });

    render(<CandlesProbe symbol={sym} tf="5m" />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const candleCallsBefore = getSpy.mock.calls.filter(
      ([u]) => u === "/market/candles",
    ).length;
    expect(candleCallsBefore).toBe(1);

    // Advance well past initial 900ms + second 2500ms retry + prefetch 1200ms (e.g. 20s)
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        vi.advanceTimersByTime(4000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    const callsForTestSymbol = getSpy.mock.calls.filter(
      ([u, cfg]) =>
        u === "/market/candles" &&
        (cfg as { params?: { symbol?: string } })?.params?.symbol === sym,
    );
    // Initial call + at most 2 bounded baseline retries (plus at most 1 prefetch on 15m) — never an infinite loop
    expect(callsForTestSymbol.length).toBeLessThanOrEqual(4);
  });

  it("updates ScrollProgress via GPU transform scaleX without state re-renders", () => {
    render(<ScrollProgress />);
    const container = screen.getByTestId("scroll-progress");
    const bar = container.firstElementChild as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.willChange).toBe("transform");

    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    };
    try {
      Object.defineProperty(document.documentElement, "scrollHeight", {
        configurable: true,
        value: 2000,
      });
      Object.defineProperty(document.documentElement, "clientHeight", {
        configurable: true,
        value: 1000,
      });
      Object.defineProperty(document.documentElement, "scrollTop", {
        configurable: true,
        value: 500,
      });

      fireEvent.scroll(window);
      expect(bar.style.transform).toBe("scaleX(0.5)");
    } finally {
      window.requestAnimationFrame = origRaf;
    }
  });
});
