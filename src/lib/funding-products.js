export const PRODUCT_TYPES = {
  CLASSIC: "classic",
  INSTANT: "instant_funding",
  ONE_STEP: "one_step",
  ONE_STEP_FUNDED: "one_step_funded",
};

export const INSTANT_ACCOUNT_SIZES = [
  50000, 100000, 200000, 300000, 500000, 1000000,
];
export const ONE_STEP_ACCOUNT_SIZES = [100000, 200000, 300000, 500000, 1000000];

export function formatSizeLabel(size) {
  return `₹${Number(size || 0).toLocaleString("en-IN")}`;
}

export const DEFAULT_FUNDING_PRODUCTS = {
  id: "funding_products",
  instant_funding: {
    enabled: true,
    public_visible: true,
    name: "Instant Funding",
    tagline:
      "No evaluation phase. Get an active funded account immediately from day one.",
    daily_loss_limit_pct: 3,
    trailing_drawdown_pct: 5,
    drawdown_modes: ["intraday", "eod"],
    default_drawdown_mode: "intraday",
    buffer_pct: 3,
    breach_policy: "close_all_and_fail",
    trades_per_day: 0,
    no_time_limit: true,
    payout_cycles: {
      biweekly: {
        id: "biweekly",
        label: "Bi-Weekly Payout",
        profit_split: 80,
        interval_days: 14,
      },
      monthly: {
        id: "monthly",
        label: "Monthly Payout",
        profit_split: 90,
        interval_days: 30,
      },
    },
    tiers: [
      {
        size: 50000,
        label: "₹50,000",
        intraday_price: 2499,
        eod_price: 2999,
        enabled: true,
        public_visible: true,
      },
      {
        size: 100000,
        label: "₹1,00,000",
        intraday_price: 4499,
        eod_price: 5499,
        enabled: true,
        public_visible: true,
      },
      {
        size: 200000,
        label: "₹2,00,000",
        intraday_price: 8499,
        eod_price: 9999,
        enabled: true,
        public_visible: true,
      },
      {
        size: 300000,
        label: "₹3,00,000",
        intraday_price: 12499,
        eod_price: 14999,
        enabled: true,
        public_visible: true,
      },
      {
        size: 500000,
        label: "₹5,00,000",
        intraday_price: 19999,
        eod_price: 23999,
        enabled: true,
        public_visible: true,
      },
      {
        size: 1000000,
        label: "₹10,00,000",
        intraday_price: 36999,
        eod_price: 42999,
        enabled: true,
        public_visible: true,
      },
    ],
  },
  one_step: {
    enabled: true,
    public_visible: true,
    name: "1-Step Challenge",
    tagline:
      "Single evaluation phase. 10% profit target, minimum 3 trading days, no maximum time limit.",
    profit_target_pct: 10,
    daily_loss_limit_pct: 3,
    overall_loss_limit_pct: 6,
    min_trading_days: 3,
    no_time_limit: true,
    profit_split: 80,
    auto_activate_funded: true,
    breach_policy: "close_all_and_fail",
    trades_per_day: 0,
    tiers: [
      {
        size: 100000,
        label: "₹1,00,000",
        price: 2999,
        enabled: true,
        public_visible: true,
      },
      {
        size: 200000,
        label: "₹2,00,000",
        price: 5499,
        enabled: true,
        public_visible: true,
      },
      {
        size: 300000,
        label: "₹3,00,000",
        price: 7999,
        enabled: true,
        public_visible: true,
      },
      {
        size: 500000,
        label: "₹5,00,000",
        price: 12999,
        enabled: true,
        public_visible: true,
      },
      {
        size: 1000000,
        label: "₹10,00,000",
        price: 24999,
        enabled: true,
        public_visible: true,
      },
    ],
  },
  updated_at: "",
};

const n = (v, fb = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fb;
};

