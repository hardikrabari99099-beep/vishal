import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MARKET_INSTRUMENTS,
  cleanIntradayFlatBars,
  computeOptionPremium,
  firstAvailableChart,
  getIndianMarketStatus,
  getQuotes,
  parseOptionSymbol,
  parseStockMarketIndiaQuote,
  resolveInstrument,
  searchSymbols,
} from "@/server/market-data";

afterEach(() => vi.unstubAllGlobals());

describe("market price integrity", () => {
  it("parses stock-market-india quote values without treating missing prices as real", () => {
    expect(
      parseStockMarketIndiaQuote({
        lastPrice: "1,234.50",
        previousClose: "1,200.00",
        dayHigh: "1,240",
      }),
    ).toMatchObject({
      ltp: 1234.5,
      prevClose: 1200,
      high: 1240,
      source: "NSE",
    });
    expect(parseStockMarketIndiaQuote({ lastPrice: "-" })).toBeNull();
  });

  it("uses the stock-market-india equity endpoint when other sources fail", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("ajaxGetQuoteJSON.jsp") && url.includes("LEGACYTEST")) {
        return new Response(
          JSON.stringify({
            data: [{ lastPrice: "1,234.50", previousClose: "1,200" }],
          }),
          { status: 200 },
        );
      }
      return new Response("", { status: 503 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await getQuotes(["LEGACYTEST"]);
    expect(result.quotes[0]).toMatchObject({
      symbol: "LEGACYTEST",
      ltp: 1234.5,
      source: "NSE",
    });
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes("ajaxGetQuoteJSON.jsp"),
      ),
    ).toBe(true);
  });

  it("uses the first successful chart provider without waiting for a slow one", async () => {
    const slow = new Promise<string | null>(() => {});
    await expect(
      firstAvailableChart([slow, Promise.resolve("available")]),
    ).resolves.toBe("available");
    await expect(
      firstAvailableChart([Promise.resolve(null), Promise.resolve("backup")]),
    ).resolves.toBe("backup");
    await expect(
      firstAvailableChart([
        Promise.resolve(null),
        Promise.reject(new Error("offline")),
      ]),
    ).resolves.toBeNull();
  });

  it("does not invent prices when providers are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("provider unavailable")),
    );
    const result = await getQuotes(["UNAVAILABLETEST", "NIFTY25500CE"]);
    expect(result.quotes).toEqual([]);
  });
});

