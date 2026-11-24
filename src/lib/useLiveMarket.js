import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { markLiveTickActivity } from "./dom-locks";
import { getChartFeedConfig, subscribeWidgetsConfig } from "./live-feed-config";

export const EXCHANGE_INDEX_SYMBOLS = [
  "NIFTY",
  "BANKNIFTY",
  "SENSEX",
  "FINNIFTY",
  "MIDCPNIFTY",
  "BANKEX",
  "NIFTYNEXT50",
  "INDIAVIX",
];

export const DEFAULT_OPTION_SYMBOLS = [
  "NIFTY25450CE",
  "NIFTY25450PE",
  "BANKNIFTY62400CE",
  "BANKNIFTY62400PE",
  "SENSEX82600CE",
  "SENSEX82600PE",
];

export const DEFAULT_MARKET_SYMBOLS = [
  "NIFTY",
  "BANKNIFTY",
  "SENSEX",
  "FINNIFTY",
  "MIDCPNIFTY",
  "BANKEX",
  "NIFTYNEXT50",
  "INDIAVIX",
  ...DEFAULT_OPTION_SYMBOLS,
  "RELIANCE",
  "HDFCBANK",
  "TCS",
  "INFY",
  "ICICIBANK",
  "SBIN",
  "TATAMOTORS",
  "ITC",
  "BHARTIARTL",
  "AXISBANK",
  "KOTAKBANK",
  "LT",
  "BAJFINANCE",
  "ADANIENT",
  "HAL",
  "BEL",
  "ETERNAL",
  "RELIANCE.BO",
  "TCS.BO",
  "HDFCBANK.BO",
  "INFY.BO",
  "SBIN.BO",
];

// Shared client-side market caches so route switches & multi-widget views render immediately without flicker.
const quoteMemCache = new Map(); // symbol -> { quote, ts }
const candleMemCache = new Map(); // `${symbol}:${tf}` -> { candles, quote, marketStatus, ts }
const inflightQuoteCalls = new Map(); // symbolKey -> Promise
const inflightCandleCalls = new Map(); // `${symbol}:${tf}` -> Promise
const baselineUpgradeAttempts = new Map(); // `${symbol}:${tf}` -> number of retries performed
// Shared micro-tick offset state keyed by symbol so quotes & candles stay aligned and snap cleanly on API arrival
const microTickState = new Map(); // symbol -> { baseLtp, offset, seq }
// Lightweight pub/sub for in-place chart & readout updates without cloning large bar/quote arrays into React state
const tickSubscribers = new Map(); // UPPER_SYMBOL | "*" -> Set<(payload) => void>
const latestTickSnapshots = new Map(); // UPPER_SYMBOL -> payload
let lastMarketStatus = "CLOSED";

export function subscribeLiveTick(symbol, listener) {
  if (typeof listener !== "function") return () => {};
  const key = symbol ? String(symbol).toUpperCase() : "*";
  let set = tickSubscribers.get(key);
  if (!set) {
    set = new Set();
    tickSubscribers.set(key, set);
  }
  set.add(listener);
  return () => {
    const cur = tickSubscribers.get(key);
    if (cur) {
      cur.delete(listener);
      if (cur.size === 0) tickSubscribers.delete(key);
    }
  };
}

export function emitLiveTick(symbol, payload) {
  if (!symbol || !payload) return;
  const key = String(symbol).toUpperCase();
  latestTickSnapshots.set(key, payload);
  markLiveTickActivity();
  const listeners = tickSubscribers.get(key);
  if (listeners && listeners.size > 0) {
    listeners.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        // isolate subscriber errors
      }
    });
  }
  const wildcard = tickSubscribers.get("*");
  if (wildcard && wildcard.size > 0) {
    wildcard.forEach((fn) => {
      try {
        fn(payload);
      } catch {
        // isolate subscriber errors
      }
    });
  }
}

export function getLatestLiveQuote(symbol) {
  if (!symbol) return null;
  const key = String(symbol).toUpperCase();
  return latestTickSnapshots.get(key) || quoteMemCache.get(key)?.quote || null;
}

/**
 * Generates a realistic NSE/BSE trailing-3-digit micro-tick around an authoritative base price.
 * Strictly modifies only the trailing 3 digits (quantized to tick size) and mean-reverts around basePrice.
 */
export function computeLast3DigitTick(basePrice, prevOffset = 0, stepSeq = 0) {
  const base = Number(basePrice);
  if (!Number.isFinite(base) || base <= 0) {
    return { price: basePrice || 0, offset: 0 };
  }
  const abs = Math.abs(base);
  const tickSize = abs >= 100 ? 0.05 : 0.01;
  // Trailing 3 digits scale (e.g., 25450.35 -> last 3 digits oscillate within +-4.95 without shifting higher digits unpredictably)
  const maxAmp =
    abs >= 10000
      ? 4.95
      : abs >= 1000
        ? 2.45
        : abs >= 100
          ? 0.95
          : abs >= 10
            ? 0.35
            : 0.12;
  const maxTicks = Math.max(1, Math.round(maxAmp / tickSize));

  // Deterministic+jittered step: biases back toward 0 when far from basePrice so prices stay tightly anchored
  const rand = Math.random();
  const pullBias =
    prevOffset > maxAmp * 0.55
      ? 0.65
      : prevOffset < -maxAmp * 0.55
        ? 0.35
        : 0.5;
  const dir = rand < pullBias ? -1 : 1;
  const magTicks =
    1 + ((stepSeq + Math.floor(rand * 7)) % Math.min(4, maxTicks));
  const rawNext = prevOffset + dir * magTicks * tickSize - prevOffset * 0.08;
  const clamped = Math.max(-maxAmp, Math.min(maxAmp, rawNext));
  const snappedOffset = +(Math.round(clamped / tickSize) * tickSize).toFixed(2);
  const finalPrice = +Math.max(tickSize, base + snappedOffset).toFixed(2);
  return { price: finalPrice, offset: +(finalPrice - base).toFixed(2) };
}