/**
 * @typedef {{
 *   size: number;
 *   label: string;
 *   intraday_price: number;
 *   eod_price: number;
 *   enabled: boolean;
 *   public_visible: boolean;
 * }} InstantTier
 *
 * @typedef {{
 *   size: number;
 *   label: string;
 *   price: number;
 *   enabled: boolean;
 *   public_visible: boolean;
 * }} OneStepTier
 *
 * @typedef {{
 *   product_type?: string;
 *   account_size?: number;
 *   drawdown_mode?: string;
 *   payout_cycle?: string;
 * }} FundingSelectionInput
 *
 * @typedef {{
 *   product_type: string;
 *   daily_loss_limit_pct: number;
 *   max_loss_limit: number;
 *   profit_split: number;
 *   profit_target_pct: number;
 *   min_trading_days: number;
 *   total_trading_days: number;
 *   no_time_limit: boolean;
 *   trades_per_day: number;
 *   breach_policy: string;
 *   trailing_drawdown_pct?: number;
 *   drawdown_mode?: string;
 *   buffer_pct?: number;
 *   payout_cycle?: string;
 *   payout_interval_days?: number;
 *   overall_loss_limit_pct?: number;
 *   auto_activate_funded?: boolean;
 * }} FundingSelectionRules
 *
 * @typedef {{
 *   account?: Record<string, any> | null;
 *   trades?: Array<Record<string, any>>;
 *   positions?: Array<Record<string, any>>;
 *   orders?: Array<Record<string, any>>;
 *   quoteMap?: Record<string, any>;
 *   evaluationRisk?: Record<string, any>;
 *   nowIso?: string;
 * }} RiskSnapshotInput
 */

/**
 * @param {any} [raw]
 */
