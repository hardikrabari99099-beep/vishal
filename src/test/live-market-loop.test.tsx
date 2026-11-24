import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLiveMarketQuotes } from "@/lib/useLiveMarket";

function UnstableSymbolsConsumer({ onRender }: { onRender: () => void }) {
  onRender();
  const [tick, setTick] = useState(0);
  // Intentionally pass a fresh array literal on every render (like Terminal/Positions)
  const { quotes, loading } = useLiveMarketQuotes(["NIFTY", "BANKNIFTY"], {
    pollMs: 0,
    enabled: true,
  });
  return (
    <div data-testid="quotes-count" onClick={() => setTick((t) => t + 1)}>
      {loading ? "loading" : quotes.length}:{tick}
    </div>
  );
}

describe("useLiveMarketQuotes render stability", () => {
  it("does not exceed maximum update depth when caller passes a fresh array every render", async () => {
    const spy = vi.spyOn(api, "get").mockResolvedValue({
      data: {
        marketStatus: "CLOSED",
        fetchedAt: "2026-11-18T00:00:00Z",
        quotes: [
          {
            symbol: "NIFTY",
            ltp: 25450,
            changePct: 0.4,
            exchange: "NSE",
            kind: "INDEX",
          },
          {
            symbol: "BANKNIFTY",
            ltp: 62350,
            changePct: -0.2,
            exchange: "NSE",
            kind: "INDEX",
          },
        ],
      },
    } as never);

    let renders = 0;
    const { getByTestId } = render(
      <UnstableSymbolsConsumer onRender={() => renders++} />,
    );

    await waitFor(() => {
      expect(getByTestId("quotes-count").textContent).toBe("2:0");
    });

    // Re-render again with a new array reference; cached quotes must not loop
    getByTestId("quotes-count").click();
    await waitFor(() => {
      expect(getByTestId("quotes-count").textContent).toBe("2:1");
    });

    expect(renders).toBeLessThan(10);
    spy.mockRestore();
  });

  it("clears pending symbols when a quote is missing so microTick never spins indefinitely", async () => {
    vi.useFakeTimers();
    const { act } = await import("@testing-library/react");
    const spy = vi.spyOn(api, "get").mockResolvedValue({
      data: {
        marketStatus: "LIVE",
        fetchedAt: "2026-11-24T05:00:00Z",
        quotes: [
          {
            symbol: "NIFTY",
            ltp: 25450,
            prevClose: 25400,
            changePct: 0.2,
            exchange: "NSE",
            kind: "INDEX",
          },
        ],
      },
    } as never);

    let latestTickLive = false;
    function PartialProbe() {
      const { quotes } = useLiveMarketQuotes(["NIFTY", "MISSING_SYM"], {
        pollMs: 0,
        microTick: true,
        enabled: true,
      });
      latestTickLive = Boolean(quotes.some((q) => q.tickLive));
      return <div data-testid="partial-count">{quotes.length}</div>;
    }

    render(<PartialProbe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(latestTickLive).toBe(false);

    spy.mockRestore();
    vi.useRealTimers();
  });

  it("retries quickly after an empty CLOSED quote response instead of stalling for 60s", async () => {
    vi.useFakeTimers();
    const { act } = await import("@testing-library/react");
    let call = 0;
    const spy = vi.spyOn(api, "get").mockImplementation(async () => {
      call++;
      if (call === 1) {
        return { data: { marketStatus: "CLOSED", quotes: [] } } as never;
      }
      return {
        data: {
          marketStatus: "CLOSED",
          fetchedAt: "2026-11-24T05:00:00Z",
          quotes: [
            {
              symbol: "RETRYTEST",
              ltp: 1500,
              prevClose: 1490,
              changePct: 0.67,
              exchange: "NSE",
              kind: "EQUITY",
            },
          ],
        },
      } as never;
    });

    function RetryProbe() {
      const { quotes } = useLiveMarketQuotes(["RETRYTEST"], {
        pollMs: 5000,
        enabled: true,
      });
      return <div data-testid="retry-ltp">{quotes[0]?.ltp ?? "none"}</div>;
    }

    const { getByTestId } = render(<RetryProbe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getByTestId("retry-ltp").textContent).toBe("none");

    await act(async () => {
      vi.advanceTimersByTime(1600);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getByTestId("retry-ltp").textContent).toBe("1500");

    spy.mockRestore();
    vi.useRealTimers();
  });

  it("freezes quotes and flashes when market is CLOSED even if sessionStorage had stale LIVE status", async () => {
    vi.useFakeTimers();
    const { act } = await import("@testing-library/react");
    window.sessionStorage.setItem(
      "if_mkt_cache_v3",
      JSON.stringify({
        marketStatus: "LIVE",
        quotes: {
          FREEZE_SYM: {
            quote: {
              symbol: "FREEZE_SYM",
              ltp: 19900,
              prevClose: 19850,
              changePct: 0.25,
              exchange: "NSE",
              kind: "INDEX",
              tickLive: true,
            },
            ts: Date.now(),
          },
        },
      }),
    );

    const spy = vi.spyOn(api, "get").mockResolvedValue({
      data: {
        marketStatus: "CLOSED",
        fetchedAt: "2026-11-24T10:30:00Z",
        quotes: [
          {
            symbol: "FREEZE_SYM",
            ltp: 19900,
            prevClose: 19850,
            changePct: 0.25,
            exchange: "NSE",
            kind: "INDEX",
          },
        ],
      },
    } as never);

    let snapshot: {
      ltp?: number;
      status?: string;
      tickLive?: boolean;
      flashes?: Record<string, string>;
    } = {};
    function ClosedFreezeProbe() {
      const { quotes, marketStatus, flashMap } = useLiveMarketQuotes(
        ["FREEZE_SYM"],
        {
          pollMs: 5000,
          microTick: true,
          enabled: true,
        },
      );
      snapshot = {
        ltp: quotes[0]?.ltp,
        status: marketStatus,
        tickLive: quotes[0]?.tickLive,
        flashes: flashMap,
      };
      return <div data-testid="freeze-ltp">{quotes[0]?.ltp ?? ""}</div>;
    }

    render(<ClosedFreezeProbe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(snapshot.status).toBe("CLOSED");
    expect(snapshot.ltp).toBe(19900);
    expect(snapshot.tickLive).toBe(false);
    expect(snapshot.flashes).toEqual({});

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(snapshot.ltp).toBe(19900);
    expect(snapshot.tickLive).toBe(false);
    expect(snapshot.flashes).toEqual({});

    window.sessionStorage.clear();
    spy.mockRestore();
    vi.useRealTimers();
  });

  it("restores exact authoritative candle close when market transitions from LIVE to CLOSED", async () => {
    vi.useFakeTimers();
    const { act } = await import("@testing-library/react");
    const { useLiveCandles } = await import("@/lib/useLiveMarket");
    const { publishWidgetsConfig } = await import("@/lib/live-feed-config");

    publishWidgetsConfig({
      chart_feed: {
        enabled: true,
        tick_interval_ms: 150,
        fallback_last3_digits: true,
        reconcile_on_api: true,
      },
    });

    let currentStatus: "LIVE" | "CLOSED" = "LIVE";
    const spy = vi.spyOn(api, "get").mockImplementation(
      async () =>
        ({
          data: {
            marketStatus: currentStatus,
            symbol: "CLOSE_SNAP_SYM",
            tf: "5m",
            quote: {
              symbol: "CLOSE_SNAP_SYM",
              ltp: 24100.5,
              prevClose: 24000,
              high: 24120,
              low: 23980,
              changePct: 0.42,
              exchange: "NSE",
              kind: "INDEX",
            },
            candles: [
              {
                i: 0,
                time: 1731650000,
                open: 24090,
                high: 24110,
                low: 24080,
                close: 24100.5,
                volume: 1000,
              },
            ],
          },
        }) as never,
    );

    const holder: {
      current: {
        candles: Array<{ close: number }>;
        quote: { ltp: number } | null;
        marketStatus: string;
        refresh: () => Promise<void>;
      } | null;
    } = { current: null };

    function CandleProbe() {
      holder.current = useLiveCandles("CLOSE_SNAP_SYM", "5m", {
        pollMs: 10000,
        microTick: true,
      });
      return (
        <div data-testid="candle-close">{holder.current.quote?.ltp ?? ""}</div>
      );
    }

    render(<CandleProbe />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(holder.current?.marketStatus).toBe("LIVE");

    // Advance micro-ticks during LIVE session
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // Transition to CLOSED -> must snap back cleanly to authoritative 24100.5
    currentStatus = "CLOSED";
    await act(async () => {
      await holder.current?.refresh();
    });
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(holder.current?.marketStatus).toBe("CLOSED");
    expect(holder.current?.quote?.ltp).toBe(24100.5);
    expect(holder.current?.candles.at(-1)?.close).toBe(24100.5);

    spy.mockRestore();
    vi.useRealTimers();
  });
});