function recordAuthoritativeBase(symbol, quote, reconcile = true) {
  if (!symbol || !quote) return;
  const sym = String(symbol).toUpperCase();
  const ltp = Number(quote.ltp);
  if (!Number.isFinite(ltp) || ltp <= 0) return;
  const prev = microTickState.get(sym);
  if (!prev || reconcile) {
    // Reconcile immediately when fresh API data arrives so displayed price matches authoritative API feed
    microTickState.set(sym, {
      baseLtp: ltp,
      offset: 0,
      seq: (prev?.seq || 0) + 1,
    });
  } else {
    microTickState.set(sym, { ...prev, baseLtp: ltp });
  }
}

function advanceMicroTickForSymbol(symbol, baseLtp) {
  const sym = String(symbol).toUpperCase();
  const prev = microTickState.get(sym) || { baseLtp, offset: 0, seq: 0 };
  const anchor =
    Number.isFinite(Number(baseLtp)) && Number(baseLtp) > 0
      ? Number(baseLtp)
      : prev.baseLtp;
  const nextSeq = (prev.seq || 0) + 1;
  const { price, offset } = computeLast3DigitTick(anchor, prev.offset, nextSeq);
  microTickState.set(sym, { baseLtp: anchor, offset, seq: nextSeq });
  return price;
}

function useReactiveChartFeedConfig(overrideIntervalMs) {
  const [cfg, setCfg] = useState(() => getChartFeedConfig());
  useEffect(() => {
    setCfg(getChartFeedConfig());
    return subscribeWidgetsConfig(({ chart_feed }) => {
      if (chart_feed) setCfg(chart_feed);
    });
  }, []);
  return useMemo(() => {
    if (overrideIntervalMs == null) return cfg;
    const clamped = Math.max(
      50,
      Math.min(
        2000,
        Math.round(Number(overrideIntervalMs) || cfg.tick_interval_ms),
      ),
    );
    return { ...cfg, tick_interval_ms: clamped };
  }, [cfg, overrideIntervalMs]);
}

function quotesMatch(prevList, nextList) {
  if (!Array.isArray(prevList) || !Array.isArray(nextList)) return false;
  if (prevList.length !== nextList.length) return false;
  for (let i = 0; i < nextList.length; i++) {
    const a = prevList[i];
    const b = nextList[i];
    if (!a || !b) return false;
    if (
      a.symbol !== b.symbol ||
      a.ltp !== b.ltp ||
      a.changePct !== b.changePct ||
      a.source !== b.source ||
      a.tickLive !== b.tickLive ||
      a.updatedAt !== b.updatedAt ||
      a.high !== b.high ||
      a.low !== b.low
    ) {
      return false;
    }
  }
  return true;
}

function candlesMatch(prevList, nextList) {
  if (!Array.isArray(prevList) || !Array.isArray(nextList)) return false;
  if (prevList.length !== nextList.length) return false;
  if (nextList.length === 0) return true;
  const pFirst = prevList[0];
  const nFirst = nextList[0];
  const pLast = prevList[prevList.length - 1];
  const nLast = nextList[nextList.length - 1];
  return (
    pFirst?.time === nFirst?.time &&
    pLast?.time === nLast?.time &&
    pLast?.open === nLast?.open &&
    pLast?.high === nLast?.high &&
    pLast?.low === nLast?.low &&
    pLast?.close === nLast?.close
  );
}

const MKT_STORAGE_KEY = "if_mkt_cache_v3";
let persistTimer = null;
let sessionCacheHydrated = false;

function ensureSessionMarketCacheHydrated() {
  if (sessionCacheHydrated || typeof window === "undefined") return;
  sessionCacheHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(MKT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Always start safely as CLOSED until fresh server API confirmation arrives
    lastMarketStatus = "CLOSED";
    if (parsed?.quotes && typeof parsed.quotes === "object") {
      for (const [k, v] of Object.entries(parsed.quotes)) {
        if (v?.quote && !quoteMemCache.has(k)) {
          const cleanQuote = v.quote.tickLive
            ? { ...v.quote, tickLive: false }
            : v.quote;
          quoteMemCache.set(k, { ...v, quote: cleanQuote });
          recordAuthoritativeBase(k, cleanQuote, true);
        }
      }
    }
    if (parsed?.candles && typeof parsed.candles === "object") {
      for (const [k, v] of Object.entries(parsed.candles)) {
        if (Array.isArray(v?.candles) && !candleMemCache.has(k)) {
          const cleanQuote = v.quote?.tickLive
            ? { ...v.quote, tickLive: false }
            : v.quote || null;
          candleMemCache.set(k, {
            ...v,
            quote: cleanQuote,
            marketStatus: "CLOSED",
          });
        }
      }
    }
  } catch {
    // ignore storage parse errors
  }
}

function schedulePersistMarketCache() {
  if (typeof window === "undefined" || persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const quotes = {};
      let qCount = 0;
      for (const [k, v] of quoteMemCache.entries()) {
        quotes[k] = v;
        if (++qCount >= 40) break;
      }
      const candles = {};
      const entries = Array.from(candleMemCache.entries())
        .filter(([, v]) => !v?.isBaseline)
        .slice(-10);
      for (const [k, v] of entries) {
        candles[k] = {
          candles: Array.isArray(v.candles) ? v.candles.slice(-350) : [],
          quote: v.quote || null,
          marketStatus: v.marketStatus || lastMarketStatus,
          ts: v.ts,
        };
      }
      window.sessionStorage.setItem(
        MKT_STORAGE_KEY,
        JSON.stringify({ marketStatus: lastMarketStatus, quotes, candles }),
      );
    } catch {
      // ignore quota errors
    }
  }, 400);
}

