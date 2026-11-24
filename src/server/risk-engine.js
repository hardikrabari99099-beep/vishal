import {
  PRODUCT_TYPES,
  computeAccountRiskSnapshot,
  getAccountProductType,
  getIstDateKey,
  normalizeFundingProductsConfig,
} from "../lib/funding-products";
import { DEFAULT_SETTINGS } from "../lib/default-settings";
import {
  resolveEmailConfig,
  sendAccountBreachEmail,
  sendChallengePassedEmail,
} from "./mailer";

const num = (v, fb = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : fb;
};

const uuid = () => crypto.randomUUID();

function buildQuoteMap(quotesList = []) {
  const map = {};
  for (const q of quotesList) {
    if (q && q.symbol && Number.isFinite(Number(q.ltp)) && Number(q.ltp) > 0) {
      map[String(q.symbol).toUpperCase()] = q;
    }
  }
  return map;
}

export async function fetchQuoteMapForPositions(positions = []) {
  const open = (positions || []).filter((p) => Number(p?.qty || 0) !== 0);
  if (!open.length) return { quoteMap: {}, feedOk: true };
  const symbols = Array.from(
    new Set(
      open.map((p) => String(p.symbol || "").toUpperCase()).filter(Boolean),
    ),
  );
  if (!symbols.length) return { quoteMap: {}, feedOk: true };
  try {
    const { getQuotes } = await import("./market-data");
    const res = await getQuotes(symbols);
    const quoteMap = buildQuoteMap(res?.quotes || []);
    const allPresent = symbols.every((s) => Number(quoteMap[s]?.ltp) > 0);
    return { quoteMap, feedOk: allPresent };
  } catch {
    return { quoteMap: {}, feedOk: false };
  }
}

async function logRiskEmail(
  db,
  appendEmailLog,
  { trigger, recipient, subject, res, emailCfg },
) {
  if (typeof appendEmailLog !== "function") return;
  try {
    await appendEmailLog({
      trigger,
      from: res?.from || emailCfg?.from_email || emailCfg?.smtp_user || "",
      to: recipient,
      subject: res?.subject || subject,
      provider: res?.provider || emailCfg?.provider || "smtp",
      status: res?.sent ? "sent" : "skipped",
      message_id: res?.messageId || "",
      accepted: res?.accepted || [],
      error: res?.sent ? "" : res?.reason || "",
    });
  } catch {
    // Non-fatal
  }
}