describe("market data symbol resolver", () => {
  it("resolves core NSE and BSE indices cleanly", () => {
    expect(resolveInstrument("NIFTY").providerSymbol).toBe("^NSEI");
    expect(resolveInstrument("BANKNIFTY").providerSymbol).toBe("^NSEBANK");
    expect(resolveInstrument("FINNIFTY").nseSymbol).toBe("NIFTY FIN SERVICE");
    expect(resolveInstrument("MIDCPNIFTY").providerSymbol).toBe("^NSEMDCP50");
    expect(resolveInstrument("NIFTYNEXT50").nseSymbol).toBe("NIFTY NEXT 50");
    expect(resolveInstrument("INDIAVIX").providerSymbol).toBe("^INDIAVIX");
    const sensex = resolveInstrument("SENSEX");
    expect(sensex.providerSymbol).toBe("^BSESN");
    expect(sensex.exchange).toBe("BSE");
    const bankex = resolveInstrument("BANKEX");
    expect(bankex.exchange).toBe("BSE");
    expect(bankex.kind).toBe("INDEX");
  });

  it("handles .NS, .BO, aliases, and Option symbols cleanly", () => {
    const tcsBse = resolveInstrument("TCS.BO");
    expect(tcsBse.exchange).toBe("BSE");
    expect(tcsBse.providerSymbol).toBe("TCS.BO");

    const wipro = resolveInstrument("wipro.ns");
    expect(wipro.symbol).toBe("WIPRO");
    expect(wipro.providerSymbol).toBe("WIPRO.NS");
    expect(wipro.exchange).toBe("NSE");

    const zomato = resolveInstrument("ZOMATO");
    expect(zomato.symbol).toBe("ETERNAL");
    expect(zomato.exchange).toBe("NSE");

    const niftyCe = parseOptionSymbol("NIFTY 25500 CE");
    expect(niftyCe?.symbol).toBe("NIFTY25500CE");
    expect(niftyCe?.kind).toBe("OPTION");
    expect(niftyCe?.lot).toBe(75);
    expect(niftyCe?.optionType).toBe("CE");

    const sensexPe = resolveInstrument("SENSEX82600PE");
    expect(sensexPe.kind).toBe("OPTION");
    expect(sensexPe.exchange).toBe("BSE");
    expect(sensexPe.lot).toBe(20);
    expect(sensexPe.strike).toBe(82600);
  });

  it("computes realistic spot-linked Call and Put premiums", () => {
    const ceItm = computeOptionPremium(25500, 25300, "CE", 14.5, 4);
    const ceOtm = computeOptionPremium(25500, 25800, "CE", 14.5, 4);
    expect(ceItm).toBeGreaterThan(200);
    expect(ceItm).toBeGreaterThan(ceOtm);

    const peItm = computeOptionPremium(25500, 25800, "PE", 14.5, 4);
    const peOtm = computeOptionPremium(25500, 25200, "PE", 14.5, 4);
    expect(peItm).toBeGreaterThan(250);
    expect(peItm).toBeGreaterThan(peOtm);
  });

  it("returns Options and Shares when searching CE/PE or stock names", async () => {
    const ceRes = await searchSymbols("NIFTY 25500 CE");
    expect(
      ceRes.some((i) => i.kind === "OPTION" && i.symbol === "NIFTY25500CE"),
    ).toBe(true);

    const peOnly = await searchSymbols("PE");
    expect(peOnly.length).toBeGreaterThan(0);
    expect(
      peOnly.every((i) => i.kind === "OPTION" && i.optionType === "PE"),
    ).toBe(true);

    const halRes = await searchSymbols("HAL");
    expect(halRes.some((i) => i.symbol === "HAL" && i.kind === "EQUITY")).toBe(
      true,
    );
  });

  it("includes both NSE and BSE instruments in defaults", () => {
    expect(MARKET_INSTRUMENTS.some((i) => i.exchange === "NSE")).toBe(true);
    expect(MARKET_INSTRUMENTS.some((i) => i.exchange === "BSE")).toBe(true);
  });
});

describe("Indian market session status", () => {
  it("marks weekday IST 10:30 as LIVE", () => {
    // 2026-11-16 is a Monday. 10:30 IST = 05:00 UTC
    const monMorning = new Date("2026-11-16T05:00:00Z");
    expect(getIndianMarketStatus(monMorning)).toBe("LIVE");
  });

  it("marks weekday IST 16:00 and weekends as CLOSED", () => {
    // Monday 16:00 IST = 10:30 UTC
    const monEvening = new Date("2026-11-16T10:30:00Z");
    expect(getIndianMarketStatus(monEvening)).toBe("CLOSED");

    // Saturday 11:00 IST = 05:30 UTC
    const sat = new Date("2026-11-14T05:30:00Z");
    expect(getIndianMarketStatus(sat)).toBe("CLOSED");
  });

  it("marks NSE/BSE exchange holidays during market hours as CLOSED", () => {
    // 2026-11-24 is Tuesday (Guru Nanak Jayanti). 10:30 IST = 05:00 UTC
    expect(getIndianMarketStatus(new Date("2026-11-24T05:00:00Z"))).toBe(
      "CLOSED",
    );
    // 2026-12-25 is Christmas. 11:00 IST = 05:30 UTC
    expect(getIndianMarketStatus(new Date("2026-12-25T05:30:00Z"))).toBe(
      "CLOSED",
    );
  });
});

describe("fast candle loading", () => {
  it("returns candles within cold budget and instantaneously on warm repeat", async () => {
    const { getCandles } = await import("@/server/market-data");
    const t0 = Date.now();
    const first = await getCandles("NIFTY", "5m");
    const coldMs = Date.now() - t0;
    expect(first.candles.length).toBeGreaterThanOrEqual(200);
    expect(coldMs).toBeLessThan(600);
    const oldest = first.candles.at(0);
    const newest = first.candles.at(-1);
    expect(oldest).toBeTruthy();
    expect(newest).toBeTruthy();
    if (oldest && newest) {
      expect(oldest.time).toBeLessThan(newest.time);
      expect(newest.time - oldest.time).toBeGreaterThan(86400);
    }

    const t1 = Date.now();
    const second = await getCandles("NIFTY", "5m");
    const warmMs = Date.now() - t1;
    expect(second.candles.length).toBeGreaterThanOrEqual(200);
    expect(warmMs).toBeLessThan(30);
  });
});

