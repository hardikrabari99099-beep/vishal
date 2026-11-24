import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
} from "lightweight-charts";
import { formatPrice } from "../lib/useLiveMarket";
import { applyLiveQuoteToCandle } from "../lib/chart-live-quote";
import { useTheme } from "../context/ThemeContext";

export const TV_CHART_COLORS = {
  up: "#089981",
  down: "#F23645",
  volUp: "rgba(8, 153, 129, 0.38)",
  volDown: "rgba(242, 54, 69, 0.38)",
  areaTop: "rgba(8, 153, 129, 0.24)",
  areaBottom: "rgba(8, 153, 129, 0.01)",
};

export const TV_TIME_SCALE_DEFAULTS = {
  rightOffset: 15,
  barSpacing: 9,
  minBarSpacing: 2.5,
  fixRightEdge: false,
  fixLeftEdge: false,
  shiftVisibleRangeOnNewBar: false,
};

function normalizeCandles(candles) {
  if (!Array.isArray(candles) || !candles.length) return [];
  const seen = new Set();
  const normalized = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c) continue;
    let t = Number(c.time);
    if (!Number.isFinite(t) || t <= 0) {
      t = 1700000000 + i * 300;
    } else if (t > 1e12) {
      t = Math.floor(t / 1000);
    } else {
      t = Math.floor(t);
    }
    while (seen.has(t)) t += 1;
    seen.add(t);
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0))
      continue;
    normalized.push({
      time: t,
      open,
      high,
      low,
      close,
      volume: Number(c.volume || 0),
      label: c.label || "",
    });
  }
  normalized.sort((a, b) => a.time - b.time);
  return normalized;
}