export async function triggerAccountBreach({
  db,
  account,
  breachCode,
  breachReason,
  snapshot,
  positions = [],
  orders = [],
  quoteMap = {},
  nowIso,
  origin = "",
  appendEmailLog,
}) {
  const ts = nowIso || new Date().toISOString();
  if (String(account.status || "") === "Failed") {
    return { account, breached: false, alreadyFailed: true };
  }

  // 1-2. Prepare breach snapshot
  const breachSnapshot = {
    code: breachCode,
    reason: breachReason,
    breached_at: ts,
    starting_capital: snapshot.starting_capital,
    balance_before_close: snapshot.current_balance,
    equity_at_breach: snapshot.current_equity,
    open_pnl_at_breach: snapshot.open_pnl,
    daily_starting_balance: snapshot.daily_starting_balance,
    daily_loss: snapshot.daily_loss,
    daily_loss_floor: snapshot.daily_loss_floor,
    overall_drawdown: snapshot.overall_drawdown,
    highest_recorded_equity: snapshot.highest_recorded_equity,
    eod_high_watermark: snapshot.eod_high_watermark,
    trailing_drawdown_floor: snapshot.trailing_drawdown_floor,
    drawdown_mode: snapshot.drawdown_mode,
  };

  // 3. Cancel all pending orders immediately
  let cancelledOrdersCount = 0;
  for (const ord of orders) {
    if (String(ord.status || "") === "Pending") {
      await db.put("virtual_orders", {
        ...ord,
        status: "Cancelled",
        cancel_reason: breachReason,
        updated_at: ts,
      });
      cancelledOrdersCount++;
    }
  }

  // 4-5. Close open positions per configured policy
  const policy = String(account.breach_policy || "close_all_and_fail");
  let closedPositionsCount = 0;
  let runningBalance = num(account.balance);
  let runningRealized = num(account.realized_pnl);
  const openPositions = (positions || []).filter(
    (p) => Number(p?.qty || 0) !== 0,
  );

  if (policy !== "cancel_only" && openPositions.length > 0) {
    for (const pos of openPositions) {
      const sym = String(pos.symbol || "").toUpperCase();
      const q = quoteMap[sym];
      const rawLtp = q && typeof q === "object" ? q.ltp : q;
      const exitPrice = +(
        (Number(rawLtp) > 0 ? Number(rawLtp) : num(pos.avg)) || 0
      ).toFixed(2);
      const absQty = Math.abs(Number(pos.qty || 0));
      const isLong = Number(pos.qty || 0) > 0;
      const pnl = +(
        (isLong ? exitPrice - num(pos.avg) : num(pos.avg) - exitPrice) * absQty
      ).toFixed(2);

      runningBalance = +(runningBalance + pnl).toFixed(2);
      runningRealized = +(runningRealized + pnl).toFixed(2);
      closedPositionsCount++;

      await db.put("virtual_orders", {
        id: `ORD-BR-${uuid().slice(0, 6).toUpperCase()}`,
        user_id: account.user_id,
        account_id: account.id,
        symbol: pos.symbol,
        exchange: pos.exchange || "NSE",
        side: isLong ? "SELL" : "BUY",
        qty: absQty,
        type: "MARKET",
        product: pos.product || "MIS",
        price: exitPrice,
        note: `Auto-closed on breach (${breachCode})`,
        date: ts,
        status: "Executed",
        created_at: ts,
      });

      await db.put("virtual_trades", {
        id: `TRD-BR-${uuid().slice(0, 6).toUpperCase()}`,
        user_id: account.user_id,
        account_id: account.id,
        symbol: pos.symbol,
        exchange: pos.exchange || "NSE",
        side: isLong ? "BUY" : "SELL",
        entry: pos.avg,
        exit: exitPrice,
        qty: absQty,
        pnl,
        note: `Auto-closed on breach: ${breachReason}`,
        in: pos.created_at || ts,
        out: ts,
        created_at: ts,
      });

      await db.del("virtual_positions", pos.id).catch(() => null);
    }
  }

  // 6. Mark account FAILED and disable trading
  const failedAccount = {
    ...account,
    balance: runningBalance,
    current_equity: runningBalance,
    open_pnl: 0,
    realized_pnl: runningRealized,
    used_margin: 0,
    available_margin: Math.max(0, runningBalance),
    daily_starting_balance: snapshot.daily_starting_balance,
    daily_loss: snapshot.daily_loss,
    daily_loss_floor: snapshot.daily_loss_floor,
    overall_drawdown: snapshot.overall_drawdown,
    highest_recorded_equity: snapshot.highest_recorded_equity,
    eod_high_watermark: snapshot.eod_high_watermark,
    intraday_peak_equity: snapshot.intraday_peak_equity,
    trailing_drawdown_floor: snapshot.trailing_drawdown_floor,
    trading_days_done: snapshot.trading_days,
    profitable_days_done: snapshot.profitable_days,
    status: "Failed",
    trading_enabled: false,
    breached_at: ts,
    breach_code: breachCode,
    breach_reason: breachReason,
    breach_snapshot: {
      ...breachSnapshot,
      final_balance_after_close: runningBalance,
      cancelled_orders_count: cancelledOrdersCount,
      closed_positions_count: closedPositionsCount,
    },
    updated_at: ts,
  };
  await db.put("trader_accounts", failedAccount);

  // 9. Save breach record in admin-accessible collections
  const breachRecord = {
    id: `br-${uuid().slice(0, 8)}`,
    account_id: failedAccount.id,
    account_number: failedAccount.account_number,
    user_id: failedAccount.user_id,
    user_email: failedAccount.user_email,
    product_type: getAccountProductType(failedAccount),
    plan_name: failedAccount.plan_name,
    drawdown_mode: snapshot.drawdown_mode,
    breach_code: breachCode,
    breach_reason: breachReason,
    breached_at: ts,
    equity_at_breach: snapshot.current_equity,
    final_balance: runningBalance,
    trailing_drawdown_floor: snapshot.trailing_drawdown_floor,
    daily_loss: snapshot.daily_loss,
    daily_loss_floor: snapshot.daily_loss_floor,
    highest_recorded_equity: snapshot.highest_recorded_equity,
    eod_high_watermark: snapshot.eod_high_watermark,
    overall_drawdown: snapshot.overall_drawdown,
    cancelled_orders_count: cancelledOrdersCount,
    closed_positions_count: closedPositionsCount,
    snapshot: failedAccount.breach_snapshot,
    created_at: ts,
  };
  await db.put("risk_breaches", breachRecord);

  await db.put("risk_events", {
    id: `re-${uuid().slice(0, 8)}`,
    account_id: failedAccount.id,
    account_number: failedAccount.account_number,
    user_id: failedAccount.user_id,
    user_email: failedAccount.user_email,
    product_type: getAccountProductType(failedAccount),
    event_type: "ACCOUNT_BREACHED",
    title: `Account Failed — ${breachCode}`,
    detail: breachReason,
    metrics: breachRecord,
    created_at: ts,
  });

  // 8a. Dashboard notification
  await db.put("user_notifications", {
    id: `nt-${uuid().slice(0, 8)}`,
    user_id: failedAccount.user_id,
    type: "risk",
    title: `Account Failed: ${failedAccount.account_number}`,
    body: `${breachReason} Trading is disabled on this account (${failedAccount.plan_name}).`,
    time: ts.slice(0, 10),
    read: false,
    created_at: ts,
  });

  // 8b. Automated breach email (non-blocking if SMTP unconfigured)
  try {
    const owner =
      (await db.get("users", failedAccount.user_id).catch(() => null)) ||
      (await db.findOne(
        "users",
        (u) =>
          String(u.email || "").toLowerCase() ===
          String(failedAccount.user_email || "").toLowerCase(),
      ));
    const storedEmailCfg = await db.get("settings", "email_config");
    const emailCfg = resolveEmailConfig(storedEmailCfg);
    const recipient = owner?.email || failedAccount.user_email;
    if (recipient) {
      const res = await sendAccountBreachEmail({
        to: recipient,
        name: owner?.name || "",
        account: failedAccount,
        breach: {
          reason: breachReason,
          equity: snapshot.current_equity,
          breached_at: ts,
        },
        config: emailCfg,
        origin,
      });
      await logRiskEmail(db, appendEmailLog, {
        trigger: "account_breach",
        recipient,
        subject: `Account Failed — ${failedAccount.plan_name} (${failedAccount.account_number})`,
        res,
        emailCfg,
      });
    }
  } catch {
    // Email failure never rolls back a risk breach
  }

  return { account: failedAccount, breached: true, breachRecord };
}