export function normalizeFundingProductsConfig(raw) {
  /** @type {Record<string, any>} */
  const src = raw && typeof raw === "object" ? raw : {};
  const dInst = DEFAULT_FUNDING_PRODUCTS.instant_funding;
  /** @type {Record<string, any>} */
  const sInst =
    src.instant_funding && typeof src.instant_funding === "object"
      ? src.instant_funding
      : {};

  /** @type {Map<number, InstantTier>} */
  const instTierMap = new Map();
  for (const t of dInst.tiers) instTierMap.set(Number(t.size), { ...t });
  if (Array.isArray(sInst.tiers)) {
    for (const t of sInst.tiers) {
      const sz = Math.round(n(t?.size));
      if (!sz) continue;
      const base = instTierMap.get(sz) || {
        size: sz,
        label: formatSizeLabel(sz),
        intraday_price: 2499,
        eod_price: 2999,
        enabled: true,
        public_visible: true,
      };
      instTierMap.set(sz, {
        ...base,
        size: sz,
        label: String(t?.label || base.label || formatSizeLabel(sz)),
        intraday_price: Math.max(0, n(t?.intraday_price, base.intraday_price)),
        eod_price: Math.max(0, n(t?.eod_price, base.eod_price)),
        enabled: t?.enabled !== undefined ? Boolean(t.enabled) : base.enabled,
        public_visible:
          t?.public_visible !== undefined
            ? Boolean(t.public_visible)
            : base.public_visible,
      });
    }
  }

  const dCycles = dInst.payout_cycles;
  const sCycles =
    sInst.payout_cycles && typeof sInst.payout_cycles === "object"
      ? sInst.payout_cycles
      : {};

  const instant_funding = {
    ...dInst,
    ...sInst,
    enabled:
      sInst.enabled !== undefined ? Boolean(sInst.enabled) : dInst.enabled,
    public_visible:
      sInst.public_visible !== undefined
        ? Boolean(sInst.public_visible)
        : dInst.public_visible,
    daily_loss_limit_pct: Math.max(
      0.5,
      Math.min(25, n(sInst.daily_loss_limit_pct, dInst.daily_loss_limit_pct)),
    ),
    trailing_drawdown_pct: Math.max(
      0.5,
      Math.min(35, n(sInst.trailing_drawdown_pct, dInst.trailing_drawdown_pct)),
    ),
    buffer_pct: Math.max(
      0,
      Math.min(25, n(sInst.buffer_pct, dInst.buffer_pct)),
    ),
    trades_per_day: Math.max(
      0,
      Math.round(n(sInst.trades_per_day, dInst.trades_per_day)),
    ),
    breach_policy: ["close_all_and_fail", "cancel_and_fail"].includes(
      sInst.breach_policy,
    )
      ? sInst.breach_policy
      : dInst.breach_policy,
    payout_cycles: {
      biweekly: {
        ...dCycles.biweekly,
        ...(sCycles.biweekly || {}),
        id: "biweekly",
        profit_split: Math.max(
          50,
          Math.min(
            95,
            Math.round(
              n(sCycles.biweekly?.profit_split, dCycles.biweekly.profit_split),
            ),
          ),
        ),
        interval_days: Math.max(
          7,
          Math.round(
            n(sCycles.biweekly?.interval_days, dCycles.biweekly.interval_days),
          ),
        ),
      },
      monthly: {
        ...dCycles.monthly,
        ...(sCycles.monthly || {}),
        id: "monthly",
        profit_split: Math.max(
          50,
          Math.min(
            95,
            Math.round(
              n(sCycles.monthly?.profit_split, dCycles.monthly.profit_split),
            ),
          ),
        ),
        interval_days: Math.max(
          14,
          Math.round(
            n(sCycles.monthly?.interval_days, dCycles.monthly.interval_days),
          ),
        ),
      },
    },
    tiers: [...instTierMap.values()].sort((a, b) => a.size - b.size),
  };

  const dOne = DEFAULT_FUNDING_PRODUCTS.one_step;
  /** @type {Record<string, any>} */
  const sOne =
    src.one_step && typeof src.one_step === "object" ? src.one_step : {};

  /** @type {Map<number, OneStepTier>} */
  const oneTierMap = new Map();
  for (const t of dOne.tiers) oneTierMap.set(Number(t.size), { ...t });
  if (Array.isArray(sOne.tiers)) {
    for (const t of sOne.tiers) {
      const sz = Math.round(n(t?.size));
      if (!sz) continue;
      const base = oneTierMap.get(sz) || {
        size: sz,
        label: formatSizeLabel(sz),
        price: 2999,
        enabled: true,
        public_visible: true,
      };
      oneTierMap.set(sz, {
        ...base,
        size: sz,
        label: String(t?.label || base.label || formatSizeLabel(sz)),
        price: Math.max(0, n(t?.price, base.price)),
        enabled: t?.enabled !== undefined ? Boolean(t.enabled) : base.enabled,
        public_visible:
          t?.public_visible !== undefined
            ? Boolean(t.public_visible)
            : base.public_visible,
      });
    }
  }

  const one_step = {
    ...dOne,
    ...sOne,
    enabled: sOne.enabled !== undefined ? Boolean(sOne.enabled) : dOne.enabled,
    public_visible:
      sOne.public_visible !== undefined
        ? Boolean(sOne.public_visible)
        : dOne.public_visible,
    profit_target_pct: Math.max(
      1,
      Math.min(50, n(sOne.profit_target_pct, dOne.profit_target_pct)),
    ),
    daily_loss_limit_pct: Math.max(
      0.5,
      Math.min(25, n(sOne.daily_loss_limit_pct, dOne.daily_loss_limit_pct)),
    ),
    overall_loss_limit_pct: Math.max(
      1,
      Math.min(50, n(sOne.overall_loss_limit_pct, dOne.overall_loss_limit_pct)),
    ),
    min_trading_days: Math.max(
      0,
      Math.round(n(sOne.min_trading_days, dOne.min_trading_days)),
    ),
    no_time_limit:
      sOne.no_time_limit !== undefined
        ? Boolean(sOne.no_time_limit)
        : dOne.no_time_limit,
    profit_split: Math.max(
      50,
      Math.min(95, Math.round(n(sOne.profit_split, dOne.profit_split))),
    ),
    auto_activate_funded:
      sOne.auto_activate_funded !== undefined
        ? Boolean(sOne.auto_activate_funded)
        : dOne.auto_activate_funded,
    trades_per_day: Math.max(
      0,
      Math.round(n(sOne.trades_per_day, dOne.trades_per_day)),
    ),
    breach_policy: ["close_all_and_fail", "cancel_and_fail"].includes(
      sOne.breach_policy,
    )
      ? sOne.breach_policy
      : dOne.breach_policy,
    tiers: [...oneTierMap.values()].sort((a, b) => a.size - b.size),
  };

  return {
    id: "funding_products",
    instant_funding,
    one_step,
    updated_at: String(src.updated_at || ""),
  };
}

