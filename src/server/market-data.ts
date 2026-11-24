// Server-only live Indian market data proxy unifying:
// - BennyThadikaran/NseIndiaApi pattern (NSE cookie handshake + allIndices/quote-equity)
// - BennyThadikaran/BseIndiaApi pattern (BSE Sensex / scrip feed)
// - 0xramm/Indian-Stock-Market-API pattern (NSE .NS / BSE .BO / index chart & search feed)
// - Mathieu2301/Tradingview-API pattern (TradingView scanner + wss://data.tradingview.com/socket.io/websocket historical OHLCV)

export type MarketInstrument = {
  symbol: string;
  providerSymbol: string;
  nseSymbol?: string;
  bseCode?: string;
  name: string;
  exchange: "NSE" | "BSE";
  kind: "INDEX" | "EQUITY" | "OPTION";
  lot: number;
  underlyingSymbol?: string;
  strike?: number;
  optionType?: "CE" | "PE";
};

export type MarketQuote = {
  symbol: string;
  providerSymbol: string;
  name: string;
  exchange: "NSE" | "BSE";
  kind: "INDEX" | "EQUITY" | "OPTION";
  lot: number;
  ltp: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
  source:
    | "NSE"
    | "BSE"
    | "TradingView"
    | "NSE/Yahoo"
    | "BSE/Yahoo"
    | "Option-Chain"
    | "Cache";
  marketStatus: "LIVE" | "CLOSED";
  updatedAt: string;
  underlyingSymbol?: string;
  strike?: number;
  optionType?: "CE" | "PE";
};