export async function triggerChallengePass({
  db,
  account,
  snapshot,
  nowIso,
  origin = "",
  appendEmailLog,
}) {
  const ts = nowIso || new Date().toISOString();
  if (String(account.status || "") === "Passed") {
    return { account, passed: false, alreadyPassed: true };
  }

  const productType = getAccountProductType(account);
  const isClassic = productType === PRODUCT_TYPES.CLASSIC;
  const rawCfg = await db.get("settings", "funding_products");
  const cfg = normalizeFundingProductsConfig(rawCfg);
  const autoActivate =
    account.auto_activate_funded !== undefined
      ? Boolean(account.auto_activate_funded)
      : isClassic
        ? true
        : Boolean(cfg.one_step.auto_activate_funded);

  let fundedAccount = null;
  if (autoActivate) {
    const existingFunded = await db.findOne(
      "trader_accounts",
      (a) => a.parent_account_id === account.id,
    );
    if (existingFunded) {
      fundedAccount = existingFunded;
    } else {
      const cap = num(account.starting_capital, 100000);
      const todayKey = getIstDateKey(ts);
      const fundedPrefix = isClassic ? "IF-FD" : "IF-1F";
      const fundedProductType = isClassic
        ? PRODUCT_TYPES.CLASSIC
        : PRODUCT_TYPES.ONE_STEP_FUNDED;
      const defaultSplit = isClassic ? 70 : cfg.one_step.profit_split || 80;
      const cleanPlan = String(
        account.plan_name || (isClassic ? "IndiFunded" : "1-Step"),
      )
        .replace(/Challenge/i, "")
        .trim();
      fundedAccount = {
        id: `acct-funded-${account.id}`,
        parent_account_id: account.id,
        order_id: account.order_id || "",
        account_number: `${fundedPrefix}-${String(account.id).slice(-6).toUpperCase()}`,
        user_id: account.user_id,
        user_email: account.user_email,
        product_type: fundedProductType,
        plan_id: account.plan_id,
        plan_name: `${cleanPlan || "IndiFunded"} Funded`,
        account_type: "Funded",
        starting_capital: cap,
        balance: cap,
        current_equity: cap,
        open_pnl: 0,
        available_margin: cap,
        used_margin: 0,
        realized_pnl: 0,
        daily_starting_balance: cap,
        current_trading_day: todayKey,
        highest_recorded_equity: cap,
        eod_high_watermark: cap,
        intraday_peak_equity: cap,
        trailing_drawdown_floor: +(
          cap *
          (1 - snapshot.max_loss_limit_pct / 100)
        ).toFixed(2),
        profit_target_pct: 0,
        daily_loss_limit_pct: snapshot.daily_loss_limit_pct,
        max_loss_limit: snapshot.max_loss_limit_pct,
        overall_loss_limit_pct: snapshot.max_loss_limit_pct,
        min_trading_days: 0,
        total_trading_days: isClassic ? account.total_trading_days || 30 : 0,
        no_time_limit: !isClassic,
        trades_per_day:
          account.trades_per_day != null
            ? Number(account.trades_per_day) || 0
            : 0,
        profit_split: account.profit_split || defaultSplit,
        breach_policy: account.breach_policy || "close_all_and_fail",
        automation_enabled: true,
        automation_started_at: ts,
        status: "Funded",
        trading_enabled: true,
        note: `Auto-activated after passing ${account.account_number}`,
        created_at: ts,
        updated_at: ts,
      };
      await db.put("trader_accounts", fundedAccount);
      await db.put("fund_transactions", {
        id: uuid(),
        user_id: account.user_id,
        user_email: account.user_email,
        account_id: fundedAccount.id,
        account_number: fundedAccount.account_number,
        kind: "funded_allocation",
        amount: cap,
        balance_after: cap,
        note: `Auto-activated ${isClassic ? "IndiFunded" : "1-Step"} Funded account after passing ${account.account_number}`,
        created_at: ts,
      });
    }
  }

  const passedAccount = {
    ...account,
    status: "Passed",
    funded_eligible: true,
    funded_eligible_at: ts,
    passed_at: ts,
    trading_enabled: false,
    linked_funded_account_id:
      fundedAccount?.id || account.linked_funded_account_id || null,
    current_equity: snapshot.current_equity,
    trading_days_done: snapshot.trading_days,
    profitable_days_done: snapshot.profitable_days,
    profit_target_progress_pct: 100,
    updated_at: ts,
  };
  await db.put("trader_accounts", passedAccount);

  const label = isClassic
    ? "IndiFunded Challenge Passed"
    : "1-Step Challenge Passed";
  await db.put("risk_events", {
    id: `re-${uuid().slice(0, 8)}`,
    account_id: passedAccount.id,
    account_number: passedAccount.account_number,
    user_id: passedAccount.user_id,
    user_email: passedAccount.user_email,
    product_type: productType,
    event_type: "CHALLENGE_PASSED",
    title: `${label} (${passedAccount.account_number})`,
    detail: fundedAccount
      ? `Target ${snapshot.profit_target_pct}% achieved across ${snapshot.trading_days} trading days. Funded account ${fundedAccount.account_number} activated.`
      : `Target ${snapshot.profit_target_pct}% achieved across ${snapshot.trading_days} trading days. Eligible for funded activation.`,
    metrics: {
      equity: snapshot.current_equity,
      trading_days: snapshot.trading_days,
      min_trading_days: snapshot.min_trading_days,
      funded_account_id: fundedAccount?.id || null,
      funded_account_number: fundedAccount?.account_number || null,
    },
    created_at: ts,
  });

  await db.put("user_notifications", {
    id: `nt-${uuid().slice(0, 8)}`,
    user_id: passedAccount.user_id,
    type: "progress",
    title: `${label}: ${passedAccount.account_number}`,
    body: fundedAccount
      ? `Congratulations! You reached the ${snapshot.profit_target_pct}% target with ${snapshot.trading_days} trading days. Your funded account ${fundedAccount.account_number} is now live.`
      : `Congratulations! You passed the evaluation and are now eligible for a funded account.`,
    time: ts.slice(0, 10),
    read: false,
    created_at: ts,
  });

  try {
    const owner =
      (await db.get("users", passedAccount.user_id).catch(() => null)) ||
      (await db.findOne(
        "users",
        (u) =>
          String(u.email || "").toLowerCase() ===
          String(passedAccount.user_email || "").toLowerCase(),
      ));
    const storedEmailCfg = await db.get("settings", "email_config");
    const emailCfg = resolveEmailConfig(storedEmailCfg);
    const recipient = owner?.email || passedAccount.user_email;
    if (recipient) {
      const res = await sendChallengePassedEmail({
        to: recipient,
        name: owner?.name || "",
        challengeAccount: passedAccount,
        fundedAccount,
        config: emailCfg,
        origin,
      });
      await logRiskEmail(db, appendEmailLog, {
        trigger: "challenge_passed",
        recipient,
        subject: `Challenge Passed — ${passedAccount.plan_name} (${passedAccount.account_number})`,
        res,
        emailCfg,
      });
    }
  } catch {
    // Non-fatal
  }

  return { account: passedAccount, fundedAccount, passed: true };
}