function getCachedQuotesForList(symbolList) {
  const out = [];
  for (const s of symbolList) {
    const entry = quoteMemCache.get(s);
    if (entry?.quote) {
      out.push(
        entry.quote.tickLive
          ? { ...entry.quote, tickLive: false }
          : entry.quote,
      );
    }
  }
  return out;
}

export function formatPrice(n, digits = 2) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatRupeePrice(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return `₹${formatPrice(num, 2)}`;
}

export function useLiveMarketQuotes(
  symbols = DEFAULT_MARKET_SYMBOLS,
  options = {},
) {
  const {
    pollMs = 5000,
    enabled = true,
    microTick,
    tickIntervalMs,
    uiTickThrottleMs = 0,
  } = options;
  const chartFeedCfg = useReactiveChartFeedConfig(tickIntervalMs);
  const rawList = Array.isArray(symbols)
    ? symbols
        .map((s) =>
          String(s || "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean)
    : String(symbols || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
  const symbolKey = rawList.join(",");
  const symbolList = useMemo(
    () => (symbolKey ? symbolKey.split(",") : []),
    [symbolKey],
  );

  const [quotes, setQuotes] = useState([]);
  const [marketStatus, setMarketStatus] = useState("CLOSED");
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [flashMap, setFlashMap] = useState({});
  const prevLtpRef = useRef({});
  const authoritativeQuotesRef = useRef({});
  const pendingSymbolsRef = useRef(new Set());
  const currentSymbolKeyRef = useRef(symbolKey);
  currentSymbolKeyRef.current = symbolKey;
  const flashTimersRef = useRef({});
  const prevQuotesRef = useRef([]);
  const liveWorkingQuotesRef = useRef([]);
  const lastUiCommitRef = useRef(0);
  const fetchSeqRef = useRef(0);
  const quoteRetryTimerRef = useRef(null);
  const quoteRetryAttemptsRef = useRef(0);
  const aliveQuotesRef = useRef(true);
  const serverConfirmedStatusRef = useRef(null);

  const clearFlashes = useCallback(() => {
    const timers = flashTimersRef.current;
    for (const sym of Object.keys(timers)) {
      clearTimeout(timers[sym]);
      delete timers[sym];
    }
    setFlashMap((cur) => (Object.keys(cur).length ? {} : cur));
  }, []);

  const triggerFlashes = useCallback(
    (list, flashDurationMs = 700, allowFlash = true) => {
      if (!allowFlash) {
        for (const q of list) {
          if (q?.symbol) prevLtpRef.current[q.symbol] = q.ltp;
        }
        clearFlashes();
        return;
      }
      const nextFlashes = {};
      for (const q of list) {
        const prev = prevLtpRef.current[q.symbol];
        if (prev != null && q.ltp !== prev) {
          nextFlashes[q.symbol] = q.ltp > prev ? "up" : "down";
        }
        prevLtpRef.current[q.symbol] = q.ltp;
      }
      if (Object.keys(nextFlashes).length) {
        setFlashMap((cur) => ({ ...cur, ...nextFlashes }));
        for (const sym of Object.keys(nextFlashes)) {
          if (flashTimersRef.current[sym])
            clearTimeout(flashTimersRef.current[sym]);
          flashTimersRef.current[sym] = setTimeout(() => {
            setFlashMap((cur) => {
              if (!cur[sym]) return cur;
              const copy = { ...cur };
              delete copy[sym];
              return copy;
            });
          }, flashDurationMs);
        }
      }
    },
    [clearFlashes],
  );

  useEffect(() => {
    aliveQuotesRef.current = true;
    quoteRetryAttemptsRef.current = 0;
    if (quoteRetryTimerRef.current) {
      clearTimeout(quoteRetryTimerRef.current);
      quoteRetryTimerRef.current = null;
    }
    ensureSessionMarketCacheHydrated();
    const cached = getCachedQuotesForList(symbolList);
    if (cached.length) {
      for (const q of cached) {
        if (q?.symbol)
          authoritativeQuotesRef.current[q.symbol.toUpperCase()] = q;
      }
      prevQuotesRef.current = cached;
      liveWorkingQuotesRef.current = cached;
      setQuotes(cached);
      setMarketStatus(
        serverConfirmedStatusRef.current === "LIVE" ? "LIVE" : "CLOSED",
      );
      setLoading(false);
    }
    return () => {
      aliveQuotesRef.current = false;
      if (quoteRetryTimerRef.current) {
        clearTimeout(quoteRetryTimerRef.current);
        quoteRetryTimerRef.current = null;
      }
    };
  }, [symbolKey]);

  const fetchQuotes = useCallback(async () => {
    if (!enabled) return;
    const seq = ++fetchSeqRef.current;
    pendingSymbolsRef.current = new Set(symbolKey.split(",").filter(Boolean));
    try {
      let reqPromise = inflightQuoteCalls.get(symbolKey);
      if (!reqPromise) {
        const params = symbolKey ? { symbols: symbolKey } : {};
        reqPromise = api
          .get("/market/quotes", { params })
          .then((res) => res.data)
          .finally(() => {
            inflightQuoteCalls.delete(symbolKey);
          });
        inflightQuoteCalls.set(symbolKey, reqPromise);
      }
      const data = await reqPromise;
      const received = Array.isArray(data?.quotes) ? data.quotes : [];
      const now = Date.now();
      for (const q of received) {
        if (q?.symbol) {
          const sym = q.symbol.toUpperCase();
          quoteMemCache.set(sym, { quote: q, ts: now });
          recordAuthoritativeBase(sym, q, chartFeedCfg.reconcile_on_api);
        }
      }
      if (data?.marketStatus) lastMarketStatus = data.marketStatus;
      if (received.length) schedulePersistMarketCache();

      if (!aliveQuotesRef.current || currentSymbolKeyRef.current !== symbolKey)
        return;

      if (data?.marketStatus) {
        serverConfirmedStatusRef.current = data.marketStatus;
      }
      const resolvedStatus =
        data?.marketStatus || serverConfirmedStatusRef.current || "CLOSED";
      const isLiveStatus = resolvedStatus === "LIVE";

      for (const quote of received)
        pendingSymbolsRef.current.delete(
          String(quote.symbol || "").toUpperCase(),
        );
      for (const q of received) {
        if (q?.symbol) {
          const sym = q.symbol.toUpperCase();
          authoritativeQuotesRef.current[sym] = q;
          if (chartFeedCfg.reconcile_on_api || !isLiveStatus) {
            emitLiveTick(sym, { ...q, tickLive: false });
          }
        }
      }

      if (received.length > 0) {
        quoteRetryAttemptsRef.current = 0;
        if (quoteRetryTimerRef.current) {
          clearTimeout(quoteRetryTimerRef.current);
          quoteRetryTimerRef.current = null;
        }
      } else if (
        pollMs > 0 &&
        symbolKey &&
        quoteRetryAttemptsRef.current < 3 &&
        !quoteRetryTimerRef.current
      ) {
        const attempt = quoteRetryAttemptsRef.current++;
        quoteRetryTimerRef.current = setTimeout(
          () => {
            quoteRetryTimerRef.current = null;
            if (
              aliveQuotesRef.current &&
              currentSymbolKeyRef.current === symbolKey
            ) {
              fetchQuotes();
            }
          },
          1500 * Math.pow(2, attempt),
        );
      }

      const list = [
        ...received.map((quote) => ({ ...quote, tickLive: false })),
        ...prevQuotesRef.current.filter((quote) =>
          pendingSymbolsRef.current.has(
            String(quote.symbol || "").toUpperCase(),
          ),
        ),
      ];

      liveWorkingQuotesRef.current = list;
      lastUiCommitRef.current = Date.now();
      triggerFlashes(list, 700, isLiveStatus);
      if (!quotesMatch(prevQuotesRef.current, list)) {
        prevQuotesRef.current = list;
        setQuotes(list);
      }
      if (data?.marketStatus)
        setMarketStatus((cur) =>
          cur === data.marketStatus ? cur : data.marketStatus,
        );
      if (data?.fetchedAt) setFetchedAt(data.fetchedAt);
      setError(null);
    } catch (err) {
      if (aliveQuotesRef.current && currentSymbolKeyRef.current === symbolKey) {
        setError(err?.message || "Market feed unavailable");
        if (
          pollMs > 0 &&
          symbolKey &&
          quoteRetryAttemptsRef.current < 3 &&
          !quoteRetryTimerRef.current
        ) {
          const attempt = quoteRetryAttemptsRef.current++;
          quoteRetryTimerRef.current = setTimeout(
            () => {
              quoteRetryTimerRef.current = null;
              if (
                aliveQuotesRef.current &&
                currentSymbolKeyRef.current === symbolKey
              ) {
                fetchQuotes();
              }
            },
            1500 * Math.pow(2, attempt),
          );
        }
      }
    } finally {
      if (fetchSeqRef.current === seq) {
        pendingSymbolsRef.current.clear();
      }
      if (aliveQuotesRef.current && currentSymbolKeyRef.current === symbolKey) {
        setLoading(false);
      }
    }
  }, [
    symbolKey,
    enabled,
    pollMs,
    chartFeedCfg.reconcile_on_api,
    triggerFlashes,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const allFresh =
      symbolList.length > 0 &&
      symbolList.every((s) => {
        const entry = quoteMemCache.get(s);
        const freshWindow = lastMarketStatus === "LIVE" ? 2000 : 45000;
        return entry && Date.now() - entry.ts < freshWindow;
      });
    if (!serverConfirmedStatusRef.current || !allFresh) {
      fetchQuotes();
    }
    const effectivePollMs =
      !pollMs || pollMs < 1000
        ? 0
        : marketStatus === "LIVE"
          ? pollMs
          : Math.max(pollMs, 60000);
    if (!effectivePollMs) return;
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        fetchQuotes();
      }
    }, effectivePollMs);
    const onVisible = () => {
      if (!document.hidden) fetchQuotes();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearInterval(id);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [fetchQuotes, pollMs, enabled, marketStatus, symbolKey]);

  // High-frequency millisecond trailing-3-digit tick loop strictly active during server-confirmed live market hours
  useEffect(() => {
    const isMarketLive =
      marketStatus === "LIVE" && serverConfirmedStatusRef.current === "LIVE";
    const shouldTick =
      enabled &&
      isMarketLive &&
      microTick === true &&
      chartFeedCfg.enabled &&
      chartFeedCfg.fallback_last3_digits !== false;
    if (!shouldTick) {
      if (!isMarketLive) {
        clearFlashes();
        const curList = prevQuotesRef.current;
        if (Array.isArray(curList) && curList.length) {
          let changed = false;
          const pausedList = curList.map((q) => {
            if (!q?.symbol) return q;
            const sym = q.symbol.toUpperCase();
            const state = microTickState.get(sym);
            if (state && state.offset !== 0) {
              microTickState.set(sym, { ...state, offset: 0 });
            }
            const authQ = authoritativeQuotesRef.current[sym];
            if (authQ && (q.ltp !== authQ.ltp || q.tickLive)) {
              changed = true;
              const settledQ = { ...authQ, tickLive: false };
              emitLiveTick(sym, settledQ);
              return settledQ;
            }
            if (q.tickLive) {
              changed = true;
              const settledQ = { ...q, tickLive: false };
              emitLiveTick(sym, settledQ);
              return settledQ;
            }
            return q;
          });
          if (changed) {
            liveWorkingQuotesRef.current = pausedList;
            prevQuotesRef.current = pausedList;
            setQuotes(pausedList);
          }
        }
      }
      return;
    }

    const intervalMs = Math.max(
      50,
      Math.min(2000, Number(chartFeedCfg.tick_interval_ms) || 150),
    );
    const flashMs = Math.min(360, Math.max(120, Math.round(intervalMs * 1.8)));

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const curList =
        liveWorkingQuotesRef.current && liveWorkingQuotesRef.current.length
          ? liveWorkingQuotesRef.current
          : prevQuotesRef.current;
      if (!curList || !curList.length) return;
      if (!pendingSymbolsRef.current.size) return;

      let anyTicked = false;
      const nextList = curList.map((q) => {
        if (!q?.symbol) return q;
        const sym = q.symbol.toUpperCase();
        if (!pendingSymbolsRef.current.has(sym)) return q;
        const authQ = authoritativeQuotesRef.current[sym] || q;
        const baseLtp = Number(authQ.ltp);
        if (!Number.isFinite(baseLtp) || baseLtp <= 0) return q;

        anyTicked = true;
        const nextLtp = advanceMicroTickForSymbol(sym, baseLtp);
        const prevClose =
          Number(authQ.prevClose) || Number(q.prevClose) || baseLtp;
        const nextChange = +(nextLtp - prevClose).toFixed(2);
        const nextChangePct = prevClose
          ? +((nextChange / prevClose) * 100).toFixed(2)
          : 0;
        const tickedQ = {
          ...q,
          ltp: nextLtp,
          high: Math.max(Number(q.high) || nextLtp, nextLtp),
          low: Math.min(Number(q.low) || nextLtp, nextLtp),
          change: nextChange,
          changePct: nextChangePct,
          tickLive: true,
        };
        return tickedQ;
      });
      if (!anyTicked) return;

      liveWorkingQuotesRef.current = nextList;
      const now = Date.now();
      if (
        !uiTickThrottleMs ||
        now - lastUiCommitRef.current >= uiTickThrottleMs
      ) {
        lastUiCommitRef.current = now;
        triggerFlashes(nextList, flashMs);
        prevQuotesRef.current = nextList;
        setQuotes(nextList);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [
    enabled,
    microTick,
    pollMs,
    uiTickThrottleMs,
    chartFeedCfg.enabled,
    chartFeedCfg.tick_interval_ms,
    chartFeedCfg.fallback_last3_digits,
    marketStatus,
    triggerFlashes,
  ]);

  useEffect(() => {
    const timers = flashTimersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const quoteMap = useMemo(() => {
    const map = {};
    for (const q of quotes) map[q.symbol] = q;
    return map;
  }, [quotes]);

  return {
    quotes,
    quoteMap,
    marketStatus,
    fetchedAt,
    loading,
    error,
    flashMap,
    tickIntervalMs: chartFeedCfg.tick_interval_ms,
    refresh: fetchQuotes,
  };
}

const CLIENT_FALLBACK_SPOTS = {
  NIFTY: 25450,
  BANKNIFTY: 62350,
  SENSEX: 82600,
  FINNIFTY: 28280,
  MIDCPNIFTY: 17870,
  NIFTYNEXT50: 68500,
  BANKEX: 70170,
  INDIAVIX: 14.2,
  RELIANCE: 1345,
  HDFCBANK: 1750,
  TCS: 3800,
  INFY: 1850,
  ICICIBANK: 1300,
  SBIN: 810,
};

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getStepSeconds(tf) {
  return tf === "1m"
    ? 60
    : tf === "3m"
      ? 180
      : tf === "15m"
        ? 900
        : tf === "30m"
          ? 1800
          : tf === "1h"
            ? 3600
            : tf === "1D"
              ? 86400
              : 300;
}

function buildInstantClientCandles(symbol, tf) {
  const sym = String(symbol || "NIFTY").toUpperCase();
  const cachedQuote = quoteMemCache.get(sym)?.quote;
  const spot = Number(cachedQuote?.ltp) || CLIENT_FALLBACK_SPOTS[sym] || 1500;
  const prevClose =
    Number(cachedQuote?.prevClose) || +(spot * 0.996).toFixed(2);
  const count = 200;
  const stepSec = getStepSeconds(tf);
  const timestamps = [];
  if (tf === "1D") {
    let cursorSec = Math.floor(Date.now() / 86400000) * 86400 + 4 * 3600 + 1800;
    while (timestamps.length < count) {
      const istDay = new Date(cursorSec * 1000 + 5.5 * 3600 * 1000).getUTCDay();
      if (istDay !== 0 && istDay !== 6) timestamps.push(cursorSec);
      cursorSec -= 86400;
    }
    timestamps.reverse();
  } else {
    let cursorSec = Math.floor(Date.now() / (stepSec * 1000)) * stepSec;
    while (timestamps.length < count) {
      const dIst = new Date(cursorSec * 1000 + 5.5 * 3600 * 1000);
      const day = dIst.getUTCDay();
      const mins = dIst.getUTCHours() * 60 + dIst.getUTCMinutes();
      if (
        day !== 0 &&
        day !== 6 &&
        mins >= 9 * 60 + 15 &&
        mins <= 15 * 60 + 30
      ) {
        timestamps.push(cursorSec);
      }
      cursorSec -= stepSec;
    }
    timestamps.reverse();
  }

  const seed = hashStr(`${sym}:${tf}`);
  // Same realistic volatility as the server fallback, built backwards from spot
  const sigma = 0.008 * Math.sqrt(Math.min(1, stepSec / 22500));
  const n = timestamps.length;
  const opens = new Array(n);
  const closes = new Array(n);
  let next = spot;
  for (let i = n - 1; i >= 0; i--) {
    const wave =
      Math.sin((i + (seed % 13)) * 0.34) * 0.6 +
      Math.cos((i + seed) * 0.19) * 0.4;
    closes[i] = next;
    opens[i] = next / (1 + wave * sigma);
    next = opens[i];
  }
  const bars = [];
  for (let i = 0; i < n; i++) {
    const open = +opens[i].toFixed(2);
    const close = +closes[i].toFixed(2);
    const spread = Math.max(0.05, open * sigma * 0.5);
    bars.push({
      i,
      time: timestamps[i],
      open,
      high: +(Math.max(open, close) + spread * 0.6).toFixed(2),
      low: +(Math.min(open, close) - spread * 0.6).toFixed(2),
      close,
      volume: 12000 + ((seed + i * 7919) % 35000),
    });
  }
  return {
    candles: bars,
    quote: cachedQuote || {
      symbol: sym,
      ltp: spot,
      prevClose,
      change: +(spot - prevClose).toFixed(2),
      changePct: prevClose
        ? +(((spot - prevClose) / prevClose) * 100).toFixed(2)
        : 0,
      source: "Warm",
    },
  };
}

function prefetchCandleKey(symbol, tf) {
  if (!symbol || typeof window === "undefined") return;
  const sym = String(symbol).toUpperCase();
  const key = `${sym}:${tf}`;
  if (candleMemCache.has(key) || inflightCandleCalls.has(key)) return;
  const req = api
    .get("/market/candles", { params: { symbol: sym, tf } })
    .then((res) => {
      const data = res.data;
      const nextCandles = Array.isArray(data?.candles) ? data.candles : [];
      if (nextCandles.length || data?.quote) {
        candleMemCache.set(key, {
          candles: nextCandles,
          quote: data?.quote || null,
          marketStatus: data?.marketStatus || lastMarketStatus,
          isBaseline: Boolean(data?.isBaseline),
          ts: Date.now(),
        });
      }
      if (data?.quote?.symbol) {
        const s = data.quote.symbol.toUpperCase();
        quoteMemCache.set(s, { quote: data.quote, ts: Date.now() });
        recordAuthoritativeBase(s, data.quote, true);
      }
    })
    .catch(() => {})
    .finally(() => {
      inflightCandleCalls.delete(key);
    });
  inflightCandleCalls.set(key, req);
}

let prefetchedDefaults = false;

export function useLiveCandles(symbol, tf = "5m", options = {}) {
  const {
    pollMs = 5000,
    enabled = true,
    microTick,
    tickIntervalMs,
    inPlace = false,
  } = options;
  const chartFeedCfg = useReactiveChartFeedConfig(tickIntervalMs);
  const cacheKey = `${String(symbol || "").toUpperCase()}:${tf}`;

  const [candles, setCandles] = useState([]);
  const [quote, setQuote] = useState(null);
  const [marketStatus, setMarketStatus] = useState("CLOSED");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const prevCandlesRef = useRef([]);
  const liveLastBarRef = useRef(null);
  const authoritativeLastBarRef = useRef(null);
  const prevQuoteRef = useRef(null);
  const authoritativeQuoteRef = useRef(null);
  const authoritativeBaseRef = useRef(null);
  const serverConfirmedStatusRef = useRef(null);
  const baselineTimerRef = useRef(null);
  const aliveRef = useRef(true);
  const currentCacheKeyRef = useRef(cacheKey);
  currentCacheKeyRef.current = cacheKey;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (baselineTimerRef.current) {
        clearTimeout(baselineTimerRef.current);
        baselineTimerRef.current = null;
      }
    };
  }, [cacheKey]);

  useEffect(() => {
    ensureSessionMarketCacheHydrated();
    const entry = candleMemCache.get(cacheKey);
    if (entry?.candles?.length) {
      if (!candlesMatch(prevCandlesRef.current, entry.candles)) {
        prevCandlesRef.current = entry.candles;
        setCandles(entry.candles);
      }
      const lastBar = entry.candles[entry.candles.length - 1]
        ? { ...entry.candles[entry.candles.length - 1] }
        : null;
      authoritativeLastBarRef.current = lastBar ? { ...lastBar } : null;
      liveLastBarRef.current = lastBar;
      if (entry.quote) {
        const cleanQ = entry.quote.tickLive
          ? { ...entry.quote, tickLive: false }
          : entry.quote;
        authoritativeQuoteRef.current = cleanQ;
        prevQuoteRef.current = cleanQ;
        setQuote(cleanQ);
      }
      const baseFromEntry =
        entry.quote?.ltp ??
        entry.candles[entry.candles.length - 1]?.close ??
        null;
      if (baseFromEntry != null) {
        authoritativeBaseRef.current = Number(baseFromEntry);
        recordAuthoritativeBase(symbol, { ltp: baseFromEntry }, true);
      }
      setMarketStatus(
        serverConfirmedStatusRef.current === "LIVE" ? "LIVE" : "CLOSED",
      );
      setLoading(false);
    } else if (symbol) {
      // No synthetic placeholder chart: stay in loading state until real candles arrive
      authoritativeLastBarRef.current = null;
      liveLastBarRef.current = null;
      authoritativeQuoteRef.current = null;
      prevQuoteRef.current = null;
      prevCandlesRef.current = [];
      setCandles([]);
      setQuote(null);
      setMarketStatus(
        serverConfirmedStatusRef.current === "LIVE" ? "LIVE" : "CLOSED",
      );
      setLoading(true);
    } else {
      authoritativeLastBarRef.current = null;
      liveLastBarRef.current = null;
      authoritativeQuoteRef.current = null;
      prevQuoteRef.current = null;
      setCandles([]);
      setQuote(null);
      setMarketStatus(
        serverConfirmedStatusRef.current === "LIVE" ? "LIVE" : "CLOSED",
      );
      setLoading(false);
    }
  }, [cacheKey, symbol, tf]);

  const fetchCandles = useCallback(
    async (isBackground = false) => {
      if (!enabled || !symbol || !aliveRef.current) return;
      if (!isBackground && !candleMemCache.get(cacheKey)?.candles?.length) {
        setRefreshing(true);
      }
      try {
        let reqPromise = inflightCandleCalls.get(cacheKey);
        if (!reqPromise) {
          reqPromise = api
            .get("/market/candles", { params: { symbol, tf } })
            .then((res) => res.data)
            .finally(() => {
              inflightCandleCalls.delete(cacheKey);
            });
          inflightCandleCalls.set(cacheKey, reqPromise);
        }
        const data = await reqPromise;
        if (!aliveRef.current || currentCacheKeyRef.current !== cacheKey)
          return;
        const nextCandles = Array.isArray(data?.candles) ? data.candles : [];

        if (data?.marketStatus) {
          serverConfirmedStatusRef.current = data.marketStatus;
        }
        const isLiveStatus =
          (data?.marketStatus || serverConfirmedStatusRef.current) === "LIVE";

        // Authoritative API data received — reconcile/match immediately onto exact API values
        const apiLtp =
          data?.quote?.ltp ??
          (nextCandles.length
            ? nextCandles[nextCandles.length - 1]?.close
            : null);
        if (apiLtp != null && Number.isFinite(Number(apiLtp))) {
          authoritativeBaseRef.current = Number(apiLtp);
          recordAuthoritativeBase(
            symbol,
            { ltp: Number(apiLtp) },
            chartFeedCfg.reconcile_on_api,
          );
        }

        if (
          nextCandles.length &&
          !candlesMatch(prevCandlesRef.current, nextCandles)
        ) {
          prevCandlesRef.current = nextCandles;
          setCandles(nextCandles);
        }
        if (nextCandles.length) {
          const authBar = { ...nextCandles[nextCandles.length - 1] };
          authoritativeLastBarRef.current = { ...authBar };
          liveLastBarRef.current = authBar;
        }
        if (data?.quote) {
          const pq = prevQuoteRef.current;
          const nq = data.quote;
          authoritativeQuoteRef.current = nq;
          if (
            !pq ||
            pq.symbol !== nq.symbol ||
            pq.ltp !== nq.ltp ||
            pq.prevClose !== nq.prevClose ||
            pq.changePct !== nq.changePct ||
            pq.marketStatus !== nq.marketStatus
          ) {
            prevQuoteRef.current = nq;
            setQuote(nq);
          }
          if (nq.symbol) {
            quoteMemCache.set(nq.symbol.toUpperCase(), {
              quote: nq,
              ts: Date.now(),
            });
            if (chartFeedCfg.reconcile_on_api || !isLiveStatus) {
              emitLiveTick(nq.symbol, {
                ...nq,
                tf,
                candle:
                  authoritativeLastBarRef.current || liveLastBarRef.current,
                tickLive: false,
              });
            }
          }
        }
        if (data?.marketStatus) {
          lastMarketStatus = data.marketStatus;
          setMarketStatus((cur) =>
            cur === data.marketStatus ? cur : data.marketStatus,
          );
        }
        if (nextCandles.length || data?.quote) {
          const isBaseline = Boolean(data?.isBaseline);
          candleMemCache.set(cacheKey, {
            candles: nextCandles,
            quote: data?.quote || null,
            marketStatus: data?.marketStatus || lastMarketStatus,
            isBaseline,
            ts: Date.now(),
          });
          if (!isBaseline) {
            baselineUpgradeAttempts.delete(cacheKey);
            schedulePersistMarketCache();
          } else if (typeof window !== "undefined") {
            const attempts = baselineUpgradeAttempts.get(cacheKey) || 0;
            if (attempts < 2 && !baselineTimerRef.current) {
              baselineUpgradeAttempts.set(cacheKey, attempts + 1);
              const delayMs = attempts === 0 ? 700 : 2200;
              baselineTimerRef.current = setTimeout(() => {
                baselineTimerRef.current = null;
                if (aliveRef.current) fetchCandles(true);
              }, delayMs);
            }
          }
        }
        setError(null);
      } catch (err) {
        if (aliveRef.current && currentCacheKeyRef.current === cacheKey)
          setError(err?.message || "Chart feed unavailable");
      } finally {
        if (aliveRef.current && currentCacheKeyRef.current === cacheKey) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [symbol, tf, enabled, cacheKey, chartFeedCfg.reconcile_on_api],
  );

  useEffect(() => {
    if (!enabled || !symbol) return;
    const entry = candleMemCache.get(cacheKey);
    const freshWindow = lastMarketStatus === "LIVE" ? 5000 : 45000;
    const retriesUsed = baselineUpgradeAttempts.get(cacheKey) || 0;
    if (
      !serverConfirmedStatusRef.current ||
      !entry ||
      (entry.isBaseline && retriesUsed < 2) ||
      Date.now() - entry.ts >= freshWindow
    ) {
      fetchCandles(Boolean(entry));
    }

    // Quietly warm popular indices & adjacent timeframes quickly after initial paint
    const timerPrefetch = setTimeout(() => {
      if (!prefetchedDefaults) {
        prefetchedDefaults = true;
        for (const s of ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"]) {
          if (s !== String(symbol).toUpperCase()) prefetchCandleKey(s, "5m");
        }
      }
      if (tf !== "5m") prefetchCandleKey(symbol, "5m");
      if (tf !== "15m") prefetchCandleKey(symbol, "15m");
    }, 2000);

    const effectivePollMs =
      !pollMs || pollMs < 1000
        ? 0
        : marketStatus === "LIVE"
          ? pollMs
          : Math.max(pollMs, 60000);
    if (!effectivePollMs) {
      return () => clearTimeout(timerPrefetch);
    }
    const id = setInterval(() => {
      if (typeof document === "undefined" || !document.hidden) {
        fetchCandles(true);
      }
    }, effectivePollMs);
    const onVisible = () => {
      if (!document.hidden) fetchCandles(true);
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      clearTimeout(timerPrefetch);
      clearInterval(id);
      if (baselineTimerRef.current) {
        clearTimeout(baselineTimerRef.current);
        baselineTimerRef.current = null;
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [fetchCandles, pollMs, enabled, symbol, tf, marketStatus, cacheKey]);

  // Sub-second millisecond candle & price tick loop active strictly when NSE/BSE market is server-confirmed LIVE
  useEffect(() => {
    const isMarketLive =
      marketStatus === "LIVE" && serverConfirmedStatusRef.current === "LIVE";
    const shouldTick =
      enabled &&
      symbol &&
      isMarketLive &&
      microTick === true &&
      chartFeedCfg.enabled &&
      chartFeedCfg.fallback_last3_digits !== false;
    if (!shouldTick) {
      if (!isMarketLive && symbol) {
        const symUpper = String(symbol).toUpperCase();
        const state = microTickState.get(symUpper);
        if (state && state.offset !== 0) {
          microTickState.set(symUpper, { ...state, offset: 0 });
        }
        const authBar = authoritativeLastBarRef.current;
        if (authBar) {
          liveLastBarRef.current = { ...authBar };
          const curBars = prevCandlesRef.current;
          const tail = Array.isArray(curBars)
            ? curBars[curBars.length - 1]
            : null;
          if (
            !inPlace &&
            tail &&
            (tail.close !== authBar.close ||
              tail.high !== authBar.high ||
              tail.low !== authBar.low)
          ) {
            const restoredBars = [...curBars.slice(0, -1), { ...authBar }];
            prevCandlesRef.current = restoredBars;
            setCandles(restoredBars);
          }
        }
        const authQuote = authoritativeQuoteRef.current || prevQuoteRef.current;
        if (authQuote) {
          const settledQuote = { ...authQuote, tickLive: false };
          prevQuoteRef.current = settledQuote;
          setQuote((cur) =>
            cur &&
            cur.ltp === settledQuote.ltp &&
            cur.high === settledQuote.high &&
            cur.low === settledQuote.low &&
            !cur.tickLive
              ? cur
              : settledQuote,
          );
          emitLiveTick(symUpper, {
            ...settledQuote,
            tf,
            candle: liveLastBarRef.current,
            tickLive: false,
          });
        }
      }
      return;
    }

    const intervalMs = Math.max(
      50,
      Math.min(2000, Number(chartFeedCfg.tick_interval_ms) || 150),
    );
    const symUpper = String(symbol).toUpperCase();

    const id = setInterval(() => {
      if (!aliveRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      const curBars = prevCandlesRef.current;
      const lastBar =
        liveLastBarRef.current ||
        (Array.isArray(curBars) ? curBars[curBars.length - 1] : null);
      if (!lastBar) return;

      const baseAnchor =
        Number(authoritativeBaseRef.current) ||
        Number(prevQuoteRef.current?.ltp) ||
        Number(lastBar.close);
      if (!Number.isFinite(baseAnchor) || baseAnchor <= 0) return;

      const nextPrice = advanceMicroTickForSymbol(symUpper, baseAnchor);
      const updatedLast = {
        ...lastBar,
        high: Math.max(Number(lastBar.high) || nextPrice, nextPrice),
        low: Math.min(Number(lastBar.low) || nextPrice, nextPrice),
        close: nextPrice,
        volume: Number(lastBar.volume || 0) + ((Math.random() * 18) | 0),
      };
      liveLastBarRef.current = updatedLast;

      const curQuote = prevQuoteRef.current || {
        symbol: symUpper,
        prevClose: baseAnchor,
      };
      const prevClose = Number(curQuote.prevClose) || baseAnchor;
      const nextChange = +(nextPrice - prevClose).toFixed(2);
      const nextChangePct = prevClose
        ? +((nextChange / prevClose) * 100).toFixed(2)
        : 0;
      const nextQuote = {
        ...curQuote,
        ltp: nextPrice,
        high: Math.max(Number(curQuote.high) || nextPrice, nextPrice),
        low: Math.min(Number(curQuote.low) || nextPrice, nextPrice),
        change: nextChange,
        changePct: nextChangePct,
      };
      prevQuoteRef.current = nextQuote;

      emitLiveTick(symUpper, {
        ...nextQuote,
        tf,
        candle: updatedLast,
        tickLive: true,
      });

      // Only clone 200-400 bars into React state when caller did not opt into inPlace pub/sub mode
      if (!inPlace && Array.isArray(curBars) && curBars.length) {
        const nextBars = [...curBars.slice(0, -1), updatedLast];
        prevCandlesRef.current = nextBars;
        setCandles(nextBars);
        setQuote(nextQuote);
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [
    enabled,
    symbol,
    tf,
    inPlace,
    microTick,
    pollMs,
    chartFeedCfg.enabled,
    chartFeedCfg.tick_interval_ms,
    chartFeedCfg.fallback_last3_digits,
    marketStatus,
  ]);

  return {
    candles,
    quote,
    marketStatus,
    loading,
    refreshing,
    error,
    tickIntervalMs: chartFeedCfg.tick_interval_ms,
    refresh: () => fetchCandles(false),
  };
}

export async function searchMarketSymbols(query) {
  const res = await api.get("/market/search", { params: { q: query || "" } });
  return res.data || [];
}