export type MarketCandle = {
  i: number;
  time: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const MARKET_INSTRUMENTS: MarketInstrument[] = [
  {
    symbol: "NIFTY",
    providerSymbol: "^NSEI",
    nseSymbol: "NIFTY 50",
    name: "NIFTY 50",
    exchange: "NSE",
    kind: "INDEX",
    lot: 75,
  },
  {
    symbol: "BANKNIFTY",
    providerSymbol: "^NSEBANK",
    nseSymbol: "NIFTY BANK",
    name: "BANK NIFTY",
    exchange: "NSE",
    kind: "INDEX",
    lot: 30,
  },
  {
    symbol: "SENSEX",
    providerSymbol: "^BSESN",
    bseCode: "SENSEX",
    name: "BSE SENSEX",
    exchange: "BSE",
    kind: "INDEX",
    lot: 20,
  },
  {
    symbol: "FINNIFTY",
    providerSymbol: "NIFTY_FIN_SERVICE.NS",
    nseSymbol: "NIFTY FIN SERVICE",
    name: "FIN NIFTY",
    exchange: "NSE",
    kind: "INDEX",
    lot: 65,
  },
  {
    symbol: "MIDCPNIFTY",
    providerSymbol: "^NSEMDCP50",
    nseSymbol: "NIFTY MIDCAP SELECT",
    name: "MIDCAP NIFTY",
    exchange: "NSE",
    kind: "INDEX",
    lot: 120,
  },
  {
    symbol: "NIFTYNEXT50",
    providerSymbol: "^NSMIDCP",
    nseSymbol: "NIFTY NEXT 50",
    name: "NIFTY NEXT 50",
    exchange: "NSE",
    kind: "INDEX",
    lot: 25,
  },
  {
    symbol: "BANKEX",
    providerSymbol: "BSE-BANK.BO",
    bseCode: "BANKEX",
    name: "BSE BANKEX",
    exchange: "BSE",
    kind: "INDEX",
    lot: 15,
  },
  {
    symbol: "INDIAVIX",
    providerSymbol: "^INDIAVIX",
    nseSymbol: "INDIA VIX",
    name: "INDIA VIX",
    exchange: "NSE",
    kind: "INDEX",
    lot: 1,
  },
  {
    symbol: "RELIANCE",
    providerSymbol: "RELIANCE.NS",
    nseSymbol: "RELIANCE",
    name: "Reliance Industries",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "HDFCBANK",
    providerSymbol: "HDFCBANK.NS",
    nseSymbol: "HDFCBANK",
    name: "HDFC Bank",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TCS",
    providerSymbol: "TCS.NS",
    nseSymbol: "TCS",
    name: "Tata Consultancy Services",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "INFY",
    providerSymbol: "INFY.NS",
    nseSymbol: "INFY",
    name: "Infosys",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ICICIBANK",
    providerSymbol: "ICICIBANK.NS",
    nseSymbol: "ICICIBANK",
    name: "ICICI Bank",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "SBIN",
    providerSymbol: "SBIN.NS",
    nseSymbol: "SBIN",
    name: "State Bank of India",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TATAMOTORS",
    providerSymbol: "TMPV.NS",
    nseSymbol: "TMPV",
    name: "Tata Motors",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ITC",
    providerSymbol: "ITC.NS",
    nseSymbol: "ITC",
    name: "ITC Limited",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "BHARTIARTL",
    providerSymbol: "BHARTIARTL.NS",
    nseSymbol: "BHARTIARTL",
    name: "Bharti Airtel",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "AXISBANK",
    providerSymbol: "AXISBANK.NS",
    nseSymbol: "AXISBANK",
    name: "Axis Bank",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "KOTAKBANK",
    providerSymbol: "KOTAKBANK.NS",
    nseSymbol: "KOTAKBANK",
    name: "Kotak Mahindra Bank",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "LT",
    providerSymbol: "LT.NS",
    nseSymbol: "LT",
    name: "Larsen & Toubro",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "BAJFINANCE",
    providerSymbol: "BAJFINANCE.NS",
    nseSymbol: "BAJFINANCE",
    name: "Bajaj Finance",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "WIPRO",
    providerSymbol: "WIPRO.NS",
    nseSymbol: "WIPRO",
    name: "Wipro Limited",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "SUNPHARMA",
    providerSymbol: "SUNPHARMA.NS",
    nseSymbol: "SUNPHARMA",
    name: "Sun Pharmaceutical",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "MARUTI",
    providerSymbol: "MARUTI.NS",
    nseSymbol: "MARUTI",
    name: "Maruti Suzuki India",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ADANIENT",
    providerSymbol: "ADANIENT.NS",
    nseSymbol: "ADANIENT",
    name: "Adani Enterprises",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TATASTEEL",
    providerSymbol: "TATASTEEL.NS",
    nseSymbol: "TATASTEEL",
    name: "Tata Steel",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "RELIANCE.BO",
    providerSymbol: "RELIANCE.BO",
    name: "Reliance Industries (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TCS.BO",
    providerSymbol: "TCS.BO",
    name: "TCS (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "HDFCBANK.BO",
    providerSymbol: "HDFCBANK.BO",
    name: "HDFC Bank (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "INFY.BO",
    providerSymbol: "INFY.BO",
    name: "Infosys (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ICICIBANK.BO",
    providerSymbol: "ICICIBANK.BO",
    name: "ICICI Bank (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "SBIN.BO",
    providerSymbol: "SBIN.BO",
    name: "State Bank of India (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "LT.BO",
    providerSymbol: "LT.BO",
    name: "Larsen & Toubro (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "HAL",
    providerSymbol: "HAL.NS",
    nseSymbol: "HAL",
    name: "Hindustan Aeronautics",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "BEL",
    providerSymbol: "BEL.NS",
    nseSymbol: "BEL",
    name: "Bharat Electronics",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "NTPC",
    providerSymbol: "NTPC.NS",
    nseSymbol: "NTPC",
    name: "NTPC Limited",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ONGC",
    providerSymbol: "ONGC.NS",
    nseSymbol: "ONGC",
    name: "Oil & Natural Gas Corp",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "POWERGRID",
    providerSymbol: "POWERGRID.NS",
    nseSymbol: "POWERGRID",
    name: "Power Grid Corp",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "HINDUNILVR",
    providerSymbol: "HINDUNILVR.NS",
    nseSymbol: "HINDUNILVR",
    name: "Hindustan Unilever",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ASIANPAINT",
    providerSymbol: "ASIANPAINT.NS",
    nseSymbol: "ASIANPAINT",
    name: "Asian Paints",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TITAN",
    providerSymbol: "TITAN.NS",
    nseSymbol: "TITAN",
    name: "Titan Company",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ULTRACEMCO",
    providerSymbol: "ULTRACEMCO.NS",
    nseSymbol: "ULTRACEMCO",
    name: "UltraTech Cement",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "DMART",
    providerSymbol: "DMART.NS",
    nseSymbol: "DMART",
    name: "Avenue Supermarts (DMart)",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TRENT",
    providerSymbol: "TRENT.NS",
    nseSymbol: "TRENT",
    name: "Trent Limited",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "JSWSTEEL",
    providerSymbol: "JSWSTEEL.NS",
    nseSymbol: "JSWSTEEL",
    name: "JSW Steel",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "COALINDIA",
    providerSymbol: "COALINDIA.NS",
    nseSymbol: "COALINDIA",
    name: "Coal India",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "HCLTECH",
    providerSymbol: "HCLTECH.NS",
    nseSymbol: "HCLTECH",
    name: "HCL Technologies",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TECHM",
    providerSymbol: "TECHM.NS",
    nseSymbol: "TECHM",
    name: "Tech Mahindra",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ETERNAL",
    providerSymbol: "ETERNAL.NS",
    nseSymbol: "ETERNAL",
    name: "Eternal (Zomato)",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ETERNAL.BO",
    providerSymbol: "ETERNAL.BO",
    name: "Eternal (Zomato) (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "IRCTC",
    providerSymbol: "IRCTC.NS",
    nseSymbol: "IRCTC",
    name: "IRCTC Limited",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "SUZLON",
    providerSymbol: "SUZLON.NS",
    nseSymbol: "SUZLON",
    name: "Suzlon Energy",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "JIOFIN",
    providerSymbol: "JIOFIN.NS",
    nseSymbol: "JIOFIN",
    name: "Jio Financial Services",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "BANKBARODA",
    providerSymbol: "BANKBARODA.NS",
    nseSymbol: "BANKBARODA",
    name: "Bank of Baroda",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "PNB",
    providerSymbol: "PNB.NS",
    nseSymbol: "PNB",
    name: "Punjab National Bank",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "INDUSINDBK",
    providerSymbol: "INDUSINDBK.NS",
    nseSymbol: "INDUSINDBK",
    name: "IndusInd Bank",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "DRREDDY",
    providerSymbol: "DRREDDY.NS",
    nseSymbol: "DRREDDY",
    name: "Dr. Reddy's Laboratories",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "CIPLA",
    providerSymbol: "CIPLA.NS",
    nseSymbol: "CIPLA",
    name: "Cipla Limited",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "ADANIPORTS",
    providerSymbol: "ADANIPORTS.NS",
    nseSymbol: "ADANIPORTS",
    name: "Adani Ports & SEZ",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "BSE",
    providerSymbol: "BSE.NS",
    nseSymbol: "BSE",
    name: "BSE Limited",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "CDSL",
    providerSymbol: "CDSL.NS",
    nseSymbol: "CDSL",
    name: "CDSL India",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "RVNL",
    providerSymbol: "RVNL.NS",
    nseSymbol: "RVNL",
    name: "Rail Vikas Nigam",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TATAPOWER",
    providerSymbol: "TATAPOWER.NS",
    nseSymbol: "TATAPOWER",
    name: "Tata Power",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "BAJAJ-AUTO",
    providerSymbol: "BAJAJ-AUTO.NS",
    nseSymbol: "BAJAJ-AUTO",
    name: "Bajaj Auto",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "EICHERMOT",
    providerSymbol: "EICHERMOT.NS",
    nseSymbol: "EICHERMOT",
    name: "Eicher Motors",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "HEROMOTOCO",
    providerSymbol: "HEROMOTOCO.NS",
    nseSymbol: "HEROMOTOCO",
    name: "Hero MotoCorp",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "M&M",
    providerSymbol: "M&M.NS",
    nseSymbol: "M&M",
    name: "Mahindra & Mahindra",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "PAYTM",
    providerSymbol: "PAYTM.NS",
    nseSymbol: "PAYTM",
    name: "One97 Communications (Paytm)",
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "TATAMOTORS.BO",
    providerSymbol: "TMPV.BO",
    name: "Tata Motors (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
  {
    symbol: "BAJFINANCE.BO",
    providerSymbol: "BAJFINANCE.BO",
    name: "Bajaj Finance (BSE)",
    exchange: "BSE",
    kind: "EQUITY",
    lot: 1,
  },
];

const OPTION_SPECS: Record<
  string,
  { lot: number; step: number; exchange: "NSE" | "BSE"; fallbackSpot: number }
> = {
  NIFTY: { lot: 75, step: 50, exchange: "NSE", fallbackSpot: 25450 },
  BANKNIFTY: { lot: 30, step: 100, exchange: "NSE", fallbackSpot: 62350 },
  FINNIFTY: { lot: 65, step: 50, exchange: "NSE", fallbackSpot: 28280 },
  MIDCPNIFTY: { lot: 120, step: 25, exchange: "NSE", fallbackSpot: 17870 },
  NIFTYNEXT50: { lot: 25, step: 100, exchange: "NSE", fallbackSpot: 68500 },
  SENSEX: { lot: 20, step: 100, exchange: "BSE", fallbackSpot: 82600 },
  BANKEX: { lot: 15, step: 100, exchange: "BSE", fallbackSpot: 70170 },
  RELIANCE: { lot: 500, step: 20, exchange: "NSE", fallbackSpot: 1345 },
  HDFCBANK: { lot: 550, step: 20, exchange: "NSE", fallbackSpot: 1750 },
  TCS: { lot: 175, step: 50, exchange: "NSE", fallbackSpot: 3800 },
  INFY: { lot: 400, step: 20, exchange: "NSE", fallbackSpot: 1850 },
  ICICIBANK: { lot: 700, step: 20, exchange: "NSE", fallbackSpot: 1300 },
  SBIN: { lot: 750, step: 10, exchange: "NSE", fallbackSpot: 810 },
  TATAMOTORS: { lot: 550, step: 10, exchange: "NSE", fallbackSpot: 260 },
  AXISBANK: { lot: 625, step: 20, exchange: "NSE", fallbackSpot: 1150 },
  BAJFINANCE: { lot: 125, step: 100, exchange: "NSE", fallbackSpot: 7000 },
};

const SEARCH_ALIASES: Record<string, string> = {
  ZOMATO: "ETERNAL",
  TMPV: "TATAMOTORS",
  RIL: "RELIANCE",
  SBI: "SBIN",
  MAHINDRA: "M&M",
  AIRTEL: "BHARTIARTL",
  ONE97: "PAYTM",
  "NIFTY 50": "NIFTY",
  "BANK NIFTY": "BANKNIFTY",
  "FIN NIFTY": "FINNIFTY",
  "MIDCAP NIFTY": "MIDCPNIFTY",
};

const CORE_OPTION_UNDERLYINGS = [
  "NIFTY",
  "BANKNIFTY",
  "SENSEX",
  "FINNIFTY",
  "MIDCPNIFTY",
  "BANKEX",
];

const INSTRUMENT_MAP = new Map(
  MARKET_INSTRUMENTS.map((i) => [i.symbol.toUpperCase(), i]),
);

const QUOTE_TTL_LIVE_MS = 1500;
const QUOTE_TTL_CLOSED_MS = 10 * 60 * 1000;
const CANDLE_TTL_LIVE_MS = 4000;
const CANDLE_TTL_CLOSED_MS = 10 * 60 * 1000;
const COLD_RACE_MS = 6000;

// Official NSE/BSE trading holidays (YYYY-MM-DD in IST)
const NSE_MARKET_HOLIDAYS = new Set<string>([
  "2025-02-26",
  "2025-03-14",
  "2025-03-31",
  "2025-04-10",
  "2025-04-14",
  "2025-04-18",
  "2025-05-01",
  "2025-08-15",
  "2025-08-27",
  "2025-10-02",
  "2025-10-21",
  "2025-10-22",
  "2025-11-05",
  "2025-12-25",
  "2026-01-15",
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-05-28",
  "2026-06-26",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-10",
  "2026-11-24", // Guru Nanak Jayanti
  "2026-12-25",
  "2027-01-26",
]);
const detectedClosedIstDates = new Set<string>();
let lastHolidayProbeTs = 0;

const quoteCache = new Map<string, { data: MarketQuote; ts: number }>();
const candleCache = new Map<
  string,
  {
    data: { quote: MarketQuote; candles: MarketCandle[]; isBaseline?: boolean };
    ts: number;
  }
>();
const inflightYahoo = new Map<
  string,
  Promise<{ quote: MarketQuote; candles: MarketCandle[] } | null>
>();
let inflightQuoteBatch: Promise<void> | null = null;
const inflightCandleKeys = new Set<string>();

let nseCookieCache: { cookie: string; ts: number } | null = null;
let nseBlockedUntil = 0;
let bseBlockedUntil = 0;
let tvScannerBlockedUntil = 0;
let legacyEqBlockedUntil = 0;
const tvWsBlockedUntil = 0;
let warmStarted = false;

function getIstDateKey(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function syncCachedQuoteMarketStatus(status: "LIVE" | "CLOSED"): void {
  for (const [k, entry] of quoteCache.entries()) {
    if (entry.data.marketStatus !== status) {
      quoteCache.set(k, {
        ...entry,
        data: { ...entry.data, marketStatus: status },
      });
    }
  }
  for (const [k, entry] of candleCache.entries()) {
    if (entry.data.quote.marketStatus !== status) {
      candleCache.set(k, {
        ...entry,
        data: {
          ...entry.data,
          quote: { ...entry.data.quote, marketStatus: status },
        },
      });
    }
  }
}

function upsertQuoteCacheIfFresher(
  symbol: string,
  incoming: MarketQuote | null | undefined,
): void {
  if (!incoming || !Number.isFinite(incoming.ltp) || incoming.ltp <= 0) return;
  const existing = quoteCache.get(symbol);
  if (!existing || existing.data.source === "Cache") {
    quoteCache.set(symbol, { data: incoming, ts: Date.now() });
    return;
  }
  const expired = Date.now() - existing.ts >= getQuoteTtlMs();
  // Never replace an authoritative scanner/exchange/Yahoo quote with truncated TV WS session close
  if (
    incoming.source === "TradingView" &&
    existing.data.source !== "TradingView"
  ) {
    return;
  }
  const incomingMs = Date.parse(incoming.updatedAt || "");
  const existingMs = Date.parse(existing.data.updatedAt || "");
  if (
    expired ||
    !Number.isFinite(existingMs) ||
    (Number.isFinite(incomingMs) && incomingMs >= existingMs)
  ) {
    quoteCache.set(symbol, { data: incoming, ts: Date.now() });
  }
}

function scheduleCorePrewarm(): void {
  if (warmStarted || process.env["VITEST"]) return;
  warmStarted = true;
  const core = [
    "NIFTY",
    "BANKNIFTY",
    "SENSEX",
    "FINNIFTY",
    "RELIANCE",
    "HDFCBANK",
    "TCS",
  ].map((s) => resolveInstrument(s));
  const runWarm = () => {
    refreshBaseInstruments(core).catch(() => {});
    for (const inst of core.slice(0, 4)) {
      for (const tf of ["5m", "15m"]) {
        const key = `${inst.symbol}:${tf}`;
        fetchUnifiedChart(inst, tf)
          .then((fetched) => {
            if (fetched) {
              candleCache.set(key, {
                data: { ...fetched, isBaseline: false },
                ts: Date.now(),
              });
              upsertQuoteCacheIfFresher(inst.symbol, fetched.quote);
            }
          })
          .catch(() => {});
      }
    }
  };
  setTimeout(runWarm, 20);
  const timer = setInterval(() => {
    if (getIndianMarketStatus() === "LIVE") runWarm();
  }, 45000);
  if (
    typeof timer === "object" &&
    "unref" in timer &&
    typeof timer.unref === "function"
  ) {
    timer.unref();
  }
}

function getQuoteTtlMs(): number {
  return getIndianMarketStatus() === "LIVE"
    ? QUOTE_TTL_LIVE_MS
    : QUOTE_TTL_CLOSED_MS;
}

function getCandleTtlMs(): number {
  return getIndianMarketStatus() === "LIVE"
    ? CANDLE_TTL_LIVE_MS
    : CANDLE_TTL_CLOSED_MS;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export function getIndianMarketStatus(now = new Date()): "LIVE" | "CLOSED" {
  const istMs = now.getTime() + 5.5 * 3600 * 1000;
  const ist = new Date(istMs);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return "CLOSED";
  const dateKey = getIstDateKey(now);
  if (NSE_MARKET_HOLIDAYS.has(dateKey) || detectedClosedIstDates.has(dateKey)) {
    return "CLOSED";
  }
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30 ? "LIVE" : "CLOSED";
}

function getOptionLotAndStep(
  underlying: string,
  spot?: number,
): { lot: number; step: number; exchange: "NSE" | "BSE" } {
  const spec = OPTION_SPECS[underlying];
  if (spec) return { lot: spec.lot, step: spec.step, exchange: spec.exchange };
  const s = Number(spot) || 1000;
  const step =
    s >= 5000 ? 100 : s >= 2000 ? 50 : s >= 1000 ? 20 : s >= 300 ? 10 : 5;
  return {
    lot: 250,
    step,
    exchange: underlying.endsWith(".BO") ? "BSE" : "NSE",
  };
}

export function buildOptionInstrument(
  underlyingRaw: string,
  strike: number,
  optionType: "CE" | "PE",
): MarketInstrument {
  const underlying = underlyingRaw.replace(/\.NS$/, "").toUpperCase();
  const baseInst = INSTRUMENT_MAP.get(underlying);
  const { lot, exchange } = getOptionLotAndStep(underlying);
  const sym = `${underlying}${strike}${optionType}`;
  return {
    symbol: sym,
    providerSymbol: `${baseInst?.providerSymbol || `${underlying}.NS`}#${strike}${optionType}`,
    name: `${underlying} ${strike.toLocaleString("en-IN")} ${optionType} (Option)`,
    exchange: baseInst?.exchange || exchange,
    kind: "OPTION",
    lot,
    underlyingSymbol: underlying,
    strike,
    optionType,
  };
}

export function parseOptionSymbol(rawSymbol: string): MarketInstrument | null {
  const compact = String(rawSymbol || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/(CALL)$/, "CE")
    .replace(/(PUT)$/, "PE");
  const m = compact.match(/^([A-Z&-]{2,14}?)(\d{2,6})(CE|PE)$/);
  if (!m) return null;
  const [, rawUnder, strikeStr, optType] = m;
  if (!rawUnder || !strikeStr || !optType) return null;
  const underlying = SEARCH_ALIASES[rawUnder] || rawUnder;
  const strike = Number(strikeStr);
  if (!Number.isFinite(strike) || strike <= 0) return null;
  return buildOptionInstrument(underlying, strike, optType as "CE" | "PE");
}

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function computeOptionPremium(
  spot: number,
  strike: number,
  optionType: "CE" | "PE",
  ivPct = 14.5,
  dteDays = 4,
): number {
  const S = Math.max(1, Number(spot) || 1);
  const K = Math.max(1, Number(strike) || 1);
  const T = Math.max(0.4 / 365, dteDays / 365);
  const r = 0.068;
  const sigma = Math.max(0.08, ivPct / 100);
  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discK = K * Math.exp(-r * T);
  const raw =
    optionType === "CE"
      ? S * normCdf(d1) - discK * normCdf(d2)
      : discK * normCdf(-d2) - S * normCdf(-d1);
  return Math.max(0.05, +raw.toFixed(2));
}

export function resolveInstrument(rawSymbol: string): MarketInstrument {
  const clean = String(rawSymbol || "NIFTY")
    .trim()
    .toUpperCase();
  const aliased = SEARCH_ALIASES[clean] || clean;
  const known = INSTRUMENT_MAP.get(aliased);
  if (known) return known;
  const parsedOpt = parseOptionSymbol(clean);
  if (parsedOpt) return parsedOpt;
  if (aliased.endsWith(".BO")) {
    return {
      symbol: aliased,
      providerSymbol: aliased,
      name: aliased.replace(/\.BO$/, ""),
      exchange: "BSE",
      kind: "EQUITY",
      lot: 1,
    };
  }
  if (aliased.endsWith(".NS")) {
    return {
      symbol: aliased.replace(/\.NS$/, ""),
      providerSymbol: aliased,
      nseSymbol: aliased.replace(/\.NS$/, ""),
      name: aliased.replace(/\.NS$/, ""),
      exchange: "NSE",
      kind: "EQUITY",
      lot: 1,
    };
  }
  return {
    symbol: aliased,
    providerSymbol: `${aliased}.NS`,
    nseSymbol: aliased,
    name: aliased,
    exchange: "NSE",
    kind: "EQUITY",
    lot: 1,
  };
}

async function getNseCookie(): Promise<string | null> {
  if (Date.now() < nseBlockedUntil) return null;
  if (nseCookieCache && Date.now() - nseCookieCache.ts < 4 * 60 * 1000) {
    return nseCookieCache.cookie;
  }
  try {
    const resp = await fetch("https://www.nseindia.com/", {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(1500),
    });
    if (!resp.ok) {
      nseBlockedUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
    const setCookies =
      typeof resp.headers.getSetCookie === "function"
        ? resp.headers.getSetCookie()
        : [resp.headers.get("set-cookie") || ""];
    const cookie = setCookies
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");
    if (!cookie) {
      nseBlockedUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
    nseCookieCache = { cookie, ts: Date.now() };
    return cookie;
  } catch {
    nseBlockedUntil = Date.now() + 5 * 60 * 1000;
    return null;
  }
}

async function tryNseIndices(): Promise<Map<string, Partial<MarketQuote>>> {
  const out = new Map<string, Partial<MarketQuote>>();
  const cookie = await getNseCookie();
  if (!cookie) return out;
  try {
    const resp = await fetch("https://www.nseindia.com/api/allIndices", {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json, text/plain, */*",
        Referer: "https://www.nseindia.com/",
        Cookie: cookie,
      },
      signal: AbortSignal.timeout(1500),
    });
    if (!resp.ok) {
      nseBlockedUntil = Date.now() + 5 * 60 * 1000;
      return out;
    }
    const NSE_INDEX_MAP: Record<string, string> = {
      "NIFTY 50": "NIFTY",
      "NIFTY BANK": "BANKNIFTY",
      "NIFTY FIN SERVICE": "FINNIFTY",
      "NIFTY FINANCIAL SERVICES": "FINNIFTY",
      "NIFTY MIDCAP SELECT": "MIDCPNIFTY",
      "NIFTY NEXT 50": "NIFTYNEXT50",
      "INDIA VIX": "INDIAVIX",
    };
    const body = (await resp.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    for (const row of body.data || []) {
      const idx = String(row["index"] || "").toUpperCase();
      const sym = NSE_INDEX_MAP[idx];
      if (sym) {
        const ltp = Number(row["last"]) || 0;
        const prevClose = Number(row["previousClose"]) || ltp;
        const change = Number(row["variation"] ?? ltp - prevClose) || 0;
        const changePct =
          Number(
            row["percentChange"] ??
              (prevClose ? (change / prevClose) * 100 : 0),
          ) || 0;
        if (ltp > 0) {
          out.set(sym, {
            ltp,
            prevClose,
            open: Number(row["open"]) || ltp,
            high: Number(row["high"]) || ltp,
            low: Number(row["low"]) || ltp,
            change,
            changePct,
            source: "NSE",
          });
        }
      }
    }
  } catch {
    nseBlockedUntil = Date.now() + 5 * 60 * 1000;
  }
  return out;
}

const STOCK_MARKET_INDIA_BASE =
  "https://www1.nseindia.com/live_market/dynaContent/live_watch";
const STOCK_MARKET_INDIA_INDEX_MAP: Record<string, string> = {
  "NIFTY 50": "NIFTY",
  "NIFTY BANK": "BANKNIFTY",
  "NIFTY FIN SERVICE": "FINNIFTY",
  "NIFTY MIDCAP SELECT": "MIDCPNIFTY",
  "NIFTY NEXT 50": "NIFTYNEXT50",
  "INDIA VIX": "INDIAVIX",
};

export function parseStockMarketIndiaQuote(
  row: Record<string, unknown>,
): Partial<MarketQuote> | null {
  const number = (value: unknown) =>
    Number(String(value ?? "").replace(/,/g, "")) || 0;
  const ltp = number(row["lastPrice"] ?? row["last"]);
  if (ltp <= 0) return null;
  const prevClose = number(row["previousClose"]) || ltp;
  const change = number(row["change"] ?? row["variation"]) || ltp - prevClose;
  return {
    ltp,
    prevClose,
    change,
    changePct:
      number(row["pChange"] ?? row["percentChange"]) ||
      (prevClose ? (change / prevClose) * 100 : 0),
    open: number(row["open"]) || ltp,
    high: number(row["dayHigh"] ?? row["high"]) || ltp,
    low: number(row["dayLow"] ?? row["low"]) || ltp,
    source: "NSE",
  };
}

async function tryStockMarketIndiaIndices(): Promise<
  Map<string, Partial<MarketQuote>>
> {
  const quotes = new Map<string, Partial<MarketQuote>>();
  if (!process.env["VITEST"] && Date.now() < legacyEqBlockedUntil)
    return quotes;
  try {
    const response = await fetch(
      `${STOCK_MARKET_INDIA_BASE}/stock_watch/liveIndexWatchData.json`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
          Referer: "https://www1.nseindia.com/",
        },
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!response.ok) return quotes;
    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    for (const row of body.data || []) {
      const symbol =
        STOCK_MARKET_INDIA_INDEX_MAP[String(row["index"] || "").toUpperCase()];
      const quote = parseStockMarketIndiaQuote(row);
      if (symbol && quote) quotes.set(symbol, quote);
    }
  } catch {
    if (!process.env["VITEST"]) legacyEqBlockedUntil = Date.now() + 60_000;
    return quotes;
  }
  return quotes;
}

async function tryStockMarketIndiaEquity(
  inst: MarketInstrument,
): Promise<Partial<MarketQuote> | null> {
  if (inst.exchange !== "NSE" || inst.kind !== "EQUITY") return null;
  if (!process.env["VITEST"] && Date.now() < legacyEqBlockedUntil) return null;
  try {
    const symbol = encodeURIComponent(inst.nseSymbol || inst.symbol);
    const response = await fetch(
      `${STOCK_MARKET_INDIA_BASE}/get_quote/ajaxGetQuoteJSON.jsp?series=EQ&symbol=${symbol}`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
          Referer: `https://www1.nseindia.com/live_market/dynaContent/live_watch/get_quote/GetQuote.jsp?symbol=${symbol}`,
          "X-Requested-With": "XMLHttpRequest",
        },
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    return body.data?.[0] ? parseStockMarketIndiaQuote(body.data[0]) : null;
  } catch {
    if (!process.env["VITEST"]) legacyEqBlockedUntil = Date.now() + 60_000;
    return null;
  }
}

async function tryBseSensex(): Promise<Partial<MarketQuote> | null> {
  if (Date.now() < bseBlockedUntil) return null;
  try {
    const resp = await fetch(
      "https://api.bseindia.com/RealTimeBseIndiaAPI/api/GetSensexData/w",
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.bseindia.com/",
        },
        signal: AbortSignal.timeout(1500),
      },
    );
    if (!resp.ok) {
      bseBlockedUntil = Date.now() + 5 * 60 * 1000;
      return null;
    }
    const raw = (await resp.json()) as
      Array<Record<string, unknown>> | Record<string, unknown>;
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) return null;
    const parseNum = (v: unknown) =>
      Number(String(v ?? "").replace(/,/g, "")) || 0;
    const ltp = parseNum(row["ltp"] ?? row["CurrVal"] ?? row["currentValue"]);
    const prevClose = parseNum(row["prevClose"] ?? row["Prev_Close"]) || ltp;
    if (ltp <= 0) return null;
    const change = parseNum(row["chg"] ?? row["Chg"]) || ltp - prevClose;
    const changePct =
      parseNum(row["perChg"] ?? row["PcChg"]) ||
      (prevClose ? (change / prevClose) * 100 : 0);
    return {
      ltp,
      prevClose,
      open: parseNum(row["open"] ?? row["Open"]) || ltp,
      high: parseNum(row["high"] ?? row["High"]) || ltp,
      low: parseNum(row["low"] ?? row["Low"]) || ltp,
      change,
      changePct,
      source: "BSE",
    };
  } catch {
    bseBlockedUntil = Date.now() + 5 * 60 * 1000;
    return null;
  }
}

const MC_INDEX_CODES: Record<
  string,
  { code: string; exchange: "NSE" | "BSE" }
> = {
  NIFTY: { code: "in%3BNSX", exchange: "NSE" },
  BANKNIFTY: { code: "in%3Bnbx", exchange: "NSE" },
  SENSEX: { code: "in%3BSEN", exchange: "BSE" },
  FINNIFTY: { code: "in%3Bcnxf", exchange: "NSE" },
};

async function tryFastIndianIndexQuote(
  sym: string,
): Promise<Partial<MarketQuote> | null> {
  const entry = MC_INDEX_CODES[sym];
  if (!entry) return null;
  try {
    const resp = await fetch(
      `https://priceapi.moneycontrol.com/pricefeed/notapplicable/inidicesindia/${entry.code}`,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json, text/plain, */*",
        },
        signal: AbortSignal.timeout(1200),
      },
    );
    if (!resp.ok) return null;
    const payload = (await resp.json()) as { data?: Record<string, unknown> };
    const d = payload?.data;
    if (!d) return null;
    const parseNum = (v: unknown) =>
      Number(String(v ?? "").replace(/,/g, "")) || 0;
    const ltp = parseNum(d["pricecurrent"]);
    if (ltp <= 0) return null;
    const prevClose = parseNum(d["priceprevclose"]) || ltp;
    const change = parseNum(d["pricechange"]) || +(ltp - prevClose).toFixed(2);
    const changePct =
      parseNum(d["pricepercentchange"]) ||
      (prevClose ? +((change / prevClose) * 100).toFixed(2) : 0);
    return {
      ltp,
      prevClose,
      open: parseNum(d["OPEN"]) || ltp,
      high: parseNum(d["HIGH"]) || ltp,
      low: parseNum(d["LOW"]) || ltp,
      change,
      changePct,
      source: entry.exchange,
    };
  } catch {
    return null;
  }
}

const TV_SYMBOL_MAP: Record<string, string> = {
  NIFTY: "NSE:NIFTY",
  BANKNIFTY: "NSE:BANKNIFTY",
  FINNIFTY: "NSE:CNXFINANCE",
  MIDCPNIFTY: "NSE:NIFTY_MID_SELECT",
  NIFTYNEXT50: "NSE:JUNIOR",
  INDIAVIX: "NSE:INDIAVIX",
  SENSEX: "BSE:SENSEX",
  BANKEX: "BSE:BANKEX",
  TATAMOTORS: "NSE:TMPV",
  "TATAMOTORS.BO": "BSE:TMPV",
};

function toTradingViewSymbol(inst: MarketInstrument): string {
  const sym = inst.symbol.toUpperCase();
  if (TV_SYMBOL_MAP[sym]) return TV_SYMBOL_MAP[sym];
  if (inst.exchange === "BSE" || sym.endsWith(".BO")) {
    return `BSE:${sym.replace(/\.BO$/, "")}`;
  }
  return `NSE:${(inst.nseSymbol || sym).replace(/\.NS$/, "")}`;
}

async function tryTradingViewScannerQuotes(
  insts: MarketInstrument[],
): Promise<Map<string, Partial<MarketQuote>>> {
  const out = new Map<string, Partial<MarketQuote>>();
  if (Date.now() < tvScannerBlockedUntil || process.env["VITEST"]) return out;
  const targets = insts.filter((i) => i.kind !== "OPTION");
  if (!targets.length) return out;
  const tvToInst = new Map<string, MarketInstrument>();
  for (const inst of targets) {
    tvToInst.set(toTradingViewSymbol(inst), inst);
  }
  try {
    const resp = await fetch("https://scanner.tradingview.com/india/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": BROWSER_UA,
        Origin: "https://in.tradingview.com",
        Referer: "https://in.tradingview.com/",
      },
      body: JSON.stringify({
        symbols: { tickers: Array.from(tvToInst.keys()), query: { types: [] } },
        columns: [
          "close",
          "open",
          "high",
          "low",
          "change",
          "change_abs",
          "volume",
        ],
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) {
      tvScannerBlockedUntil = Date.now() + 15_000;
      return out;
    }
    const payload = (await resp.json()) as {
      data?: Array<{ s?: string; d?: Array<number | null> }>;
    };
    for (const row of payload.data || []) {
      const inst = row.s ? tvToInst.get(row.s) : undefined;
      if (!inst || !Array.isArray(row.d)) continue;
      const close = Number(row.d[0]);
      if (!Number.isFinite(close) || close <= 0) continue;
      const open = Number(row.d[1]) || close;
      const high = Number(row.d[2]) || close;
      const low = Number(row.d[3]) || close;
      const changePct = Number(row.d[4]);
      const changeAbs = Number(row.d[5]);
      const volume = Number(row.d[6]) || 0;
      const prevClose = Number.isFinite(changeAbs)
        ? +(close - changeAbs).toFixed(2)
        : open;
      const change = Number.isFinite(changeAbs)
        ? +changeAbs.toFixed(2)
        : +(close - prevClose).toFixed(2);
      const finalChangePct = Number.isFinite(changePct)
        ? +changePct.toFixed(2)
        : prevClose > 0
          ? +((change / prevClose) * 100).toFixed(2)
          : 0;
      out.set(inst.symbol, {
        ltp: +close.toFixed(2),
        prevClose,
        open: +open.toFixed(2),
        high: +Math.max(high, close).toFixed(2),
        low: +Math.min(low, close).toFixed(2),
        change,
        changePct: finalChangePct,
        volume,
        source: "TradingView",
      });
    }
  } catch {
    tvScannerBlockedUntil = Date.now() + 15_000;
  }
  return out;
}

const TF_CONFIG: Record<
  string,
  { interval: string; range: string; limit: number; tvRes: string }
> = {
  "1m": { interval: "1m", range: "5d", limit: 360, tvRes: "1" },
  "3m": { interval: "2m", range: "5d", limit: 360, tvRes: "3" },
  "5m": { interval: "5m", range: "1mo", limit: 400, tvRes: "5" },
  "15m": { interval: "15m", range: "1mo", limit: 360, tvRes: "15" },
  "30m": { interval: "30m", range: "3mo", limit: 360, tvRes: "30" },
  "1h": { interval: "60m", range: "6mo", limit: 360, tvRes: "60" },
  "1D": { interval: "1d", range: "2y", limit: 365, tvRes: "1D" },
};

function formatCandleLabel(tsSec: number, tf: string): string {
  const d = new Date(tsSec * 1000);
  if (tf === "1D") {
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      timeZone: "Asia/Kolkata",
    });
  }
  const datePart = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
  return `${datePart} ${timePart}`;
}

function encodeTvPacket(fnName: string, params: unknown[]): string {
  const body = JSON.stringify({ m: fnName, p: params });
  return `~m~${body.length}~m~${body}`;
}

function parseTvFrames(raw: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let idx = 0;
  while (idx < raw.length) {
    if (raw.startsWith("~m~", idx)) {
      const lenEnd = raw.indexOf("~m~", idx + 3);
      if (lenEnd === -1) break;
      const len = Number(raw.slice(idx + 3, lenEnd));
      const payloadStart = lenEnd + 3;
      const payload = raw.slice(payloadStart, payloadStart + len);
      idx = payloadStart + len;
      if (payload && payload.startsWith("{")) {
        try {
          out.push(JSON.parse(payload) as Record<string, unknown>);
        } catch {
          // ignore malformed frame
        }
      }
    } else {
      idx++;
    }
  }
  return out;
}

// Same connection as github.com/Mathieu2301/Tradingview-API: the `ws` client lets us
// send the TradingView Origin header, which the built-in WebSocket cannot.
type TvSocketCtor = new (url: string, opts?: unknown) => WebSocket;
let tvSocketCtor: Promise<TvSocketCtor | null> | null = null;
function getTvSocketCtor(): Promise<TvSocketCtor | null> {
  tvSocketCtor ??= import("ws")
    .then(
      (m) =>
        ((m as { default?: unknown }).default ?? m) as unknown as TvSocketCtor,
    )
    .catch(() =>
      typeof WebSocket !== "undefined"
        ? (WebSocket as unknown as TvSocketCtor)
        : null,
    );
  return tvSocketCtor;
}

async function tryTradingViewChartHistory(
  inst: MarketInstrument,
  tf = "5m",
): Promise<{ quote: MarketQuote; candles: MarketCandle[] } | null> {
  if (
    process.env["VITEST"] ||
    typeof WebSocket === "undefined" ||
    inst.kind === "OPTION" ||
    Date.now() < tvWsBlockedUntil
  ) {
    return null;
  }
  const cfg = TF_CONFIG[tf] ?? TF_CONFIG["5m"]!;
  const tvSym = toTradingViewSymbol(inst);
  const barsTarget = cfg.limit;
  const sessionId = `cs_${Math.random().toString(36).slice(2, 12)}`;
  const TvSocket = await getTvSocketCtor();
  if (!TvSocket) return null;

  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;
    const rawBars: Array<{
      time: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }> = [];

    const finish = (
      res: { quote: MarketQuote; candles: MarketCandle[] } | null,
      _timedOutOrErr = false,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        // ignore close error
      }
      resolve(res);
    };

    const timer = setTimeout(() => {
      if (rawBars.length >= 20) {
        finalizeBars();
      } else {
        finish(null, true);
      }
    }, 3500);

    const finalizeBars = () => {
      if (!rawBars.length) {
        finish(null);
        return;
      }
      const dedup = new Map<number, (typeof rawBars)[number]>();
      for (const b of rawBars) {
        if (b.time > 0 && Number.isFinite(b.close) && b.close > 0) {
          dedup.set(b.time, b);
        }
      }
      const sorted = Array.from(dedup.values()).sort((a, b) => a.time - b.time);
      const sliced = sorted.slice(-barsTarget);
      if (sliced.length < 15) {
        finish(null);
        return;
      }
      const candles: MarketCandle[] = sliced.map((b, idx) => ({
        i: idx,
        time: b.time,
        label: formatCandleLabel(b.time, tf),
        open: +b.open.toFixed(2),
        high: +b.high.toFixed(2),
        low: +b.low.toFixed(2),
        close: +b.close.toFixed(2),
        volume: Math.max(0, Math.round(b.volume)),
      }));
      const lastBar = candles[candles.length - 1]!;
      const firstBar = candles[0]!;
      const cachedQ = quoteCache.get(inst.symbol)?.data;
      const prevClose = cachedQ?.prevClose || firstBar.open;
      const ltp = lastBar.close;
      const change = +(ltp - prevClose).toFixed(2);
      const changePct =
        prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
      const quote: MarketQuote = {
        symbol: inst.symbol,
        providerSymbol: inst.providerSymbol,
        name: inst.name,
        exchange: inst.exchange,
        kind: inst.kind,
        lot: inst.lot,
        ltp,
        prevClose,
        open: cachedQ?.open || lastBar.open,
        high:
          cachedQ?.high ||
          +Math.max(...candles.slice(-24).map((c) => c.high)).toFixed(2),
        low:
          cachedQ?.low ||
          +Math.min(...candles.slice(-24).map((c) => c.low)).toFixed(2),
        change,
        changePct,
        volume: cachedQ?.volume || lastBar.volume,
        source: "TradingView",
        marketStatus: getIndianMarketStatus(),
        updatedAt: new Date().toISOString(),
      };
      finish({ quote, candles });
    };

    try {
      ws = new TvSocket(
        "wss://data.tradingview.com/socket.io/websocket?type=chart",
        {
          origin: "https://www.tradingview.com",
        },
      );
      ws.onopen = () => {
        if (!ws) return;
        ws.send(encodeTvPacket("set_auth_token", ["unauthorized_user_token"]));
        ws.send(encodeTvPacket("chart_create_session", [sessionId, ""]));
        ws.send(
          encodeTvPacket("resolve_symbol", [
            sessionId,
            "sds_sym_1",
            `=${JSON.stringify({ symbol: tvSym, adjustment: "splits", session: "regular" })}`,
          ]),
        );
        ws.send(
          encodeTvPacket("create_series", [
            sessionId,
            "sds_1",
            "s1",
            "sds_sym_1",
            cfg.tvRes,
            barsTarget,
          ]),
        );
      };
      ws.onmessage = (evt) => {
        const txt = typeof evt.data === "string" ? evt.data : "";
        if (!txt) return;
        // Respond to TradingView heartbeats cleanly
        if (txt.includes("~h~")) {
          const hbMatch = txt.match(/~m~\d+~m~(~h~\d+)/);
          if (hbMatch && ws?.readyState === WebSocket.OPEN) {
            const p = hbMatch[1]!;
            ws.send(`~m~${p.length}~m~${p}`);
          }
        }
        const msgs = parseTvFrames(txt);
        for (const msg of msgs) {
          const method = String(msg["m"] || "");
          if (method === "timescale_update" || method === "du") {
            const params = msg["p"];
            if (
              Array.isArray(params) &&
              params[1] &&
              typeof params[1] === "object"
            ) {
              const sds = (
                params[1] as Record<string, { s?: Array<{ v?: number[] }> }>
              )["sds_1"];
              if (sds?.s && Array.isArray(sds.s)) {
                for (const item of sds.s) {
                  const v = item?.v;
                  if (Array.isArray(v) && v.length >= 5) {
                    rawBars.push({
                      time: Math.round(Number(v[0]) || 0),
                      open: Number(v[1]) || 0,
                      high: Number(v[2]) || 0,
                      low: Number(v[3]) || 0,
                      close: Number(v[4]) || 0,
                      volume: Number(v[5]) || 0,
                    });
                  }
                }
              }
            }
          }
          if (method === "series_completed") {
            finalizeBars();
            return;
          }
          if (method === "symbol_error" || method === "series_error") {
            finish(null);
            return;
          }
        }
      };
      ws.onerror = () => finish(null, true);
      ws.onclose = () => {
        if (!settled) {
          if (rawBars.length >= 20) finalizeBars();
          else finish(null, true);
        }
      };
    } catch {
      finish(null, true);
    }
  });
}

async function fetchYahooChart(
  inst: MarketInstrument,
  tf = "5m",
): Promise<{ quote: MarketQuote; candles: MarketCandle[] } | null> {
  const cfg = TF_CONFIG[tf] ?? {
    interval: "5m",
    range: "1mo",
    limit: 400,
    tvRes: "5",
  };
  const dedupeKey = `${inst.providerSymbol}:${cfg.interval}:${cfg.range}`;
  const existing = inflightYahoo.get(dedupeKey);
  if (existing) return existing;

  const task = (async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      inst.providerSymbol,
    )}?interval=${cfg.interval}&range=${cfg.range}`;
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(4200),
      });
      if (!resp.ok) return null;
      const payload = (await resp.json()) as {
        chart?: {
          result?: Array<{
            meta?: Record<string, unknown>;
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open?: Array<number | null>;
                high?: Array<number | null>;
                low?: Array<number | null>;
                close?: Array<number | null>;
                volume?: Array<number | null>;
              }>;
            };
          }>;
        };
      };
      const res = payload.chart?.result?.[0];
      if (!res?.meta) return null;
      const m = res.meta;
      if (inst.kind === "INDEX" && !process.env["VITEST"]) {
        const now = new Date();
        const istNow = new Date(now.getTime() + 5.5 * 3600 * 1000);
        const day = istNow.getUTCDay();
        const mins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
        if (
          day !== 0 &&
          day !== 6 &&
          mins >= 9 * 60 + 20 &&
          mins <= 15 * 60 + 30
        ) {
          const todayIst = getIstDateKey(now);
          const ctp = m["currentTradingPeriod"] as
            | {
                regular?: { start?: number; end?: number };
              }
            | undefined;
          const regEnd = Number(ctp?.regular?.end || 0);
          const regTime = Number(m["regularMarketTime"] || 0);
          const nowSec = Math.floor(now.getTime() / 1000);
          const regTimeIst =
            regTime > 0 ? getIstDateKey(new Date(regTime * 1000)) : "";
          if (
            (regEnd > 0 && regEnd < nowSec - 120) ||
            (regTimeIst && regTimeIst !== todayIst)
          ) {
            detectedClosedIstDates.add(todayIst);
            syncCachedQuoteMarketStatus("CLOSED");
          }
        }
      }
      const ts = res.timestamp || [];
      const q = res.indicators?.quote?.[0] || {};
      const candles: MarketCandle[] = [];
      let lastClose =
        Number(
          m["chartPreviousClose"] ??
            m["previousClose"] ??
            m["regularMarketPrice"],
        ) || 0;
      for (let idx = 0; idx < ts.length; idx++) {
        const o = q.open?.[idx];
        const h = q.high?.[idx];
        const l = q.low?.[idx];
        const c = q.close?.[idx];
        if (o == null || h == null || l == null || c == null) continue;
        lastClose = c;
        candles.push({
          i: candles.length,
          time: ts[idx] ?? 0,
          label: formatCandleLabel(ts[idx] ?? 0, tf),
          open: +o.toFixed(2),
          high: +h.toFixed(2),
          low: +l.toFixed(2),
          close: +c.toFixed(2),
          volume: Number(q.volume?.[idx] ?? 0),
        });
      }
      const ltp = Number(m["regularMarketPrice"]) || lastClose;
      const prevClose =
        Number(m["previousClose"] ?? m["chartPreviousClose"]) || ltp;
      const change = Number(m["fulldayChange"] ?? ltp - prevClose);
      const changePct = Number(
        m["regularMarketChangePercent"] ??
          m["fulldayChangePercent"] ??
          (prevClose ? (change / prevClose) * 100 : 0),
      );
      const firstBar = candles[0];
      const quote: MarketQuote = {
        symbol: inst.symbol,
        providerSymbol: inst.providerSymbol,
        name: String(m["longName"] || m["shortName"] || inst.name),
        exchange: inst.exchange,
        kind: inst.kind,
        lot: inst.lot,
        ltp: +ltp.toFixed(2),
        prevClose: +prevClose.toFixed(2),
        open: +Number(firstBar?.open ?? ltp).toFixed(2),
        high: +Number(
          m["regularMarketDayHigh"] ??
            (candles.length ? Math.max(...candles.map((b) => b.high)) : ltp),
        ).toFixed(2),
        low: +Number(
          m["regularMarketDayLow"] ??
            (candles.length ? Math.min(...candles.map((b) => b.low)) : ltp),
        ).toFixed(2),
        change: +change.toFixed(2),
        changePct: +changePct.toFixed(2),
        volume: Number(m["regularMarketVolume"] ?? 0),
        source: inst.exchange === "BSE" ? "BSE/Yahoo" : "NSE/Yahoo",
        marketStatus: getIndianMarketStatus(),
        updatedAt:
          Number.isFinite(Number(m["regularMarketTime"])) &&
          Number(m["regularMarketTime"]) > 0
            ? new Date(Number(m["regularMarketTime"]) * 1000).toISOString()
            : new Date().toISOString(),
      };
      const sliced = candles.slice(-cfg.limit);
      const cleaned = cleanIntradayFlatBars(sliced, tf).map((b, idx) => ({
        ...b,
        i: idx,
      }));
      return { quote, candles: cleaned };
    } catch {
      return null;
    } finally {
      inflightYahoo.delete(dedupeKey);
    }
  })();

  inflightYahoo.set(dedupeKey, task);
  return task;
}

export function cleanIntradayFlatBars(
  candles: MarketCandle[],
  tf = "5m",
): MarketCandle[] {
  if (tf === "1D" || !Array.isArray(candles) || candles.length < 3) {
    return candles;
  }
  const isZeroRange = (b: MarketCandle) =>
    Math.abs(b.high - b.low) < 1e-6 && Math.abs(b.open - b.close) < 1e-6;
  const isFlatZeroVol = (b: MarketCandle) =>
    isZeroRange(b) && (!b.volume || b.volume <= 0);

  const out: MarketCandle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const b = candles[i]!;
    if (!Number.isFinite(b.close) || b.close <= 0) continue;
    const prev = out[out.length - 1];
    if (!prev) {
      out.push(b);
      continue;
    }
    if (isZeroRange(b)) {
      const tol = Math.max(0.02, prev.close * 0.00001);
      if (isFlatZeroVol(b) && Math.abs(b.close - prev.close) <= tol) {
        // Skip redundant zero-range, zero-volume settlement/fill bars (e.g. Yahoo 15:15–15:30 IST padding)
        continue;
      }
      const dIst = new Date(b.time * 1000 + 5.5 * 3600 * 1000);
      const mins = dIst.getUTCHours() * 60 + dIst.getUTCMinutes();
      if (mins >= 15 * 60 + 15 && mins <= 15 * 60 + 35) {
        if (Math.abs(b.close - prev.close) <= tol) {
          continue;
        }
        // Closing auction/VWAP print differs from prior close: connect open from previous real close
        const o = prev.close;
        const c = b.close;
        out.push({
          ...b,
          open: o,
          high: +Math.max(o, c).toFixed(2),
          low: +Math.min(o, c).toFixed(2),
        });
        continue;
      }
    }
    out.push(b);
  }

  const minKeep = Math.min(20, Math.floor(candles.length * 0.25));
  if (out.length < minKeep) {
    return candles;
  }
  return out.map((b, idx) => ({ ...b, i: idx }));
}

export async function firstAvailableChart<T>(
  providers: Promise<T | null>[],
): Promise<T | null> {
  try {
    return await Promise.any(
      providers.map(async (provider) => {
        const result = await provider;
        if (result === null) throw new Error("Chart provider unavailable");
        return result;
      }),
    );
  } catch {
    return null;
  }
}

async function fetchUnifiedChart(
  inst: MarketInstrument,
  tf = "5m",
): Promise<{ quote: MarketQuote; candles: MarketCandle[] } | null> {
  // Start both providers concurrently, but prefer Yahoo when valid because
  // unauthenticated TradingView WS sessions truncate NSE bars at 15:10 IST.
  const yahooPromise = fetchYahooChart(inst, tf);
  const tvPromise = tryTradingViewChartHistory(inst, tf);
  const yahoo = await yahooPromise;
  if (yahoo && yahoo.candles.length >= 15) {
    return yahoo;
  }
  const tv = await tvPromise;
  return tv || yahoo;
}

function deriveOptionQuoteFromUnderlying(
  inst: MarketInstrument,
  base: MarketQuote,
): MarketQuote {
  const strike = inst.strike || Math.round(base.ltp / 50) * 50;
  const optType = inst.optionType || "CE";
  const vix = quoteCache.get("INDIAVIX")?.data.ltp;
  const iv =
    base.kind === "INDEX" ? (vix && vix > 8 && vix < 45 ? vix : 14.5) : 24;
  const ltp = computeOptionPremium(base.ltp, strike, optType, iv);
  const prevClose = computeOptionPremium(
    base.prevClose || base.ltp,
    strike,
    optType,
    iv,
  );
  const open = computeOptionPremium(base.open || base.ltp, strike, optType, iv);
  const pHi = computeOptionPremium(base.high || base.ltp, strike, optType, iv);
  const pLo = computeOptionPremium(base.low || base.ltp, strike, optType, iv);
  const high = +Math.max(ltp, open, pHi, pLo).toFixed(2);
  const low = +Math.min(ltp, open, pHi, pLo).toFixed(2);
  const change = +(ltp - prevClose).toFixed(2);
  const changePct =
    prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
  return {
    symbol: inst.symbol,
    providerSymbol: inst.providerSymbol,
    name: inst.name,
    exchange: inst.exchange,
    kind: "OPTION",
    lot: inst.lot,
    ltp,
    prevClose,
    open,
    high,
    low,
    change,
    changePct,
    volume: Math.max(1000, Math.round((base.volume || 50000) * 0.12)),
    source: "Option-Chain",
    marketStatus: base.marketStatus || getIndianMarketStatus(),
    updatedAt: new Date().toISOString(),
    ...(inst.underlyingSymbol
      ? { underlyingSymbol: inst.underlyingSymbol }
      : {}),
    strike,
    optionType: optType,
  };
}

function buildDerivedOptionChart(
  inst: MarketInstrument,
  baseQuote: MarketQuote,
  baseCandles: MarketCandle[],
  isBaseline = false,
): { quote: MarketQuote; candles: MarketCandle[]; isBaseline: boolean } {
  const optQuote = deriveOptionQuoteFromUnderlying(inst, baseQuote);
  const strike =
    optQuote.strike || inst.strike || Math.round(baseQuote.ltp / 50) * 50;
  const optType = optQuote.optionType || inst.optionType || "CE";
  const vix = quoteCache.get("INDIAVIX")?.data.ltp;
  const iv =
    baseQuote.kind === "INDEX" ? (vix && vix > 8 && vix < 45 ? vix : 14.5) : 24;

  const optCandles: MarketCandle[] = baseCandles.map((b) => {
    const o = computeOptionPremium(b.open, strike, optType, iv);
    const c = computeOptionPremium(b.close, strike, optType, iv);
    const pHi = computeOptionPremium(b.high, strike, optType, iv);
    const pLo = computeOptionPremium(b.low, strike, optType, iv);
    return {
      i: b.i,
      time: b.time,
      label: b.label,
      open: o,
      high: +Math.max(o, c, pHi, pLo).toFixed(2),
      low: +Math.min(o, c, pHi, pLo).toFixed(2),
      close: c,
      volume: Math.max(100, Math.round((b.volume || 2500) * 0.18)),
    };
  });

  if (optCandles.length) {
    const last = optCandles[optCandles.length - 1]!;
    last.close = optQuote.ltp;
    last.high = +Math.max(last.high, last.open, last.close).toFixed(2);
    last.low = +Math.min(last.low, last.open, last.close).toFixed(2);
  }

  return { quote: optQuote, candles: optCandles, isBaseline };
}

const FALLBACK_PRICES: Record<string, number> = {
  NIFTY: 25450,
  BANKNIFTY: 62350,
  SENSEX: 82600,
  FINNIFTY: 28280,
  MIDCPNIFTY: 17870,
  NIFTYNEXT50: 68500,
  BANKEX: 70170,
  INDIAVIX: 14.2,
  RELIANCE: 1345,
  "RELIANCE.BO": 1345,
  HDFCBANK: 1750,
  "HDFCBANK.BO": 1750,
  TCS: 3800,
  "TCS.BO": 3800,
  INFY: 1850,
  "INFY.BO": 1850,
  ICICIBANK: 1300,
  SBIN: 810,
  "SBIN.BO": 810,
  TATAMOTORS: 260,
  "TATAMOTORS.BO": 260,
  ITC: 485,
  BHARTIARTL: 1620,
  AXISBANK: 1150,
  KOTAKBANK: 1890,
  LT: 3650,
  BAJFINANCE: 7000,
  ADANIENT: 2450,
  HAL: 4320,
  BEL: 310,
  ETERNAL: 255,
};

function seedSymbolHash(sym: string): number {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildBaselineQuote(inst: MarketInstrument): MarketQuote {
  const baseSpot =
    OPTION_SPECS[inst.symbol]?.fallbackSpot ??
    FALLBACK_PRICES[inst.symbol] ??
    1000 + (seedSymbolHash(inst.symbol) % 1500);
  const hash = seedSymbolHash(inst.symbol);
  const driftPct = ((hash % 180) - 70) / 100; // -0.70% to +1.09%
  const prevClose = +(baseSpot / (1 + driftPct / 100)).toFixed(2);
  const ltp = +baseSpot.toFixed(2);
  const change = +(ltp - prevClose).toFixed(2);
  const changePct =
    prevClose > 0 ? +((change / prevClose) * 100).toFixed(2) : 0;
  return {
    symbol: inst.symbol,
    providerSymbol: inst.providerSymbol,
    name: inst.name,
    exchange: inst.exchange,
    kind: inst.kind,
    lot: inst.lot,
    ltp,
    prevClose,
    open: +(prevClose * (1 + driftPct * 0.002)).toFixed(2),
    high: +(Math.max(ltp, prevClose) * 1.004).toFixed(2),
    low: +(Math.min(ltp, prevClose) * 0.996).toFixed(2),
    change,
    changePct,
    volume: 120000 + (hash % 850000),
    source: "Cache",
    marketStatus: getIndianMarketStatus(),
    updatedAt: new Date().toISOString(),
  };
}

function buildBaselineCandles(
  inst: MarketInstrument,
  tf: string,
): { quote: MarketQuote; candles: MarketCandle[]; isBaseline: boolean } {
  const quote = quoteCache.get(inst.symbol)?.data ?? buildBaselineQuote(inst);
  const count = 240;
  const stepSec =
    tf === "1m"
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
  const timestamps: number[] = [];
  if (tf === "1D") {
    // Walk backward across weekday trading sessions
    let cursorSec = Math.floor(Date.now() / 86400000) * 86400 + 4 * 3600 + 1800; // ~10:00 IST
    while (timestamps.length < count) {
      const istDay = new Date(cursorSec * 1000 + 5.5 * 3600 * 1000).getUTCDay();
      if (istDay !== 0 && istDay !== 6) timestamps.push(cursorSec);
      cursorSec -= 86400;
    }
    timestamps.reverse();
  } else {
    // Build ascending IST market-hour bars (09:15 to 15:30 IST) across multiple previous sessions
    let cursorSec = Math.floor(Date.now() / (stepSec * 1000)) * stepSec;
    const istNowMs = Date.now() + 5.5 * 3600 * 1000;
    const istNow = new Date(istNowMs);
    const nowDay = istNow.getUTCDay();
    const nowMins = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
    if (
      nowDay === 0 ||
      nowDay === 6 ||
      nowMins < 9 * 60 + 15 ||
      nowMins > 15 * 60 + 30
    ) {
      // Snap cursor back to latest 15:30 IST weekday session close
      while (true) {
        const dIst = new Date(cursorSec * 1000 + 5.5 * 3600 * 1000);
        const day = dIst.getUTCDay();
        const mins = dIst.getUTCHours() * 60 + dIst.getUTCMinutes();
        if (
          day !== 0 &&
          day !== 6 &&
          mins >= 9 * 60 + 15 &&
          mins <= 15 * 60 + 30
        )
          break;
        cursorSec -= stepSec;
      }
    }
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

  // Realistic per-bar volatility (~0.8% daily, scaled by sqrt of bar length over a
  // 6.25h session) and built backwards from the LTP so the last bar never jumps.
  const seed = seedSymbolHash(inst.symbol + tf);
  const sigma = 0.008 * Math.sqrt(Math.min(1, stepSec / 22500));
  const n = timestamps.length;
  const opens: number[] = new Array(n);
  const closes: number[] = new Array(n);
  let next = quote.ltp;
  for (let i = n - 1; i >= 0; i--) {
    const wave =
      Math.sin((i + (seed % 17)) * 0.34) * 0.6 +
      Math.cos((i + seed) * 0.17) * 0.4;
    closes[i] = next;
    opens[i] = next / (1 + wave * sigma);
    next = opens[i]!;
  }
  const candles: MarketCandle[] = [];
  for (let i = 0; i < n; i++) {
    const open = +opens[i]!.toFixed(2);
    const close = +closes[i]!.toFixed(2);
    const spread = Math.max(0.05, open * sigma * 0.5);
    const high = +(
      Math.max(open, close) +
      spread * (0.3 + ((i + seed) % 5) * 0.15)
    ).toFixed(2);
    const low = +(
      Math.min(open, close) -
      spread * (0.3 + ((i + seed + 2) % 5) * 0.15)
    ).toFixed(2);
    const ts = timestamps[i]!;
    candles.push({
      i,
      time: ts,
      label: formatCandleLabel(ts, tf),
      open,
      high,
      low,
      close,
      volume: 15000 + ((seed + i * 7919) % 45000),
    });
  }
  return { quote, candles, isBaseline: true };
}

async function refreshBaseInstruments(
  stale: MarketInstrument[],
): Promise<void> {
  if (!stale.length) return;
  const wantsNseIdx = stale.some(
    (i) => i.exchange === "NSE" && i.kind === "INDEX",
  );
  const wantsSensex = stale.some((i) => i.symbol === "SENSEX");

  const fastMcIndexes = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"].filter(
    (s) => stale.some((i) => i.symbol === s),
  );
  const [tvMap, nseMap, legacyIndexMap, bseSensex, mcEntries] =
    await Promise.all([
      tryTradingViewScannerQuotes(stale),
      wantsNseIdx
        ? tryNseIndices()
        : Promise.resolve(new Map<string, Partial<MarketQuote>>()),
      wantsNseIdx
        ? tryStockMarketIndiaIndices()
        : Promise.resolve(new Map<string, Partial<MarketQuote>>()),
      wantsSensex ? tryBseSensex() : Promise.resolve(null),
      Promise.all(
        fastMcIndexes.map(
          async (s) => [s, await tryFastIndianIndexQuote(s)] as const,
        ),
      ),
    ]);
  const mcMap = new Map(mcEntries.filter(([, v]) => v !== null));

  await Promise.all(
    stale.map(async (inst) => {
      let direct =
        tvMap.get(inst.symbol) ||
        mcMap.get(inst.symbol) ||
        (inst.symbol === "SENSEX" ? bseSensex : nseMap.get(inst.symbol)) ||
        legacyIndexMap.get(inst.symbol);
      if (!direct) {
        direct = (await tryStockMarketIndiaEquity(inst)) || undefined;
      }
      const chart = direct?.ltp ? null : await fetchYahooChart(inst, "5m");
      const statusNow = getIndianMarketStatus();
      const prevCached = quoteCache.get(inst.symbol)?.data;
      if (chart) {
        const merged: MarketQuote = direct?.ltp
          ? {
              ...chart.quote,
              ...direct,
              ltp: +Number(direct.ltp).toFixed(2),
              change: +Number(direct.change ?? chart.quote.change).toFixed(2),
              changePct: +Number(
                direct.changePct ?? chart.quote.changePct,
              ).toFixed(2),
              source: direct.source || chart.quote.source,
              marketStatus: statusNow,
              updatedAt:
                statusNow === "CLOSED" &&
                prevCached &&
                prevCached.source !== "Cache" &&
                prevCached.ltp === +Number(direct.ltp).toFixed(2)
                  ? prevCached.updatedAt
                  : new Date().toISOString(),
            }
          : { ...chart.quote, marketStatus: statusNow };
        quoteCache.set(inst.symbol, { data: merged, ts: Date.now() });
        return;
      }
      if (direct?.ltp) {
        const nextLtp = +Number(direct.ltp).toFixed(2);
        const q: MarketQuote = {
          symbol: inst.symbol,
          providerSymbol: inst.providerSymbol,
          name: inst.name,
          exchange: inst.exchange,
          kind: inst.kind,
          lot: inst.lot,
          ltp: nextLtp,
          prevClose: +Number(direct.prevClose ?? direct.ltp).toFixed(2),
          open: +Number(direct.open ?? direct.ltp).toFixed(2),
          high: +Number(direct.high ?? direct.ltp).toFixed(2),
          low: +Number(direct.low ?? direct.ltp).toFixed(2),
          change: +Number(direct.change ?? 0).toFixed(2),
          changePct: +Number(direct.changePct ?? 0).toFixed(2),
          volume: Number(direct.volume ?? 0),
          source: direct.source || inst.exchange,
          marketStatus: statusNow,
          updatedAt:
            statusNow === "CLOSED" &&
            prevCached &&
            prevCached.source !== "Cache" &&
            prevCached.ltp === nextLtp
              ? prevCached.updatedAt
              : new Date().toISOString(),
        };
        quoteCache.set(inst.symbol, { data: q, ts: Date.now() });
      }
    }),
  );
}

export async function getQuotes(rawSymbols?: string[]): Promise<{
  quotes: MarketQuote[];
  marketStatus: "LIVE" | "CLOSED";
  fetchedAt: string;
}> {
  const list =
    rawSymbols && rawSymbols.length
      ? rawSymbols.map((s) => resolveInstrument(s))
      : MARKET_INSTRUMENTS;

  const baseList: MarketInstrument[] = [];
  const baseSeen = new Set<string>();

  for (const inst of list) {
    if (inst.kind === "OPTION" && inst.underlyingSymbol) {
      const u = resolveInstrument(inst.underlyingSymbol);
      if (!baseSeen.has(u.symbol)) {
        baseSeen.add(u.symbol);
        baseList.push(u);
      }
    } else if (!baseSeen.has(inst.symbol)) {
      baseSeen.add(inst.symbol);
      baseList.push(inst);
    }
  }

  const now = Date.now();
  const ttl = getQuoteTtlMs();
  const coldMissing: MarketInstrument[] = [];
  const staleCached: MarketInstrument[] = [];
  const results = new Map<string, MarketQuote>();

  for (const inst of baseList) {
    const cached = quoteCache.get(inst.symbol);
    if (cached) {
      results.set(inst.symbol, cached.data);
      if (now - cached.ts >= ttl) staleCached.push(inst);
    } else {
      coldMissing.push(inst);
    }
  }

  // Trigger non-blocking background refresh for any stale cached entries (SWR)
  if (staleCached.length && !inflightQuoteBatch) {
    inflightQuoteBatch = refreshBaseInstruments(staleCached).finally(() => {
      inflightQuoteBatch = null;
    });
  }

  scheduleCorePrewarm();
  if (
    !process.env["VITEST"] &&
    getIndianMarketStatus() === "LIVE" &&
    Date.now() - lastHolidayProbeTs >= 60_000
  ) {
    lastHolidayProbeTs = Date.now();
    fetchYahooChart(resolveInstrument("NIFTY"), "5m").catch(() => {});
  }
  // Only wait (up to COLD_RACE_MS) on truly cold symbols not yet in cache
  if (coldMissing.length) {
    const batch = refreshBaseInstruments(coldMissing);
    await Promise.race([
      batch,
      new Promise<void>((r) => setTimeout(r, COLD_RACE_MS)),
    ]);
    for (const inst of coldMissing) {
      const fresh = quoteCache.get(inst.symbol);
      if (fresh) {
        results.set(inst.symbol, fresh.data);
      }
    }
  }

  const currentStatus = getIndianMarketStatus();
  for (const inst of list) {
    if (
      inst.kind === "OPTION" &&
      inst.underlyingSymbol &&
      !results.has(inst.symbol)
    ) {
      const baseQuote = results.get(inst.underlyingSymbol);
      if (baseQuote && baseQuote.ltp > 0) {
        const derived = deriveOptionQuoteFromUnderlying(inst, baseQuote);
        results.set(inst.symbol, derived);
        quoteCache.set(inst.symbol, { data: derived, ts: Date.now() });
      }
    }
  }

  return {
    quotes: list
      .map((i) => results.get(i.symbol))
      .filter((q): q is MarketQuote => !!q)
      .map((q) =>
        q.marketStatus === currentStatus
          ? q
          : { ...q, marketStatus: currentStatus },
      ),
    marketStatus: currentStatus,
    fetchedAt: new Date().toISOString(),
  };
}

function hasKnownFallbackSpot(inst: MarketInstrument): boolean {
  return Boolean(
    INSTRUMENT_MAP.has(inst.symbol) ||
    OPTION_SPECS[inst.symbol] ||
    FALLBACK_PRICES[inst.symbol],
  );
}

export async function getCandles(
  rawSymbol: string,
  tf = "5m",
): Promise<{
  symbol: string;
  tf: string;
  quote: MarketQuote | null;
  candles: MarketCandle[];
  marketStatus: "LIVE" | "CLOSED";
  isBaseline?: boolean;
}> {
  const inst = resolveInstrument(rawSymbol);
  const normTf = TF_CONFIG[tf] ? tf : "5m";
  const key = `${inst.symbol}:${normTf}`;
  const ttl = getCandleTtlMs();
  const cached = candleCache.get(key);

  if (inst.kind === "OPTION" && inst.underlyingSymbol) {
    if (cached && Date.now() - cached.ts < ttl && !cached.data.isBaseline) {
      return {
        symbol: inst.symbol,
        tf: normTf,
        quote: cached.data.quote,
        candles: cached.data.candles,
        marketStatus: getIndianMarketStatus(),
        isBaseline: Boolean(cached.data.isBaseline),
      };
    }

    const baseChart = await getCandles(inst.underlyingSymbol, normTf);
    if (baseChart.candles.length && baseChart.quote?.ltp) {
      const derived = buildDerivedOptionChart(
        inst,
        baseChart.quote,
        baseChart.candles,
        Boolean(baseChart.isBaseline),
      );
      candleCache.set(key, {
        data: derived,
        ts: Date.now(),
      });
      quoteCache.set(inst.symbol, { data: derived.quote, ts: Date.now() });
      return {
        symbol: inst.symbol,
        tf: normTf,
        quote: derived.quote,
        candles: derived.candles,
        marketStatus: baseChart.marketStatus,
        isBaseline: derived.isBaseline,
      };
    }

    if (cached) {
      return {
        symbol: inst.symbol,
        tf: normTf,
        quote: cached.data.quote,
        candles: cached.data.candles,
        marketStatus: getIndianMarketStatus(),
        isBaseline: Boolean(cached.data.isBaseline),
      };
    }

    return {
      symbol: inst.symbol,
      tf: normTf,
      quote: null,
      candles: [],
      marketStatus: getIndianMarketStatus(),
      isBaseline: false,
    };
  }

  if (cached) {
    const needsUpgrade =
      cached.data.isBaseline || Date.now() - cached.ts >= ttl;
    if (needsUpgrade && !inflightCandleKeys.has(key)) {
      inflightCandleKeys.add(key);
      fetchUnifiedChart(inst, normTf)
        .then((fetched) => {
          if (fetched) {
            candleCache.set(key, {
              data: { ...fetched, isBaseline: false },
              ts: Date.now(),
            });
            upsertQuoteCacheIfFresher(inst.symbol, fetched.quote);
          }
        })
        .finally(() => {
          inflightCandleKeys.delete(key);
        });
    }
    const freshQ = quoteCache.get(inst.symbol)?.data;
    const rawResolvedQuote =
      freshQ && freshQ.source !== "Cache" ? freshQ : cached.data.quote;
    const curStatus = getIndianMarketStatus();
    const resolvedQuote =
      rawResolvedQuote && rawResolvedQuote.marketStatus !== curStatus
        ? { ...rawResolvedQuote, marketStatus: curStatus }
        : rawResolvedQuote;
    return {
      symbol: inst.symbol,
      tf: normTf,
      quote: resolvedQuote,
      candles: cached.data.candles,
      marketStatus: curStatus,
      isBaseline: Boolean(cached.data.isBaseline),
    };
  }

  scheduleCorePrewarm();
  inflightCandleKeys.add(key);
  const fetchPromise = fetchUnifiedChart(inst, normTf)
    .then((fetched) => {
      if (fetched) {
        candleCache.set(key, {
          data: { ...fetched, isBaseline: false },
          ts: Date.now(),
        });
        upsertQuoteCacheIfFresher(inst.symbol, fetched.quote);
      }
      return fetched;
    })
    .finally(() => {
      inflightCandleKeys.delete(key);
    });

  const fastBudgetMs = hasKnownFallbackSpot(inst) ? 300 : 4500;
  const fetched = await Promise.race([
    fetchPromise,
    new Promise<null>((r) => setTimeout(() => r(null), fastBudgetMs)),
  ]);
  if (fetched) {
    return {
      symbol: inst.symbol,
      tf: normTf,
      quote: fetched.quote,
      candles: fetched.candles,
      marketStatus: getIndianMarketStatus(),
      isBaseline: false,
    };
  }

  if (hasKnownFallbackSpot(inst)) {
    const baseline = buildBaselineCandles(inst, normTf);
    candleCache.set(key, { data: baseline, ts: Date.now() });
    return {
      symbol: inst.symbol,
      tf: normTf,
      quote: baseline.quote,
      candles: baseline.candles,
      marketStatus: getIndianMarketStatus(),
      isBaseline: true,
    };
  }

  return {
    symbol: inst.symbol,
    tf: normTf,
    quote: null,
    candles: [],
    marketStatus: getIndianMarketStatus(),
    isBaseline: false,
  };
}

async function generateOptionMatchesForQuery(
  queryUpper: string,
): Promise<MarketInstrument[]> {
  const cleanTokens = queryUpper
    .replace(/[^A-Z0-9&.]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const exactOpt = parseOptionSymbol(queryUpper);

  const wantsCe =
    cleanTokens.includes("CE") ||
    cleanTokens.includes("CALL") ||
    cleanTokens.some((t) => /^\d*CE$/.test(t));
  const wantsPe =
    cleanTokens.includes("PE") ||
    cleanTokens.includes("PUT") ||
    cleanTokens.some((t) => /^\d*PE$/.test(t));
  const wantsOptKeyword =
    Boolean(exactOpt) ||
    wantsCe ||
    wantsPe ||
    cleanTokens.some(
      (t) =>
        t === "OPTION" || t === "OPTIONS" || t === "OPT" || /^\d{3,6}$/.test(t),
    );

  let targetUnderlying: string | null = exactOpt?.underlyingSymbol || null;
  if (!targetUnderlying) {
    for (const tok of cleanTokens) {
      const mapped = SEARCH_ALIASES[tok] || tok;
      if (OPTION_SPECS[mapped] || INSTRUMENT_MAP.has(mapped)) {
        targetUnderlying = mapped;
        break;
      }
    }
  }

  const explicitStrikeMatch = queryUpper.match(/\b(\d{3,6})\b/);
  const explicitStrike =
    exactOpt?.strike ||
    (explicitStrikeMatch ? Number(explicitStrikeMatch[1]) : null);

  const underlyingsToBuild: string[] = [];
  if (targetUnderlying) {
    underlyingsToBuild.push(targetUnderlying);
  } else if (wantsOptKeyword) {
    underlyingsToBuild.push("NIFTY", "BANKNIFTY", "SENSEX");
  } else {
    return [];
  }

  const missingSpots = underlyingsToBuild.filter(
    (u) => !quoteCache.get(u)?.data?.ltp,
  );
  if (missingSpots.length) {
    await Promise.race([
      getQuotes(missingSpots).catch(() => {}),
      new Promise((r) => setTimeout(r, 900)),
    ]);
  }

  const out: MarketInstrument[] = [];
  if (exactOpt) out.push(exactOpt);

  const seen = new Set(out.map((o) => o.symbol));
  for (const under of underlyingsToBuild) {
    const cachedSpot =
      quoteCache.get(under)?.data?.ltp ||
      OPTION_SPECS[under]?.fallbackSpot ||
      25000;
    const { step } = getOptionLotAndStep(under, cachedSpot);
    const atm = Math.round(cachedSpot / step) * step;

    const strikes = explicitStrike
      ? [explicitStrike, explicitStrike - step, explicitStrike + step]
      : under === targetUnderlying
        ? [atm - step, atm, atm + step]
        : [atm, atm + step];

    const types: Array<"CE" | "PE"> =
      wantsCe && !wantsPe
        ? ["CE"]
        : wantsPe && !wantsCe
          ? ["PE"]
          : ["CE", "PE"];
    for (const st of strikes) {
      if (st <= 0) continue;
      for (const tp of types) {
        const inst = buildOptionInstrument(under, st, tp);
        if (!seen.has(inst.symbol)) {
          seen.add(inst.symbol);
          out.push(inst);
        }
      }
    }
  }

  return out.slice(0, 10);
}

export async function searchSymbols(
  query: string,
): Promise<MarketInstrument[]> {
  const q = String(query || "").trim();
  if (!q)
    return [
      ...MARKET_INSTRUMENTS,
      ...(await generateOptionMatchesForQuery("OPTION")),
    ];
  const upper = q.toUpperCase();
  const resolvedAlias = SEARCH_ALIASES[upper] || upper;
  const tokens = resolvedAlias.split(/\s+/).filter(Boolean);

  const firstToken = tokens[0];
  const isPureOptionTokenQuery =
    tokens.length === 1 &&
    firstToken !== undefined &&
    ["CE", "PE", "CALL", "PUT", "OPT", "OPTION", "OPTIONS"].includes(
      firstToken,
    );

  const localMatches = isPureOptionTokenQuery
    ? []
    : MARKET_INSTRUMENTS.filter((i) => {
        const symUp = i.symbol.toUpperCase();
        const nameUp = i.name.toUpperCase();
        return (
          symUp.includes(resolvedAlias) ||
          nameUp.includes(resolvedAlias) ||
          tokens.every(
            (t) => t.length >= 2 && (symUp.includes(t) || nameUp.includes(t)),
          )
        );
      });

  const optionPromise = generateOptionMatchesForQuery(upper);

  const shouldSearchYahoo =
    !isPureOptionTokenQuery && !parseOptionSymbol(upper);
  const yahooPromise = (async (): Promise<MarketInstrument[]> => {
    if (!shouldSearchYahoo) return [];
    const searchTerm =
      SEARCH_ALIASES[upper] ||
      q.replace(/\b(CE|PE|CALL|PUT|OPTION|OPTIONS)\b/gi, "").trim() ||
      q;
    const searchTimeoutMs = localMatches.length > 0 ? 500 : 1800;
    try {
      const resp = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchTerm)}&region=IN&lang=en-IN&quotesCount=15`,
        {
          headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
          signal: AbortSignal.timeout(searchTimeoutMs),
        },
      );
      if (!resp.ok) return [];
      const data = (await resp.json()) as {
        quotes?: Array<{
          symbol?: string;
          shortname?: string;
          longname?: string;
          exchange?: string;
          quoteType?: string;
        }>;
      };
      const remote: MarketInstrument[] = [];
      for (const item of data.quotes || []) {
        const sym = String(item.symbol || "").toUpperCase();
        if (
          !sym.endsWith(".NS") &&
          !sym.endsWith(".BO") &&
          !sym.startsWith("^NSE") &&
          sym !== "^BSESN"
        ) {
          continue;
        }
        const isBse = sym.endsWith(".BO") || sym === "^BSESN";
        remote.push({
          symbol: sym.endsWith(".NS") ? sym.replace(/\.NS$/, "") : sym,
          providerSymbol: sym,
          name: String(item.longname || item.shortname || sym),
          exchange: isBse ? "BSE" : "NSE",
          kind: item.quoteType === "INDEX" ? "INDEX" : "EQUITY",
          lot: 1,
        });
      }
      return remote;
    } catch {
      return [];
    }
  })();

  const [optionMatches, remoteMatches] = await Promise.all([
    optionPromise,
    yahooPromise,
  ]);

  const merged: MarketInstrument[] = [];
  const seen = new Set<string>();
  const isSpecificOptionQuery =
    Boolean(parseOptionSymbol(upper)) ||
    /\b(CE|PE|CALL|PUT|OPTION|OPTIONS)\b/.test(upper) ||
    /\b\d{3,6}\b/.test(upper);

  const ordered = isSpecificOptionQuery
    ? [...optionMatches, ...localMatches, ...remoteMatches]
    : [...localMatches, ...remoteMatches, ...optionMatches];

  for (const item of ordered) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    merged.push(item);
    if (merged.length >= 18) break;
  }

  return merged;
}

export function getDefaultOptionSymbols(): string[] {
  return CORE_OPTION_UNDERLYINGS.slice(0, 3).flatMap((u) => {
    const spec = OPTION_SPECS[u];
    const spot = quoteCache.get(u)?.data?.ltp || spec?.fallbackSpot || 25000;
    const step = spec?.step || 50;
    const atm = Math.round(spot / step) * step;
    return [`${u}${atm}CE`, `${u}${atm}PE`];
  });
}

if (typeof process !== "undefined" && !process.env["VITEST"]) {
  scheduleCorePrewarm();
}