/**
 * @param {any} rawConfig
 * @param {FundingSelectionInput} [selection]
 * @returns {{ ok: false; error: string } | { ok: true; product_type: string; plan_id: string; plan_name: string; account_size: number; challenge_fee: number; drawdown_mode: string; payout_cycle: string; rules: FundingSelectionRules }}
 */
export function resolveFundingProductSelection(rawConfig, selection = {}) {
  const cfg = normalizeFundingProductsConfig(rawConfig);
  const pType = String(selection.product_type || "").trim();
  const accountSize = Math.round(n(selection.account_size));

  if (pType === PRODUCT_TYPES.INSTANT) {
    const prod = cfg.instant_funding;
    if (!prod.enabled) {
      return { ok: false, error: "Instant Funding is currently disabled." };
    }
    const tier = prod.tiers.find((t) => Number(t.size) === accountSize);
    if (!tier || !tier.enabled) {
      return {
        ok: false,
        error: `Selected Instant Funding size (${formatSizeLabel(accountSize)}) is not available.`,
      };
    }
    const ddMode =
      String(
        selection.drawdown_mode || prod.default_drawdown_mode || "intraday",
      ).toLowerCase() === "eod"
        ? "eod"
        : "intraday";
    const cycleKey =
      String(selection.payout_cycle || "biweekly").toLowerCase() === "monthly"
        ? "monthly"
        : "biweekly";
    const cycleCfg =
      prod.payout_cycles[cycleKey] || prod.payout_cycles.biweekly;
    const price = ddMode === "eod" ? n(tier.eod_price) : n(tier.intraday_price);
    const ddLabel = ddMode === "eod" ? "EOD" : "Intraday";
    return {
      ok: true,
      product_type: PRODUCT_TYPES.INSTANT,
      plan_id: `instant-${tier.size}-${ddMode}-${cycleKey}`,
      plan_name: `Instant Funding ${tier.label} (${ddLabel})`,
      account_size: tier.size,
      challenge_fee: price,
      drawdown_mode: ddMode,
      payout_cycle: cycleKey,
      rules: {
        product_type: PRODUCT_TYPES.INSTANT,
        daily_loss_limit_pct: prod.daily_loss_limit_pct,
        trailing_drawdown_pct: prod.trailing_drawdown_pct,
        max_loss_limit: prod.trailing_drawdown_pct,
        drawdown_mode: ddMode,
        buffer_pct: prod.buffer_pct,
        payout_cycle: cycleKey,
        profit_split: cycleCfg.profit_split,
        payout_interval_days: cycleCfg.interval_days,
        profit_target_pct: 0,
        min_trading_days: 0,
        total_trading_days: 0,
        no_time_limit: true,
        trades_per_day: prod.trades_per_day,
        breach_policy: prod.breach_policy,
      },
    };
  }

  if (pType === PRODUCT_TYPES.ONE_STEP) {
    const prod = cfg.one_step;
    if (!prod.enabled) {
      return { ok: false, error: "1-Step Challenge is currently disabled." };
    }
    const tier = prod.tiers.find((t) => Number(t.size) === accountSize);
    if (!tier || !tier.enabled) {
      return {
        ok: false,
        error: `Selected 1-Step Challenge size (${formatSizeLabel(accountSize)}) is not available.`,
      };
    }
    return {
      ok: true,
      product_type: PRODUCT_TYPES.ONE_STEP,
      plan_id: `one-step-${tier.size}`,
      plan_name: `1-Step Challenge ${tier.label}`,
      account_size: tier.size,
      challenge_fee: n(tier.price),
      drawdown_mode: "fixed",
      payout_cycle: "standard",
      rules: {
        product_type: PRODUCT_TYPES.ONE_STEP,
        profit_target_pct: prod.profit_target_pct,
        daily_loss_limit_pct: prod.daily_loss_limit_pct,
        max_loss_limit: prod.overall_loss_limit_pct,
        overall_loss_limit_pct: prod.overall_loss_limit_pct,
        min_trading_days: prod.min_trading_days,
        total_trading_days: 0,
        no_time_limit: Boolean(prod.no_time_limit),
        profit_split: prod.profit_split,
        auto_activate_funded: Boolean(prod.auto_activate_funded),
        trades_per_day: prod.trades_per_day,
        breach_policy: prod.breach_policy,
      },
    };
  }

  return { ok: false, error: "Unsupported product type" };
}

