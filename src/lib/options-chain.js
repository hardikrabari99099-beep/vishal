// Client-side Black-Scholes & strike chain generator synchronized with server/market-data.ts

export const OPTION_UNDERLYINGS = [
  {
    symbol: "NIFTY",
    label: "NIFTY 50",
    exchange: "NSE",
    lot: 75,
    step: 50,
    expiryDay: 4,
    fallbackSpot: 25450,
  },
  {
    symbol: "BANKNIFTY",
    label: "BANK NIFTY",
    exchange: "NSE",
    lot: 30,
    step: 100,
    expiryDay: 3,
    fallbackSpot: 62350,
  },
  {
    symbol: "FINNIFTY",
    label: "FIN NIFTY",
    exchange: "NSE",
    lot: 65,
    step: 50,
    expiryDay: 2,
    fallbackSpot: 28280,
  },
  {
    symbol: "MIDCPNIFTY",
    label: "MIDCAP NIFTY",
    exchange: "NSE",
    lot: 120,
    step: 25,
    expiryDay: 1,
    fallbackSpot: 17870,
  },
  {
    symbol: "SENSEX",
    label: "BSE SENSEX",
    exchange: "BSE",
    lot: 20,
    step: 100,
    expiryDay: 5,
    fallbackSpot: 82600,
  },
  {
    symbol: "BANKEX",
    label: "BSE BANKEX",
    exchange: "BSE",
    lot: 15,
    step: 100,
    expiryDay: 1,
    fallbackSpot: 70170,
  },
];

export const UNDERLYING_MAP = Object.fromEntries(
  OPTION_UNDERLYINGS.map((u) => [u.symbol, u]),
);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function getOptionSpec(symbol = "NIFTY") {
  const clean = String(symbol || "NIFTY").toUpperCase();
  return UNDERLYING_MAP[clean] || OPTION_UNDERLYINGS[0];
}

export function getUpcomingExpiries(underlying = "NIFTY", count = 4) {
  const spec = getOptionSpec(underlying);
  const now = new Date();
  const targetDay = spec.expiryDay ?? 4;
  const out = [];
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < 45 && out.length < count; i++) {
    if (d.getDay() === targetDay) {
      const diffDays = Math.max(
        0.4,
        Math.round((d.getTime() - now.getTime()) / 86400000),
      );
      const dayNum = String(d.getDate()).padStart(2, "0");
      const mon = MONTHS[d.getMonth()];
      const label = `${dayNum} ${mon}`;
      const isMonthly = i >= 21;
      out.push({
        id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${dayNum}`,
        label,
        tag:
          out.length === 0
            ? "Weekly"
            : isMonthly
              ? "Monthly"
              : `W+${out.length}`,
        dteDays: Math.max(1, diffDays),
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function normCdf(x) {
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
  spot,
  strike,
  optionType,
  ivPct = 14.5,
  dteDays = 4,
) {
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

function deterministicStat(strike, salt) {
  const n = Math.abs(Math.sin(strike * 12.9898 + salt * 78.233) * 43758.5453);
  return n - Math.floor(n);
}

export function formatLac(num) {
  const n = Number(num) || 0;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function buildOptionChain({
  underlying = "NIFTY",
  spot,
  prevClose,
  liveQuoteMap = {},
  dteDays = 4,
  sideCount = 6,
}) {
  const spec = getOptionSpec(underlying);
  const activeSpot = Number(spot) || spec.fallbackSpot;
  const activePrev = Number(prevClose) || activeSpot * 0.996;
  const step = spec.step;
  const atm = Math.round(activeSpot / step) * step;

  const rows = [];
  for (let offset = -sideCount; offset <= sideCount; offset++) {
    const strike = atm + offset * step;
    const ceSymbol = `${spec.symbol}${strike}CE`;
    const peSymbol = `${spec.symbol}${strike}PE`;
    const ceQuote = liveQuoteMap[ceSymbol];
    const peQuote = liveQuoteMap[peSymbol];

    const moneyness = Math.abs(strike - activeSpot) / activeSpot;
    const iv = 13.8 + moneyness * 42;

    const ceTheo = computeOptionPremium(activeSpot, strike, "CE", iv, dteDays);
    const cePrevTheo = computeOptionPremium(
      activePrev,
      strike,
      "CE",
      iv + 0.4,
      dteDays + 0.5,
    );
    const ceLtp = ceQuote?.ltp ? Number(ceQuote.ltp) : ceTheo;
    const ceChgPct =
      ceQuote?.changePct ??
      (cePrevTheo > 0
        ? +(((ceLtp - cePrevTheo) / cePrevTheo) * 100).toFixed(2)
        : 0);
    const ceSpread = Math.max(0.05, +(ceLtp * 0.004).toFixed(2));

    const peTheo = computeOptionPremium(activeSpot, strike, "PE", iv, dteDays);
    const pePrevTheo = computeOptionPremium(
      activePrev,
      strike,
      "PE",
      iv + 0.4,
      dteDays + 0.5,
    );
    const peLtp = peQuote?.ltp ? Number(peQuote.ltp) : peTheo;
    const peChgPct =
      peQuote?.changePct ??
      (pePrevTheo > 0
        ? +(((peLtp - pePrevTheo) / pePrevTheo) * 100).toFixed(2)
        : 0);
    const peSpread = Math.max(0.05, +(peLtp * 0.004).toFixed(2));

    const ceDistanceFactor = Math.exp(
      -Math.pow((strike - activeSpot) / (step * 4.5), 2),
    );
    const peDistanceFactor = Math.exp(
      -Math.pow((activeSpot - strike) / (step * 4.5), 2),
    );
    const ceOi = Math.round(
      (240000 + deterministicStat(strike, 1) * 1800000) *
        (0.45 + ceDistanceFactor),
    );
    const peOi = Math.round(
      (260000 + deterministicStat(strike, 2) * 1950000) *
        (0.45 + peDistanceFactor),
    );
    const ceVol = Math.round(ceOi * (1.4 + deterministicStat(strike, 3) * 2.2));
    const peVol = Math.round(peOi * (1.4 + deterministicStat(strike, 4) * 2.2));

    rows.push({
      strike,
      isAtm: strike === atm,
      ceSymbol,
      peSymbol,
      lot: spec.lot,
      exchange: spec.exchange,
      ce: {
        symbol: ceSymbol,
        ltp: +ceLtp.toFixed(2),
        bid: Math.max(0.05, +(ceLtp - ceSpread).toFixed(2)),
        ask: +(ceLtp + ceSpread).toFixed(2),
        chgPct: ceChgPct,
        oi: ceOi,
        vol: ceVol,
        iv: +iv.toFixed(1),
      },
      pe: {
        symbol: peSymbol,
        ltp: +peLtp.toFixed(2),
        bid: Math.max(0.05, +(peLtp - peSpread).toFixed(2)),
        ask: +(peLtp + peSpread).toFixed(2),
        chgPct: peChgPct,
        oi: peOi,
        vol: peVol,
        iv: +iv.toFixed(1),
      },
    });
  }

  return { spec, atm, rows };
}

export function extractUnderlyingFromSymbol(sym = "") {
  const upper = String(sym || "")
    .trim()
    .toUpperCase();
  const match = upper.match(/^([A-Z&-]{2,14}?)(\d{2,6})(CE|PE)$/);
  if (match && UNDERLYING_MAP[match[1]]) return match[1];
  if (UNDERLYING_MAP[upper]) return upper;
  return "NIFTY";
}
