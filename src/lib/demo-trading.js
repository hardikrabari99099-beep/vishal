// Sample (demo) trading data for the trader dashboard UI.
// Pure & deterministic — no network, no backend. Every screen that uses it shows a "Sample data" label.

export const INSTRUMENTS = [
  { symbol: "NIFTY", name: "NIFTY 50", price: 24350, lot: 75 },
  { symbol: "BANKNIFTY", name: "BANK NIFTY", price: 52180, lot: 30 },
  { symbol: "SENSEX", name: "SENSEX", price: 80120, lot: 20 },
];

export const TIMEFRAMES = ["1m", "5m", "15m", "1h", "1D"];

/** Small seeded PRNG so sample data is stable between renders. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** OHLC candles for an instrument + timeframe. */
export function makeCandles(symbol, tf = "5m", n = 60) {
  const inst = INSTRUMENTS.find((i) => i.symbol === symbol) || INSTRUMENTS[0];
  const r = rng(hash(symbol + tf));
  const vol =
    inst.price *
    ({ "1m": 0.0008, "5m": 0.0016, "15m": 0.0025, "1h": 0.004, "1D": 0.01 }[
      tf
    ] || 0.002);
  let close = inst.price * (0.985 + r() * 0.01);
  const out = [];
  for (let i = 0; i < n; i++) {
    const open = close;
    close = open + (r() - 0.47) * vol * 2;
    const high = Math.max(open, close) + r() * vol;
    const low = Math.min(open, close) - r() * vol;
    out.push({ i, open, high, low, close });
  }
  return out;
}

export const ACCOUNT = {
  trader_id: "IF-SAMPLE-1024",
  account_id: "ACC-SAMPLE-5001",
  product: "Standard Challenge",
  starting_capital: 500000,
  balance: 523450,
  equity: 525910,
  daily_pnl: 4280,
  profit_target: 40000,
  daily_loss_limit: 15000,
  daily_loss_used: 3200,
  overall_loss_limit: 50000,
  max_drawdown_used: 9800,
  max_trades_per_day: 10,
  trades_today: 4,
  min_trading_days: 10,
  trading_days_done: 6,
  total_days: 30,
  days_elapsed: 12,
  accuracy: 58,
  profit_split: 70,
  status: "Active",
};

/** Evaluation maths used by the progress screens. */
export function evaluation(a = ACCOUNT) {
  const pnl = a.balance - a.starting_capital;
  const progress = Math.max(0, Math.min(100, (pnl / a.profit_target) * 100));
  return {
    pnl,
    progress: Math.round(progress),
    remaining_target: Math.max(0, a.profit_target - pnl),
    remaining_days: Math.max(0, a.min_trading_days - a.trading_days_done),
    daily_loss_left: Math.max(0, a.daily_loss_limit - a.daily_loss_used),
    overall_loss_left: Math.max(0, a.overall_loss_limit - a.max_drawdown_used),
    drawdown_pct: +((a.max_drawdown_used / a.starting_capital) * 100).toFixed(
      2,
    ),
    trades_left: Math.max(0, a.max_trades_per_day - a.trades_today),
  };
}

export const ACCOUNTS = [
  {
    id: "ACC-SAMPLE-5001",
    product: "Standard Challenge",
    size: 500000,
    balance: 523450,
    equity: 525910,
    pnl: 23450,
    start: "2026-10-20",
    expiry: "2026-11-19",
    status: "Active",
  },
  {
    id: "ACC-SAMPLE-4810",
    product: "Standard Challenge",
    size: 300000,
    balance: 334200,
    equity: 334200,
    pnl: 34200,
    start: "2026-08-02",
    expiry: "2026-09-01",
    status: "Completed",
  },
  {
    id: "ACC-SAMPLE-4522",
    product: "Standard Challenge",
    size: 200000,
    balance: 181900,
    equity: 181900,
    pnl: -18100,
    start: "2026-06-11",
    expiry: "2026-07-11",
    status: "Failed",
  },
  {
    id: "ACC-SAMPLE-F120",
    product: "Funded Account",
    size: 300000,
    balance: 318650,
    equity: 319400,
    pnl: 18650,
    start: "2026-09-05",
    expiry: "—",
    status: "Funded",
  },
];