export function getAccountProductType(acct) {
  const t = String(acct?.product_type || "").trim();
  if (
    t === PRODUCT_TYPES.INSTANT ||
    t === PRODUCT_TYPES.ONE_STEP ||
    t === PRODUCT_TYPES.ONE_STEP_FUNDED
  ) {
    return t;
  }
  return PRODUCT_TYPES.CLASSIC;
}

export function isClassicProduct(acct) {
  return getAccountProductType(acct) === PRODUCT_TYPES.CLASSIC;
}

export function getIstDateKey(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    return (
      String(value || "").slice(0, 10) || new Date().toISOString().slice(0, 10)
    );
  }
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function productBadgeLabel(acct) {
  const p = getAccountProductType(acct);
  if (p === PRODUCT_TYPES.INSTANT) {
    const mode = String(acct?.drawdown_mode || "intraday").toUpperCase();
    return `Instant Funding · ${mode}`;
  }
  if (p === PRODUCT_TYPES.ONE_STEP) return "1-Step Challenge";
  if (p === PRODUCT_TYPES.ONE_STEP_FUNDED) return "1-Step Funded";
  return acct?.account_type || "Challenge";
}

/**
 * Pure risk & metrics snapshot for any account (Classic, Instant Funding, 1-Step, 1-Step Funded).
 * Works identically on server (with live quote map) and frontend UI.
 * @param {RiskSnapshotInput} [input]
 */