export const triggerOneStepPass = triggerChallengePass;

/**
 * Authoritative automated risk & challenge-goal evaluation pass across Instant, 1-Step, and IndiFunded Classic accounts.
 */
export async function evaluateAccountRisk({
  db,
  account,
  quoteMap,
  nowIso,
  settleEod = false,
  origin = "",
  appendEmailLog,
}) {
  if (!account) return { account: null, skipped: true };
  const productType = getAccountProductType(account);

  const ts = nowIso || new Date().toISOString();
  const currentIstDay = getIstDateKey(ts);

  // Terminal states never re-evaluate or allow trading
  if (
    String(account.status || "") === "Failed" ||
    String(account.status || "") === "Passed"
  ) {
    return { account, terminal: true };
  }

  const [allOrders, allPositions, allTrades, siteDoc] = await Promise.all([
    db.all("virtual_orders"),
    db.all("virtual_positions"),
    db.all("virtual_trades"),
    db.get("settings", "site"),
  ]);
  const evaluationRisk = {
    ...DEFAULT_SETTINGS.evaluation_risk,
    ...(siteDoc?.evaluation_risk || {}),
  };

  const orders = allOrders.filter((o) => o.account_id === account.id);
  const positions = allPositions.filter(
    (p) => p.account_id === account.id && Number(p.qty || 0) !== 0,
  );
  const trades = allTrades.filter((t) => t.account_id === account.id);

  // Feed-safety guard: never breach based on missing or zero market quotes when positions are open
  let resolvedQuotes = quoteMap;
  if (positions.length > 0) {
    if (!resolvedQuotes) {
      const fetched = await fetchQuoteMapForPositions(positions);
      if (!fetched.feedOk) {
        return {
          account,
          skippedBreachCheck: true,
          reason: "FEED_UNAVAILABLE",
        };
      }
      resolvedQuotes = fetched.quoteMap;
    } else {
      const missingPositions = positions.filter((p) => {
        const s = String(p.symbol || "").toUpperCase();
        const entry = resolvedQuotes[s];
        const ltp = Number(
          entry && typeof entry === "object" ? entry.ltp : entry,
        );
        return !(Number.isFinite(ltp) && ltp > 0);
      });
      if (missingPositions.length > 0) {
        const fetched = await fetchQuoteMapForPositions(missingPositions);
        if (!fetched.feedOk) {
          return {
            account,
            skippedBreachCheck: true,
            reason: "FEED_UNAVAILABLE",
          };
        }
        resolvedQuotes = { ...fetched.quoteMap, ...resolvedQuotes };
      }
    }
  } else if (!resolvedQuotes) {
    resolvedQuotes = {};
  }

  // Handle trading day rollover & EOD settlement cleanly
  let working = { ...account };
  const cap = num(working.starting_capital, num(working.balance, 0));
  if (
    working.current_trading_day &&
    working.current_trading_day !== currentIstDay
  ) {
    if (
      productType === PRODUCT_TYPES.INSTANT &&
      String(working.drawdown_mode || "intraday").toLowerCase() === "eod"
    ) {
      const prevBal = num(working.balance, cap);
      working.eod_high_watermark = Math.max(
        num(working.eod_high_watermark, cap),
        prevBal,
      );
      working.highest_recorded_equity = working.eod_high_watermark;
    }
    working.daily_starting_balance = num(working.balance, cap);
    working.current_trading_day = currentIstDay;
  } else {
    if (!working.current_trading_day)
      working.current_trading_day = currentIstDay;
    if (working.daily_starting_balance == null)
      working.daily_starting_balance = num(working.balance, cap);
  }

  let snapshot = computeAccountRiskSnapshot({
    account: working,
    trades,
    positions,
    orders,
    quoteMap: resolvedQuotes,
    evaluationRisk,
    nowIso: ts,
  });

  // Check breaches against current active floors BEFORE raising EOD watermark on explicit settleEod
  let breachCode = "";
  let breachReason = "";

  if (productType === PRODUCT_TYPES.INSTANT) {
    if (
      snapshot.daily_loss_limit_amt > 0 &&
      snapshot.current_equity <= snapshot.daily_loss_floor + 0.01
    ) {
      breachCode = "DAILY_LOSS_LIMIT";
      breachReason = `Daily loss limit (${snapshot.daily_loss_limit_pct}%) breached: equity ₹${snapshot.current_equity.toLocaleString("en-IN")} fell to/below daily floor ₹${snapshot.daily_loss_floor.toLocaleString("en-IN")}.`;
    } else if (
      snapshot.current_equity <=
      snapshot.trailing_drawdown_floor + 0.01
    ) {
      breachCode = "TRAILING_DRAWDOWN";
      const modeLabel = snapshot.drawdown_mode === "eod" ? "EOD" : "Intraday";
      breachReason = `${modeLabel} ${snapshot.trailing_drawdown_pct}% trailing drawdown floor breached: equity ₹${snapshot.current_equity.toLocaleString("en-IN")} fell to/below trailing floor ₹${snapshot.trailing_drawdown_floor.toLocaleString("en-IN")}.`;
    }
  } else {
    // Applies cleanly to BOTH 1-Step and IndiFunded Classic (Challenge & Funded)
    if (
      snapshot.daily_loss_limit_amt > 0 &&
      snapshot.current_equity <= snapshot.daily_loss_floor + 0.01
    ) {
      breachCode = "DAILY_LOSS_LIMIT";
      breachReason = `Daily loss limit (${snapshot.daily_loss_limit_pct}%) breached: equity ₹${snapshot.current_equity.toLocaleString("en-IN")} fell to/below daily floor ₹${snapshot.daily_loss_floor.toLocaleString("en-IN")}.`;
    } else if (
      snapshot.starting_capital > 0 &&
      snapshot.current_equity <= snapshot.trailing_drawdown_floor + 0.01
    ) {
      breachCode = "MAX_OVERALL_LOSS";
      breachReason = `Maximum overall loss (${snapshot.max_loss_limit_pct}%) breached: equity ₹${snapshot.current_equity.toLocaleString("en-IN")} fell to/below loss floor ₹${snapshot.trailing_drawdown_floor.toLocaleString("en-IN")}.`;
    } else if (
      productType === PRODUCT_TYPES.CLASSIC &&
      String(working.account_type || "") === "Challenge" &&
      working.automation_started_at &&
      Number(
        working.total_trading_days || evaluationRisk.total_trading_days || 0,
      ) > 0
    ) {
      const startMs = new Date(working.automation_started_at).getTime();
      const nowMs = new Date(ts).getTime();
      const totalDaysAllowed = Number(
        working.total_trading_days || evaluationRisk.total_trading_days || 30,
      );
      if (startMs && nowMs > startMs) {
        const elapsedDays = Math.floor((nowMs - startMs) / 86400000);
        if (
          elapsedDays >= totalDaysAllowed &&
          !(
            snapshot.profit_target_amt > 0 &&
            snapshot.net_profit >= snapshot.profit_target_amt - 0.01 &&
            snapshot.trading_days >= snapshot.min_trading_days
          )
        ) {
          breachCode = "TRADING_PERIOD_EXPIRED";
          breachReason = `Evaluation period (${totalDaysAllowed} days) expired before completing target ₹${snapshot.profit_target_amt.toLocaleString("en-IN")} and ${snapshot.min_trading_days} min trading days.`;
        }
      }
    }
  }

  if (breachCode) {
    return triggerAccountBreach({
      db,
      account: working,
      breachCode,
      breachReason,
      snapshot,
      positions,
      orders,
      quoteMap: resolvedQuotes,
      nowIso: ts,
      origin,
      appendEmailLog,
    });
  }

  // If explicit EOD settlement requested for Instant Funding (EOD mode) and not breached above:
  if (
    settleEod &&
    productType === PRODUCT_TYPES.INSTANT &&
    snapshot.drawdown_mode === "eod"
  ) {
    const nextEodWatermark = Math.max(
      snapshot.eod_high_watermark,
      snapshot.current_equity,
    );
    working.eod_high_watermark = nextEodWatermark;
    working.highest_recorded_equity = nextEodWatermark;
    working.last_eod_settled_at = ts;
    snapshot = computeAccountRiskSnapshot({
      account: working,
      trades,
      positions,
      orders,
      quoteMap: resolvedQuotes,
      evaluationRisk,
      nowIso: ts,
    });
  }

  // Check Challenge auto-pass conditions for 1-Step and IndiFunded Classic Challenge accounts
  const isChallengeAccount =
    productType === PRODUCT_TYPES.ONE_STEP ||
    (productType === PRODUCT_TYPES.CLASSIC &&
      String(working.account_type || "") === "Challenge");
  if (
    isChallengeAccount &&
    snapshot.profit_target_amt > 0 &&
    snapshot.net_profit >= snapshot.profit_target_amt - 0.01 &&
    snapshot.trading_days >= snapshot.min_trading_days
  ) {
    return triggerChallengePass({
      db,
      account: {
        ...working,
        highest_recorded_equity: snapshot.highest_recorded_equity,
        intraday_peak_equity: snapshot.intraday_peak_equity,
        trailing_drawdown_floor: snapshot.trailing_drawdown_floor,
      },
      snapshot,
      nowIso: ts,
      origin,
      appendEmailLog,
    });
  }

  // Persist refreshed live metrics on non-breached active/funded account
  const updated = {
    ...working,
    current_equity: snapshot.current_equity,
    open_pnl: snapshot.open_pnl,
    daily_starting_balance: snapshot.daily_starting_balance,
    daily_loss: snapshot.daily_loss,
    daily_loss_floor: snapshot.daily_loss_floor,
    overall_drawdown: snapshot.overall_drawdown,
    highest_recorded_equity: snapshot.highest_recorded_equity,
    eod_high_watermark: snapshot.eod_high_watermark,
    intraday_peak_equity: snapshot.intraday_peak_equity,
    trailing_drawdown_floor: snapshot.trailing_drawdown_floor,
    profit_target_progress_pct: snapshot.profit_target_progress_pct,
    trading_days_done: snapshot.trading_days,
    profitable_days_done: snapshot.profitable_days,
    buffer_amount: snapshot.buffer_amount,
    buffer_satisfied: snapshot.buffer_satisfied,
    withdrawable_profit: snapshot.withdrawable_profit,
    payout_eligible: snapshot.payout_eligible,
    trading_enabled: true,
    updated_at: ts,
  };
  await db.put("trader_accounts", updated);
  return { account: updated, snapshot, breached: false, passed: false };
}

