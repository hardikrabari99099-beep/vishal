const TIMEFRAME_SECONDS = {
  "1m": 60,
  "3m": 180,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "1D": 86400,
};
const REAL_QUOTE_SOURCES = new Set([
  "NSE",
  "BSE",
  "TradingView",
  "NSE/Yahoo",
  "BSE/Yahoo",
]);

export function applyLiveQuoteToCandle(
  candle,
  quote,
  timeframe,
  now = Date.now(),
) {
  if (
    !candle ||
    !quote ||
    quote.tickLive ||
    quote.candle ||
    quote.marketStatus !== "LIVE" ||
    !REAL_QUOTE_SOURCES.has(quote.source)
  )
    return null;
  const price = Number(quote.ltp);
  const timestamp = Date.parse(quote.updatedAt);
  const duration = TIMEFRAME_SECONDS[timeframe];
  const candleTime = Number(candle.time);
  if (
    !duration ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isFinite(timestamp) ||
    !Number.isFinite(candleTime)
  )
    return null;
  if (
    timestamp > now + 30000 ||
    now - timestamp > 120000 ||
    timestamp / 1000 < candleTime ||
    timestamp / 1000 >= candleTime + duration
  )
    return null;
  if (
    !Number.isFinite(Number(candle.close)) ||
    Number(candle.close) <= 0 ||
    Math.abs(price / Number(candle.close) - 1) > 0.05
  )
    return null;
  return {
    ...candle,
    high: Math.max(Number(candle.high), price),
    low: Math.min(Number(candle.low), price),
    close: price,
  };
}