export function computeAccountRiskSnapshot({
  account,
  trades = [],
  positions = [],
  orders = [],
  quoteMap = {},
  evaluationRisk = {},
  nowIso,
} = {}) {
  const acct = account || {};
  const productType = getAccountProductType(acct);
  const currentIso = nowIso || new Date().toISOString();
  const todayKey = getIstDateKey(currentIso);

  const startingCapital = n(acct.starting_capital, n(acct.balance, 0));
  const currentBalance = n(acct.balance, startingCapital);
  const openPositions = (positions || []).filter(
    (p) => Number(p?.qty || 0) !== 0,
  );

  let openPnl = 0;
  let feedMissing = false;
  for (const pos of openPositions) {
    const sym = String(pos.symbol || "").toUpperCase();
    const q = quoteMap[sym];
    const liveLtp = q && typeof q === "object" ? Number(q.ltp) : Number(q);
    if (
      openPositions.length > 0 &&
      !(Number.isFinite(liveLtp) && liveLtp > 0)
    ) {
      feedMissing = true;
    }
    const price =
      Number.isFinite(liveLtp) && liveLtp > 0 ? liveLtp : n(pos.avg, 0);
    const qty = Number(pos.qty || 0);
    const diff = qty > 0 ? price - n(pos.avg, 0) : n(pos.avg, 0) - price;
    openPnl += diff * Math.abs(qty);
  }
  openPnl = +openPnl.toFixed(2);
  const currentEquity = +(currentBalance + openPnl).toFixed(2);
  const closedPnl = n(
    acct.realized_pnl,
    +(currentBalance - startingCapital).toFixed(2),
  );

  // Trading days & profitable days derived from closed trades + executed orders
  const dayPnlMap = new Map();
  const tradedDateSet = new Set();
  for (const o of orders || []) {
    if (String(o.status || "") === "Cancelled") continue;
    const dk = getIstDateKey(o.created_at || o.date);
    if (dk) tradedDateSet.add(dk);
  }
  for (const t of trades || []) {
    const dk = getIstDateKey(t.out || t.created_at || t.in);
    if (dk) {
      tradedDateSet.add(dk);
      dayPnlMap.set(dk, (dayPnlMap.get(dk) || 0) + n(t.pnl, 0));
    }
  }

  const computedDays = tradedDateSet.size;
  const tradingDaysDone = Math.max(
    computedDays,
    acct.trading_days_done != null
      ? Math.round(n(acct.trading_days_done, 0))
      : 0,
  );
  const profitableDaysDone = [...dayPnlMap.values()].filter(
    (v) => v > 0,
  ).length;

  // Daily starting balance & daily loss
  const storedDay = String(acct.current_trading_day || "");
  const dailyStartingBalance =
    acct.daily_starting_balance != null &&
    (!storedDay || storedDay === todayKey)
      ? n(acct.daily_starting_balance, currentBalance)
      : currentBalance;

  const dailyLoss = Math.max(
    0,
    +(dailyStartingBalance - currentEquity).toFixed(2),
  );
  const dailyLossLimitPct =
    productType === PRODUCT_TYPES.CLASSIC
      ? n(acct.daily_loss_limit_pct, n(evaluationRisk.daily_loss_limit_pct, 5))
      : n(acct.daily_loss_limit_pct, 3);
  const dailyLossLimitAmt = +(
    (dailyStartingBalance * dailyLossLimitPct) /
    100
  ).toFixed(2);
  const dailyLossFloor = +(dailyStartingBalance - dailyLossLimitAmt).toFixed(2);
  const dailyLossRoom = Math.max(
    0,
    +(currentEquity - dailyLossFloor).toFixed(2),
  );

  // Highest recorded equity & drawdown model
  const drawdownMode =
    productType === PRODUCT_TYPES.INSTANT
      ? String(acct.drawdown_mode || "intraday").toLowerCase() === "eod"
        ? "eod"
        : "intraday"
      : productType === PRODUCT_TYPES.ONE_STEP ||
          productType === PRODUCT_TYPES.ONE_STEP_FUNDED
        ? "fixed"
        : "fixed";

  const prevHigh = n(
    acct.highest_recorded_equity,
    Math.max(startingCapital, currentBalance),
  );
  const prevEodWatermark = n(
    acct.eod_high_watermark,
    Math.max(startingCapital, currentBalance),
  );
  const prevIntradayPeak = n(
    acct.intraday_peak_equity,
    Math.max(prevHigh, currentEquity),
  );

  const intradayPeakEquity = Math.max(prevIntradayPeak, currentEquity);
  const highestRecordedEquity =
    drawdownMode === "intraday"
      ? Math.max(prevHigh, currentEquity)
      : prevEodWatermark;

  const trailingDrawdownPct = n(
    acct.trailing_drawdown_pct,
    n(acct.max_loss_limit, productType === PRODUCT_TYPES.INSTANT ? 5 : 6),
  );
  const maxLossLimitPct =
    productType === PRODUCT_TYPES.INSTANT
      ? trailingDrawdownPct
      : productType === PRODUCT_TYPES.ONE_STEP ||
          productType === PRODUCT_TYPES.ONE_STEP_FUNDED
        ? n(acct.max_loss_limit, n(acct.overall_loss_limit_pct, 6))
        : n(acct.max_loss_limit, n(evaluationRisk.max_loss_limit, 20));

  let trailingDrawdownFloor = 0;
  let overallDrawdown = Math.max(
    0,
    +(startingCapital - currentEquity).toFixed(2),
  );

  if (productType === PRODUCT_TYPES.INSTANT) {
    const watermark =
      drawdownMode === "eod" ? prevEodWatermark : highestRecordedEquity;
    trailingDrawdownFloor = +(
      watermark *
      (1 - trailingDrawdownPct / 100)
    ).toFixed(2);
    overallDrawdown = Math.max(0, +(watermark - currentEquity).toFixed(2));
  } else {
    trailingDrawdownFloor = +(
      startingCapital *
      (1 - maxLossLimitPct / 100)
    ).toFixed(2);
    overallDrawdown = Math.max(
      0,
      +(startingCapital - currentEquity).toFixed(2),
    );
  }
  const overallLossRoom = Math.max(
    0,
    +(currentEquity - trailingDrawdownFloor).toFixed(2),
  );

  // Profit target & progress
  const profitTargetPct =
    productType === PRODUCT_TYPES.INSTANT
      ? 0
      : productType === PRODUCT_TYPES.ONE_STEP
        ? n(acct.profit_target_pct, 10)
        : productType === PRODUCT_TYPES.ONE_STEP_FUNDED
          ? 0
          : n(acct.profit_target_pct, n(evaluationRisk.profit_target_pct, 8));
  const profitTargetAmt = +((startingCapital * profitTargetPct) / 100).toFixed(
    2,
  );
  const netProfit = +(currentEquity - startingCapital).toFixed(2);
  const profitTargetProgressPct =
    profitTargetAmt > 0
      ? Math.max(
          0,
          Math.min(100, +((netProfit / profitTargetAmt) * 100).toFixed(2)),
        )
      : 0;

  // Buffer & payout eligibility
  const bufferPct =
    productType === PRODUCT_TYPES.INSTANT ? n(acct.buffer_pct, 3) : 0;
  const bufferAmount = +((startingCapital * bufferPct) / 100).toFixed(2);
  const bufferProgressPct =
    bufferAmount > 0
      ? Math.max(
          0,
          Math.min(
            100,
            +((Math.max(0, closedPnl) / bufferAmount) * 100).toFixed(2),
          ),
        )
      : 100;
  const bufferSatisfied = bufferAmount <= 0 || closedPnl > bufferAmount;

  const profitSplit =
    productType === PRODUCT_TYPES.CLASSIC
      ? Math.round(n(acct.profit_split, n(evaluationRisk.profit_split, 70)))
      : Math.round(n(acct.profit_split, 80));

  const eligibleProfitBase =
    productType === PRODUCT_TYPES.INSTANT
      ? Math.max(0, +(closedPnl - bufferAmount).toFixed(2))
      : Math.max(0, closedPnl);
  const withdrawableProfit = +(
    (eligibleProfitBase * profitSplit) /
    100
  ).toFixed(2);

  const isFunded =
    String(acct.status || "") === "Funded" || acct.account_type === "Funded";
  const payoutCycle = String(
    acct.payout_cycle ||
      (productType === PRODUCT_TYPES.INSTANT ? "biweekly" : "standard"),
  );
  const payoutIntervalDays =
    payoutCycle === "monthly" ? 30 : payoutCycle === "biweekly" ? 14 : 0;
  const payoutEligible =
    isFunded &&
    String(acct.status || "") !== "Failed" &&
    withdrawableProfit > 0 &&
    bufferSatisfied;

  const minTradingDays =
    productType === PRODUCT_TYPES.INSTANT
      ? 0
      : productType === PRODUCT_TYPES.ONE_STEP
        ? Math.round(n(acct.min_trading_days, 3))
        : productType === PRODUCT_TYPES.ONE_STEP_FUNDED
          ? 0
          : Math.round(
              n(acct.min_trading_days, n(evaluationRisk.min_trading_days, 10)),
            );

  return {
    product_type: productType,
    drawdown_mode: drawdownMode,
    payout_cycle: payoutCycle,
    payout_interval_days: payoutIntervalDays,
    starting_capital: startingCapital,
    current_balance: currentBalance,
    current_equity: currentEquity,
    open_pnl: openPnl,
    closed_pnl: closedPnl,
    net_profit: netProfit,
    daily_starting_balance: dailyStartingBalance,
    daily_loss: dailyLoss,
    daily_loss_limit_pct: dailyLossLimitPct,
    daily_loss_limit_amt: dailyLossLimitAmt,
    daily_loss_floor: dailyLossFloor,
    daily_loss_room: dailyLossRoom,
    overall_drawdown: overallDrawdown,
    trailing_drawdown_pct: trailingDrawdownPct,
    max_loss_limit_pct: maxLossLimitPct,
    highest_recorded_equity: highestRecordedEquity,
    eod_high_watermark: prevEodWatermark,
    intraday_peak_equity: intradayPeakEquity,
    trailing_drawdown_floor: trailingDrawdownFloor,
    overall_loss_room: overallLossRoom,
    profit_target_pct: profitTargetPct,
    profit_target_amt: profitTargetAmt,
    profit_target_progress_pct: profitTargetProgressPct,
    min_trading_days: minTradingDays,
    trading_days: tradingDaysDone,
    profitable_days: profitableDaysDone,
    buffer_pct: bufferPct,
    buffer_amount: bufferAmount,
    buffer_progress_pct: bufferProgressPct,
    buffer_satisfied: bufferSatisfied,
    profit_split: profitSplit,
    withdrawable_profit: withdrawableProfit,
    payout_eligible: payoutEligible,
    feed_missing: feedMissing,
    open_positions_count: openPositions.length,
    today_key: todayKey,
  };
}