/**
 * Evaluates all active/funded accounts (Classic, 1-Step, Instant) automatically.
 */
export async function evaluateAccountsBatch({
  db,
  accounts = [],
  quoteMap,
  nowIso,
  settleEod = false,
  origin = "",
  appendEmailLog,
}) {
  const activeTargets = accounts.filter((a) =>
    ["Active", "Funded"].includes(String(a.status || "")),
  );
  if (!activeTargets.length)
    return { evaluated: 0, breached: 0, passed: 0, results: [] };

  let resolvedQuotes = quoteMap;
  if (!resolvedQuotes) {
    const allPositions = await db.all("virtual_positions");
    const targetIds = new Set(activeTargets.map((a) => a.id));
    const openPos = allPositions.filter(
      (p) => targetIds.has(p.account_id) && Number(p.qty || 0) !== 0,
    );
    if (openPos.length > 0) {
      const fetched = await fetchQuoteMapForPositions(openPos);
      if (fetched.feedOk) {
        resolvedQuotes = fetched.quoteMap;
      }
    } else {
      resolvedQuotes = {};
    }
  }

  const results = [];
  let breached = 0;
  let passed = 0;
  for (const acct of activeTargets) {
    const r = await evaluateAccountRisk({
      db,
      account: acct,
      quoteMap: resolvedQuotes,
      nowIso,
      settleEod,
      origin,
      appendEmailLog,
    });
    if (r.breached) breached++;
    if (r.passed) passed++;
    results.push(r);
  }
  return { evaluated: activeTargets.length, breached, passed, results };
}