function formatIstTime(unixSec) {
  try {
    const d = new Date(Number(unixSec) * 1000);
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

function formatIstTick(unixSec, tickMarkType) {
  const opts = { timeZone: "Asia/Kolkata" };
  if (tickMarkType === 0) opts.year = "numeric";
  else if (tickMarkType === 1) opts.month = "short";
  else if (tickMarkType === 2) opts.day = "numeric";
  else {
    opts.hour = "2-digit";
    opts.minute = "2-digit";
    opts.hour12 = false;
  }
  try {
    return new Date(Number(unixSec) * 1000).toLocaleString("en-IN", opts);
  } catch {
    return "";
  }
}

/* Isolated OHLC + Live Tick Readout so hovering crosshair or receiving sub-second ticks NEVER re-renders CandleChart */
const ChartOhlcBar = memo(function ChartOhlcBar({
  baseLastBar,
  baseLastEma,
  showEma,
  symbol,
  isLive = false,
  registerHoverHandler,
  registerLiveHandler,
}) {
  const [hoveredBar, setHoveredBar] = useState(null);
  const [liveTail, setLiveTail] = useState(null);
  const [closeTickDir, setCloseTickDir] = useState("");
  const prevCloseTickRef = useRef(null);
  const tickTimerRef = useRef(null);

  useEffect(() => {
    setHoveredBar(null);
    setLiveTail(null);
    setCloseTickDir("");
    prevCloseTickRef.current = null;
  }, [symbol, baseLastBar?.time]);

  useEffect(() => {
    if (!isLive) {
      setCloseTickDir("");
      setLiveTail(null);
      if (tickTimerRef.current) {
        clearTimeout(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    }
  }, [isLive]);

  useEffect(() => {
    if (!registerHoverHandler) return undefined;
    return registerHoverHandler((match) => {
      setHoveredBar(match || null);
    });
  }, [registerHoverHandler]);

  useEffect(() => {
    if (!registerLiveHandler) return undefined;
    return registerLiveHandler((nextTail) => {
      if (!nextTail?.bar) return;
      const c = Number(nextTail.bar.close);
      if (isLive && Number.isFinite(c) && c > 0) {
        if (
          prevCloseTickRef.current !== null &&
          prevCloseTickRef.current !== c
        ) {
          setCloseTickDir(c > prevCloseTickRef.current ? "up" : "down");
          if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
          tickTimerRef.current = setTimeout(() => setCloseTickDir(""), 200);
        }
        prevCloseTickRef.current = c;
      }
      setLiveTail(nextTail);
    });
  }, [registerLiveHandler, isLive]);

  useEffect(() => {
    const c = Number(baseLastBar?.close);
    if (!Number.isFinite(c) || c <= 0) return;
    if (isLive && prevCloseTickRef.current !== null && prevCloseTickRef.current !== c) {
      setCloseTickDir(c > prevCloseTickRef.current ? "up" : "down");
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
      tickTimerRef.current = setTimeout(() => setCloseTickDir(""), 200);
    }
    prevCloseTickRef.current = c;
  }, [baseLastBar?.close, isLive]);

  useEffect(() => {
    return () => {
      if (tickTimerRef.current) clearTimeout(tickTimerRef.current);
    };
  }, []);

  const currentLatest =
    liveTail && liveTail.bar?.time === baseLastBar?.time
      ? liveTail.bar
      : baseLastBar;
  const activeBar = hoveredBar || currentLatest;
  if (!activeBar) return null;

  const activeEma =
    hoveredBar?.ema ??
    (liveTail && liveTail.bar?.time === baseLastBar?.time
      ? liveTail.ema
      : baseLastEma);
  const barChg =
    activeBar && activeBar.open
      ? ((activeBar.close - activeBar.open) / activeBar.open) * 100
      : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[var(--muted)] mb-2 tabular-nums shrink-0 px-0.5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <span className="text-[var(--text)] font-medium">
          {activeBar.label || formatIstTime(activeBar.time) || "Latest"}
        </span>
        <span>
          O{" "}
          <strong className="text-[var(--text)]">
            {formatPrice(activeBar.open)}
          </strong>
        </span>
        <span>
          H{" "}
          <strong className="text-[var(--emerald)]">
            {formatPrice(activeBar.high)}
          </strong>
        </span>
        <span>
          L{" "}
          <strong className="text-[var(--rose)]">
            {formatPrice(activeBar.low)}
          </strong>
        </span>
        <span>
          C{" "}
          <strong
            className={`rounded px-1 ${
              !hoveredBar && closeTickDir === "up"
                ? "price-tick-up text-[#089981]"
                : !hoveredBar && closeTickDir === "down"
                  ? "price-tick-down text-[#F23645]"
                  : activeBar.close >= activeBar.open
                    ? "text-[var(--emerald)]"
                    : "text-[var(--rose)]"
            }`}
          >
            {formatPrice(activeBar.close)}
          </strong>
        </span>
        <span
          className={`font-semibold ${
            barChg >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
          }`}
        >
          {barChg >= 0 ? "+" : ""}
          {barChg.toFixed(2)}%
        </span>
        {showEma && activeEma != null && (
          <span className="text-amber-500">
            EMA20 <strong>{formatPrice(activeEma)}</strong>
          </span>
        )}
      </div>
      <span className="text-[10px] uppercase tracking-wider text-[var(--muted-2)]">
        TradingView{symbol ? ` · ${symbol}` : ""}
      </span>
    </div>
  );
});

/* ---------- TradingView Lightweight Charts interactive OHLC + EMA20 + Volume + Prev Close ---------- */
export const CandleChart = memo(function CandleChart({
  candles,
  height = 360,
  fillContainer = false,
  loading = false,
  refreshing = false,
  mode = "candle",
  showEma = true,
  symbol = "",
  timeframe = "",
  quote = null,
  prevClose = null,
}) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const areaSeriesRef = useRef(null);
  const emaSeriesRef = useRef(null);
  const volSeriesRef = useRef(null);
  const prevCloseLineRef = useRef(null);
  const prevCloseSeriesRef = useRef(null);
  const fittedKeyRef = useRef("");
  const lastMeasuredWidthRef = useRef(0);
  const barsCountRef = useRef(0);
  const simulatedBarRef = useRef(false);

  const hoverSubRef = useRef(null);
  const liveSubRef = useRef(null);
  const modeRef = useRef(mode);
  const showEmaRef = useRef(showEma);
  modeRef.current = mode;
  showEmaRef.current = showEma;

  const liveTailStateRef = useRef({
    lastBar: null,
    prevEma: null,
    lastEma: null,
  });

  const renderedStateRef = useRef({
    symbol: "",
    mode: "",
    showEma: null,
    isLight: null,
    count: 0,
    firstTime: 0,
    lastTime: 0,
    prevCloseKey: "",
  });

  const bars = useMemo(() => normalizeCandles(candles), [candles]);
  barsCountRef.current = bars.length;

  const ema20 = useMemo(() => {
    if (!bars.length) return [];
    const k = 2 / (20 + 1);
    const out = [];
    let prev = bars[0].close;
    for (let i = 0; i < bars.length; i++) {
      prev = i === 0 ? bars[i].close : bars[i].close * k + prev * (1 - k);
      out.push({ time: bars[i].time, value: +prev.toFixed(2) });
    }
    return out;
  }, [bars]);

  const barByTime = useMemo(() => {
    const map = new Map();
    bars.forEach((b, idx) => map.set(b.time, { ...b, ema: ema20[idx]?.value }));
    return map;
  }, [bars, ema20]);

  const barByTimeRef = useRef(barByTime);
  barByTimeRef.current = barByTime;

  const [isPannedBack, setIsPannedBack] = useState(false);

  const registerHoverHandler = useMemo(
    () => (fn) => {
      hoverSubRef.current = fn;
      return () => {
        if (hoverSubRef.current === fn) hoverSubRef.current = null;
      };
    },
    [],
  );

  const registerLiveHandler = useMemo(
    () => (fn) => {
      liveSubRef.current = fn;
      return () => {
        if (liveSubRef.current === fn) liveSubRef.current = null;
      };
    },
    [],
  );

  const scrollToLatest = () => {
    const chart = chartRef.current;
    const total = barsCountRef.current;
    if (!chart || !total) return;
    try {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(-2, total - 60),
        to: total + 12,
      });
      setIsPannedBack(false);
    } catch {
      /* chart disposed */
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === "undefined") return;

    // Guard for test environments (e.g. jsdom without canvas getContext)
    if (
      typeof navigator !== "undefined" &&
      /jsdom/i.test(navigator.userAgent || "")
    ) {
      return;
    }
    try {
      const testCanvas = document.createElement("canvas");
      if (!testCanvas.getContext || !testCanvas.getContext("2d")) return;
    } catch {
      return;
    }

    const numericHeight = Number.isFinite(Number(height))
      ? Number(height)
      : 360;
    const initW = Math.max(el.clientWidth || 0, 320);
    const initH = fillContainer
      ? Math.max(el.clientHeight || 0, 280)
      : numericHeight;
    lastMeasuredWidthRef.current = initW;

    const chart = createChart(el, {
      width: initW,
      height: initH,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isLight ? "#475569" : "#9aa5b4",
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11.5,
        attributionLogo: false,
      },
      grid: {
        vertLines: {
          color: isLight
            ? "rgba(15, 28, 21, 0.06)"
            : "rgba(148, 163, 184, 0.07)",
        },
        horzLines: {
          color: isLight
            ? "rgba(15, 28, 21, 0.06)"
            : "rgba(148, 163, 184, 0.07)",
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isLight
            ? "rgba(26, 122, 74, 0.55)"
            : "rgba(41, 211, 154, 0.48)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isLight ? "#1a7a4a" : "#141922",
        },
        horzLine: {
          color: isLight
            ? "rgba(26, 122, 74, 0.55)"
            : "rgba(41, 211, 154, 0.48)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isLight ? "#1a7a4a" : "#141922",
        },
      },
      rightPriceScale: {
        borderColor: isLight
          ? "rgba(196, 209, 202, 0.85)"
          : "rgba(43, 51, 64, 0.85)",
        scaleMargins: { top: 0.08, bottom: 0.16 },
      },
      timeScale: {
        borderColor: isLight
          ? "rgba(196, 209, 202, 0.85)"
          : "rgba(43, 51, 64, 0.85)",
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time, tickMarkType) =>
          formatIstTick(time, tickMarkType),
        ...TV_TIME_SCALE_DEFAULTS,
      },
      localization: {
        timeFormatter: (time) => formatIstTime(time),
        priceFormatter: (price) => formatPrice(price, 2),
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.84, bottom: 0 },
    });

    const upHex = TV_CHART_COLORS.up;
    const downHex = TV_CHART_COLORS.down;
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: upHex,
      downColor: downHex,
      borderUpColor: upHex,
      borderDownColor: downHex,
      wickUpColor: upHex,
      wickDownColor: downHex,
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: upHex,
      topColor: TV_CHART_COLORS.areaTop,
      bottomColor: TV_CHART_COLORS.areaBottom,
      lineWidth: 2,
      visible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: "#f59e0b",
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    areaSeriesRef.current = areaSeries;
    emaSeriesRef.current = emaSeries;
    volSeriesRef.current = volSeries;
    prevCloseLineRef.current = null;
    prevCloseSeriesRef.current = null;
    fittedKeyRef.current = "";
    renderedStateRef.current = {
      symbol: "",
      mode: "",
      showEma: null,
      isLight: null,
      count: 0,
      firstTime: 0,
      lastTime: 0,
      prevCloseKey: "",
    };

    let rafResize = 0;
    const syncDimensions = (w, h) => {
      if (w <= 0) return;
      const targetH = fillContainer ? Math.max(h, 240) : numericHeight;
      chart.resize(w, targetH);
      lastMeasuredWidthRef.current = w;
    };

    const rafInit = requestAnimationFrame(() => {
      if (el.clientWidth > 0) {
        syncDimensions(Math.floor(el.clientWidth), Math.floor(el.clientHeight));
      }
    });

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver((entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            const w = Math.floor(entry.contentRect.width);
            const h = Math.floor(entry.contentRect.height);
            syncDimensions(w, h);
          })
        : null;
    if (ro) ro.observe(el);

    return () => {
      cancelAnimationFrame(rafInit);
      cancelAnimationFrame(rafResize);
      if (ro) ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
      emaSeriesRef.current = null;
      volSeriesRef.current = null;
      prevCloseLineRef.current = null;
      prevCloseSeriesRef.current = null;
    };
  }, [height, fillContainer, isLight]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handler = (param) => {
      if (!param || !param.time) {
        hoverSubRef.current?.(null);
        return;
      }
      const match = barByTimeRef.current.get(Number(param.time));
      hoverSubRef.current?.(match || null);
    };
    const rangeHandler = (range) => {
      if (!range || !barsCountRef.current) {
        setIsPannedBack(false);
        return;
      }
      setIsPannedBack(range.to < barsCountRef.current - 1);
    };
    chart.subscribeCrosshairMove(handler);
    chart.timeScale().subscribeVisibleLogicalRangeChange(rangeHandler);
    return () => {
      try {
        chart.unsubscribeCrosshairMove(handler);
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(rangeHandler);
      } catch {
        /* chart disposed */
      }
    };
  }, [height, fillContainer, isLight]);

  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const areaSeries = areaSeriesRef.current;
    const emaSeries = emaSeriesRef.current;
    const volSeries = volSeriesRef.current;
    if (
      !chart ||
      !candleSeries ||
      !areaSeries ||
      !emaSeries ||
      !volSeries ||
      !bars.length
    ) {
      return;
    }

    const isArea = mode === "area";
    const prev = renderedStateRef.current;
    const firstTime = bars[0].time;
    const lastBar = bars[bars.length - 1];
    const lastTime = lastBar.time;
    const prevEmaVal =
      ema20.length >= 2 ? ema20[ema20.length - 2].value : lastBar.close;
    const lastEmaVal = ema20.length
      ? ema20[ema20.length - 1].value
      : lastBar.close;

    liveTailStateRef.current = {
      lastBar: { ...lastBar },
      prevEma: prevEmaVal,
      lastEma: lastEmaVal,
    };

    const canIncrementalUpdate =
      prev.symbol === symbol &&
      prev.mode === mode &&
      prev.showEma === Boolean(showEma) &&
      prev.isLight === isLight &&
      prev.count === bars.length &&
      prev.firstTime === firstTime &&
      prev.lastTime === lastTime;

    if (prev.mode !== mode) {
      candleSeries.applyOptions({
        visible: !isArea,
        lastValueVisible: !isArea,
        priceLineVisible: !isArea,
      });
      areaSeries.applyOptions({
        visible: isArea,
        lastValueVisible: isArea,
        priceLineVisible: isArea,
      });
    }

    if (canIncrementalUpdate) {
      if (isArea) {
        areaSeries.update({ time: lastBar.time, value: lastBar.close });
      } else {
        candleSeries.update({
          time: lastBar.time,
          open: lastBar.open,
          high: lastBar.high,
          low: lastBar.low,
          close: lastBar.close,
        });
      }
      volSeries.update({
        time: lastBar.time,
        value: lastBar.volume || 0,
        color:
          lastBar.close >= lastBar.open
            ? TV_CHART_COLORS.volUp
            : TV_CHART_COLORS.volDown,
      });
      if (showEma && ema20.length) {
        emaSeries.update(ema20[ema20.length - 1]);
      }
    } else {
      if (isArea) {
        areaSeries.setData(bars.map((b) => ({ time: b.time, value: b.close })));
      } else {
        candleSeries.setData(
          bars.map((b) => ({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          })),
        );
      }

      volSeries.setData(
        bars.map((b) => ({
          time: b.time,
          value: b.volume || 0,
          color:
            b.close >= b.open ? TV_CHART_COLORS.volUp : TV_CHART_COLORS.volDown,
        })),
      );

      emaSeries.applyOptions({ visible: Boolean(showEma) });
      emaSeries.setData(showEma ? ema20 : []);
    }

    const pcVal = Number(prevClose);
    const nextPrevCloseKey =
      Number.isFinite(pcVal) && pcVal > 0
        ? `${isArea ? "area" : "candle"}:${pcVal}`
        : "";
    if (prev.prevCloseKey !== nextPrevCloseKey) {
      if (prevCloseLineRef.current && prevCloseSeriesRef.current) {
        try {
          prevCloseSeriesRef.current.removePriceLine(prevCloseLineRef.current);
        } catch {
          /* ignore */
        }
        prevCloseLineRef.current = null;
        prevCloseSeriesRef.current = null;
      }
      const targetSeries = isArea ? areaSeries : candleSeries;
      if (nextPrevCloseKey) {
        try {
          prevCloseLineRef.current = targetSeries.createPriceLine({
            price: pcVal,
            color: isLight
              ? "rgba(75, 93, 83, 0.45)"
              : "rgba(148, 163, 184, 0.5)",
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: "Prev close",
          });
          prevCloseSeriesRef.current = targetSeries;
        } catch {
          /* ignore */
        }
      }
    }

    renderedStateRef.current = {
      symbol,
      mode,
      showEma: Boolean(showEma),
      isLight,
      count: bars.length,
      firstTime,
      lastTime,
      prevCloseKey: nextPrevCloseKey,
    };

    const barStep =
      bars.length > 1 ? Math.abs(bars[1].time - bars[0].time) : 300;
    const bucket =
      bars.length >= 250 ? "deep" : bars.length >= 120 ? "mid" : "short";
    const fitKey = `${symbol}:${barStep}:${mode}:${bucket}`;
    if (fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey;
      requestAnimationFrame(() => {
        try {
          const total = bars.length;
          chart.timeScale().setVisibleLogicalRange({
            from: Math.max(-2, total - 60),
            to: total + 12,
          });
          setIsPannedBack(false);
        } catch {
          /* ignore */
        }
      });
    }
  }, [
    bars,
    ema20,
    mode,
    showEma,
    symbol,
    prevClose,
    isLight,
    height,
    fillContainer,
  ]);

  useEffect(() => {
    if (
      !symbol ||
      String(quote?.symbol || "").toUpperCase() !== String(symbol).toUpperCase()
    )
      return;
    const k = 2 / (20 + 1);
    const tail = liveTailStateRef.current;
    const cur = tail.lastBar;
    const price = Number(quote.ltp);
    const simulated =
      quote.marketStatus === "LIVE" &&
      quote.tickLive &&
      cur &&
      Number.isFinite(price) &&
      price > 0 &&
      Math.abs(price / Number(cur.close) - 1) <= 0.05;
    const updated = simulated
      ? {
          ...cur,
          high: Math.max(cur.high, price),
          low: Math.min(cur.low, price),
          close: price,
        }
      : applyLiveQuoteToCandle(cur, quote, timeframe) ||
        (simulatedBarRef.current ? cur : null);
    if (!updated) return;
    simulatedBarRef.current = Boolean(simulated);
    if (!simulated) tail.lastBar = updated;

    const prevEma = Number(tail.prevEma) || updated.close;
    const nextEma = +(updated.close * k + prevEma * (1 - k)).toFixed(2);
    if (!simulated) tail.lastEma = nextEma;

    if (!simulated)
      barByTimeRef.current.set(updated.time, { ...updated, ema: nextEma });
    liveSubRef.current?.({ bar: updated, ema: nextEma });

    const candleSeries = candleSeriesRef.current;
    const areaSeries = areaSeriesRef.current;
    const volSeries = volSeriesRef.current;
    const emaSeries = emaSeriesRef.current;
    if (!candleSeries || !areaSeries || !volSeries) return;

    try {
      if (modeRef.current === "area") {
        areaSeries.update({ time: updated.time, value: updated.close });
      } else {
        candleSeries.update({
          time: updated.time,
          open: updated.open,
          high: updated.high,
          low: updated.low,
          close: updated.close,
        });
      }
      volSeries.update({
        time: updated.time,
        value: updated.volume,
        color:
          updated.close >= updated.open
            ? TV_CHART_COLORS.volUp
            : TV_CHART_COLORS.volDown,
      });
      if (showEmaRef.current && emaSeries) {
        emaSeries.update({ time: updated.time, value: nextEma });
      }
    } catch {
      /* ignore disposed series */
    }
  }, [symbol, timeframe, quote, bars]);

  const baseLastBar = bars.length ? bars[bars.length - 1] : null;
  const baseLastEma = ema20.length ? ema20[ema20.length - 1]?.value : undefined;

  return (
    <div
      className={`relative select-none ${fillContainer ? "flex flex-col flex-1 h-full min-h-0" : ""}`}
      data-refreshing={refreshing ? "true" : undefined}
    >
      <ChartOhlcBar
        baseLastBar={baseLastBar}
        baseLastEma={baseLastEma}
        showEma={showEma}
        symbol={symbol}
        isLive={quote?.marketStatus === "LIVE"}
        registerHoverHandler={registerHoverHandler}
        registerLiveHandler={registerLiveHandler}
      />

      <div
        className={`relative w-full rounded-xl overflow-hidden border border-[var(--border)]/60 bg-[var(--bg)]/35 ${
          fillContainer ? "flex-1 min-h-[260px]" : ""
        }`}
        style={fillContainer ? undefined : { height }}
      >
        <div
          ref={containerRef}
          className="w-full h-full"
          role="img"
          aria-label="TradingView interactive candlestick chart"
          data-testid="tradingview-chart"
        />

        {/* Subtle TradingView TV watermark badge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 bottom-7 z-10 inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10px] font-display font-bold tracking-tight bg-[var(--bg-2)]/80 text-[var(--muted)] border border-[var(--border)]/60"
        >
          TV
        </div>

        {isPannedBack && (
          <button
            type="button"
            onClick={scrollToLatest}
            data-testid="chart-scroll-latest"
            title="Jump back to latest live candle"
            className="absolute right-16 bottom-8 z-20 inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-mono font-semibold bg-[var(--bg-2)]/95 text-[#089981] border border-[#089981]/50 shadow-lg hover:bg-[#089981] hover:text-white transition-colors cursor-pointer"
          >
            Latest →
          </button>
        )}

        {!bars.length && (
          <div className="candle-skeleton absolute inset-0 z-20">
            <div className="text-xs font-mono text-[var(--muted-2)]">
              {loading
                ? "Loading TradingView NSE/BSE feed…"
                : "No candle bars available."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