describe("intraday flat settlement bar cleanup and symbol aliases", () => {
  it("strips consecutive zero-volume flat settlement bars after 15:15 IST without touching real intraday or 1D bars", () => {
    const baseTs = Math.floor(Date.parse("2026-11-23T09:40:00Z") / 1000); // 15:10 IST
    const realBars = Array.from({ length: 30 }, (_, idx) => {
      const t = baseTs - (29 - idx) * 60;
      const open = +(25300 + idx * 1.5).toFixed(2);
      const close = +(open + (idx % 2 === 0 ? 4 : -2)).toFixed(2);
      return {
        i: idx,
        time: t,
        label: `bar-${idx}`,
        open,
        high: +(Math.max(open, close) + 2).toFixed(2),
        low: +(Math.min(open, close) - 2).toFixed(2),
        close,
        volume: 0,
      };
    });
    const lastClose = realBars[realBars.length - 1]!.close;
    const flatTail = Array.from({ length: 16 }, (_, idx) => ({
      i: 30 + idx,
      time: baseTs + (idx + 1) * 60, // 15:11..15:26 IST
      label: `flat-${idx}`,
      open: lastClose,
      high: lastClose,
      low: lastClose,
      close: lastClose,
      volume: 0,
    }));

    const cleaned = cleanIntradayFlatBars([...realBars, ...flatTail], "1m");
    expect(cleaned).toHaveLength(30);
    expect(cleaned.at(-1)?.close).toBe(lastClose);
    expect(cleaned.at(-1)?.open).not.toBe(cleaned.at(-1)?.close);

    // 1D bars are returned untouched
    expect(
      cleanIntradayFlatBars([...realBars, ...flatTail], "1D"),
    ).toHaveLength(46);
  });

  it("connects closing VWAP adjustment print (>=15:15 IST) from previous real close", () => {
    const t1514 = Math.floor(Date.parse("2026-11-23T09:44:00Z") / 1000);
    const t1515 = Math.floor(Date.parse("2026-11-23T09:45:00Z") / 1000);
    const t1529 = Math.floor(Date.parse("2026-11-23T09:59:00Z") / 1000);
    const realBars = Array.from({ length: 24 }, (_, idx) => ({
      i: idx,
      time: t1514 - (23 - idx) * 60,
      label: `b-${idx}`,
      open: 1345 + idx * 0.2,
      high: 1347 + idx * 0.2,
      low: 1344 + idx * 0.2,
      close: 1346 + idx * 0.2,
      volume: 1000,
    }));
    const prevClose = realBars[realBars.length - 1]!.close;
    const bars = [
      ...realBars,
      {
        i: 24,
        time: t1515,
        label: "15:15",
        open: prevClose,
        high: prevClose,
        low: prevClose,
        close: prevClose,
        volume: 0,
      },
      {
        i: 25,
        time: t1529,
        label: "15:29",
        open: 1353.5,
        high: 1353.5,
        low: 1353.5,
        close: 1353.5,
        volume: 0,
      },
    ];
    const cleaned = cleanIntradayFlatBars(bars, "1m");
    expect(cleaned).toHaveLength(25);
    expect(cleaned.at(-1)).toMatchObject({
      time: t1529,
      open: prevClose,
      low: prevClose,
      high: 1353.5,
      close: 1353.5,
    });
  });

  it("resolves TATAMOTORS and TMPV cleanly to active TMPV NSE/BSE feeds", () => {
    expect(resolveInstrument("TATAMOTORS")).toMatchObject({
      symbol: "TATAMOTORS",
      providerSymbol: "TMPV.NS",
      nseSymbol: "TMPV",
    });
    expect(resolveInstrument("TMPV")).toMatchObject({
      symbol: "TATAMOTORS",
      providerSymbol: "TMPV.NS",
    });
    expect(resolveInstrument("TATAMOTORS.BO")).toMatchObject({
      symbol: "TATAMOTORS.BO",
      providerSymbol: "TMPV.BO",
      exchange: "BSE",
    });
  });
});