export const TRADES = [
  {
    id: "T-90112",
    symbol: "NIFTY",
    side: "BUY",
    entry: 24302.5,
    exit: 24341.0,
    qty: 75,
    in: "2026-11-04 09:32",
    out: "2026-11-04 10:05",
  },
  {
    id: "T-90108",
    symbol: "BANKNIFTY",
    side: "SELL",
    entry: 52260.0,
    exit: 52198.5,
    qty: 30,
    in: "2026-11-03 11:14",
    out: "2026-11-03 11:48",
  },
  {
    id: "T-90101",
    symbol: "NIFTY",
    side: "BUY",
    entry: 24255.0,
    exit: 24231.0,
    qty: 75,
    in: "2026-11-03 13:02",
    out: "2026-11-03 13:20",
  },
  {
    id: "T-90094",
    symbol: "SENSEX",
    side: "BUY",
    entry: 79980.0,
    exit: 80065.0,
    qty: 20,
    in: "2026-11-02 10:10",
    out: "2026-11-02 12:31",
  },
  {
    id: "T-90087",
    symbol: "BANKNIFTY",
    side: "BUY",
    entry: 52010.0,
    exit: 52102.0,
    qty: 30,
    in: "2026-10-31 09:45",
    out: "2026-10-31 10:40",
  },
  {
    id: "T-90080",
    symbol: "NIFTY",
    side: "SELL",
    entry: 24410.0,
    exit: 24432.5,
    qty: 75,
    in: "2026-10-30 14:05",
    out: "2026-10-30 14:40",
  },
].map((t) => ({
  ...t,
  pnl: +(
    (t.side === "BUY" ? t.exit - t.entry : t.entry - t.exit) * t.qty
  ).toFixed(2),
}));

export const POSITIONS = [
  { symbol: "NIFTY", qty: 75, avg: 24318.0, ltp: 24350.0, status: "Open" },
  { symbol: "BANKNIFTY", qty: -30, avg: 52240.0, ltp: 52180.0, status: "Open" },
].map((p) => ({ ...p, pnl: +((p.ltp - p.avg) * p.qty).toFixed(2) }));

export const ORDERS = [
  {
    id: "O-55021",
    symbol: "NIFTY",
    qty: 75,
    type: "LIMIT",
    side: "BUY",
    price: 24300,
    date: "2026-11-04 09:30",
    status: "Executed",
  },
  {
    id: "O-55024",
    symbol: "BANKNIFTY",
    qty: 30,
    type: "MARKET",
    side: "SELL",
    price: 52240,
    date: "2026-11-04 10:12",
    status: "Executed",
  },
  {
    id: "O-55030",
    symbol: "NIFTY",
    qty: 75,
    type: "SL",
    side: "SELL",
    price: 24250,
    date: "2026-11-04 10:20",
    status: "Pending",
  },
  {
    id: "O-55033",
    symbol: "SENSEX",
    qty: 20,
    type: "LIMIT",
    side: "BUY",
    price: 79900,
    date: "2026-11-04 11:02",
    status: "Cancelled",
  },
];

/** Daily P&L for a month grid: positive, negative, 0 = no trade, null = weekend. */
export function monthDays(year = 2026, month = 10) {
  const r = rng(year * 100 + month);
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(year, month, i + 1);
    const wd = d.getDay();
    if (wd === 0 || wd === 6) return { day: i + 1, pnl: null };
    const x = r();
    return { day: i + 1, pnl: x < 0.2 ? 0 : Math.round((r() - 0.38) * 9000) };
  });
}

export const NOTIFICATIONS = [
  {
    id: 1,
    t: "Daily loss at 21%",
    d: "You have used ₹3,200 of your ₹15,000 daily loss limit.",
    kind: "risk",
    time: "10:42",
  },
  {
    id: 2,
    t: "Order executed",
    d: "BUY 75 NIFTY @ 24,300 filled.",
    kind: "trade",
    time: "09:31",
  },
  {
    id: 3,
    t: "Trading day counted",
    d: "Day 6 of 10 minimum trading days completed.",
    kind: "progress",
    time: "Yesterday",
  },
  {
    id: 4,
    t: "KYC reminder",
    d: "Upload your PAN and bank details to be ready for funding.",
    kind: "kyc",
    time: "2 days ago",
  },
];
