import { StatusPill } from "./TraderScreens";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "@/lib/router-compat";
import { api, formatINR } from "../../lib/api";
import {
  PRODUCT_TYPES,
  computeAccountRiskSnapshot,
  getAccountProductType,
  isClassicProduct,
  productBadgeLabel,
} from "../../lib/funding-products";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Rocket,
  CandlestickChart,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Monitor,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Plus,
} from "lucide-react";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function signedINR(n) {
  const v = Number(n || 0);
  return `${v >= 0 ? "+" : "−"}${formatINR(Math.abs(v))}`;
}

export default function UserAccounts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAcctParam = searchParams.get("account") || "";

  const [traderAccounts, setTraderAccounts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [detailState, setDetailState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [detailTab, setDetailTab] = useState("Overview");
  const [copiedId, setCopiedId] = useState("");
  const [calCursor, setCalCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const load = useCallback(() => {
    api
      .get("/me/accounts")
      .then((r) => {
        const d = r.data;
        if (Array.isArray(d)) {
          setOrders(d);
        } else {
          setTraderAccounts(d?.accounts || []);
          setOrders(d?.orders || []);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 6000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!selectedAcctParam) {
      setDetailState(null);
      return;
    }
    api
      .get("/me/trading-state", { params: { account_id: selectedAcctParam } })
      .then((r) => setDetailState(r.data))
      .catch(() => {});
  }, [selectedAcctParam]);

  const selectedAcct = useMemo(
    () =>
      traderAccounts.find(
        (a) => a.id === selectedAcctParam || a.account_number === selectedAcctParam,
      ) ||
      detailState?.activeAccount ||
      null,
    [traderAccounts, selectedAcctParam, detailState],
  );

  const openDetail = (acctId) => {
    setDetailTab("Overview");
    setSearchParams({ account: acctId });
  };

  const closeDetail = () => {
    setSearchParams({});
  };

  const copyText = (text, id) => {
    try {
      navigator.clipboard.writeText(String(text || ""));
      setCopiedId(id);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedId(""), 1800);
    } catch {
      // ignore
    }
  };

  const statusBadge = (s) => {
    const map = {
      pending_payment: { bg: "rgba(245,182,56,0.15)", text: "#e8b04a", label: "Awaiting payment" },
      pending_verification: { bg: "rgba(245,182,56,0.15)", text: "#e8b04a", label: "Pending" },
      completed: { bg: "rgba(41,211,154,0.15)", text: "var(--emerald)", label: "Active" },
      rejected: { bg: "rgba(255,85,116,0.15)", text: "var(--rose)", label: "Rejected" },
    };
    const m = map[s] || map.pending_verification;
    return (
      <span
        className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full"
        style={{ background: m.bg, color: m.text }}
      >
        {m.label}
      </span>
    );
  };

  // Account Detail View (?account=<id>)
  if (selectedAcctParam && selectedAcct) {
    const pType = getAccountProductType(selectedAcct);
    const isClassic = isClassicProduct(selectedAcct);
    const isInstant = pType === PRODUCT_TYPES.INSTANT;
    const isOneStep = pType === PRODUCT_TYPES.ONE_STEP;
    const isFailed =
      String(selectedAcct.status || "").toLowerCase() === "failed" ||
      selectedAcct.trading_enabled === false;
    const isPassed = String(selectedAcct.status || "").toLowerCase() === "passed";

    const trades = detailState?.trades || [];
    const acctOrders = detailState?.orders || [];
    const acctPositions = detailState?.positions || [];
    const transactions = (detailState?.transactions || []).filter(
      (t) => t.account_id === selectedAcct.id || t.account_number === selectedAcct.account_number,
    );
    const er = detailState?.evaluation_risk || {};
    const snap = computeAccountRiskSnapshot({
      account: selectedAcct,
      trades,
      positions: acctPositions,
      orders: acctOrders,
      evaluationRisk: er,
    });

    const cap = snap.starting_capital;
    const bal = snap.current_balance;
    const equity = snap.current_equity;
    const netPnl = +(bal - cap).toFixed(2);
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayPnl = trades
      .filter((t) => String(t.created_at || t.out || "").startsWith(todayStr))
      .reduce((s, t) => s + Number(t.pnl || 0), 0);

    const targetPct = snap.profit_target_pct;
    const dailyLossPct = snap.daily_loss_limit_pct;
    const maxLossPct = snap.max_loss_limit_pct;
    const targetAmt = Math.round(snap.profit_target_amt);
    const targetPctDone = snap.profit_target_progress_pct;
    const maxLossFloor = snap.trailing_drawdown_floor;
    const maxLossRoom = snap.overall_loss_room;
    const minDays = snap.min_trading_days;
    const daysDone = snap.trading_days;
    const tradesPerDayLimit = isClassic
      ? Number(selectedAcct.trades_per_day ?? er.trades_per_day ?? 5)
      : Number(selectedAcct.trades_per_day ?? 0);

    // Trading stats
    const wins = trades.filter((t) => Number(t.pnl || 0) > 0);
    const losses = trades.filter((t) => Number(t.pnl || 0) < 0);
    const winRate = trades.length ? Math.round((wins.length / trades.length) * 100) : 0;
    const grossWin = wins.reduce((s, t) => s + Number(t.pnl || 0), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl || 0), 0));
    const profitFactor =
      grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? "∞" : "—";
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const bestTrade = trades.length ? Math.max(...trades.map((t) => Number(t.pnl || 0))) : 0;
    const worstTrade = trades.length ? Math.min(...trades.map((t) => Number(t.pnl || 0))) : 0;

    // Equity curve points
    const chrono = [...trades].reverse();
    let runBal = cap;
    const curve = [runBal];
    for (const t of chrono) {
      runBal += Number(t.pnl || 0);
      curve.push(runBal);
    }
    if (curve.length === 1) curve.push(bal);
    const lo = Math.min(...curve);
    const hi = Math.max(...curve);
    const pts = curve
      .map(
        (v, idx) =>
          `${(idx / Math.max(1, curve.length - 1)) * 600},${140 - ((v - lo) / (hi - lo || 1)) * 120}`,
      )
      .join(" ");

    // Calendar data
    const dailyMap = {};
    for (const t of trades) {
      const d = String(t.out || t.created_at || "").slice(0, 10);
      if (d) dailyMap[d] = (dailyMap[d] || 0) + Number(t.pnl || 0);
    }
    const { y, m } = calCursor;
    const firstDow = new Date(y, m, 1).getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();
    const monthPrefix = `${y}-${String(m + 1).padStart(2, "0")}`;
    const monthEntries = Object.entries(dailyMap).filter(([d]) => d.startsWith(monthPrefix));
    const monthPnl = monthEntries.reduce((s, [, v]) => s + v, 0);

    const ruleRows = isInstant
      ? [
          ["Program", "Instant Funding (Immediate Funded)"],
          [
            "Drawdown calculation",
            snap.drawdown_mode === "eod"
              ? "EOD Trailing (5% from End-of-Day peak)"
              : "Intraday Trailing (5% from live equity peak)",
          ],
          ["Highest watermark", formatINR(snap.highest_recorded_equity)],
          ["Trailing DD floor", formatINR(snap.trailing_drawdown_floor)],
          ["Daily loss limit", `${dailyLossPct}% (${formatINR(snap.daily_loss_limit_amt)})`],
          ["Daily loss floor", formatINR(snap.daily_loss_floor)],
          [
            "Profit buffer",
            `First ${snap.buffer_pct}% (${formatINR(snap.buffer_amount)}) — ${snap.buffer_satisfied ? "Cleared" : "Building"}`,
          ],
          [
            "Payout schedule",
            snap.payout_cycle === "monthly"
              ? `Monthly (${snap.profit_split}% split · every 30d)`
              : `Bi-Weekly (${snap.profit_split}% split · every 14d)`,
          ],
          ["Withdrawable share", formatINR(snap.withdrawable_profit)],
          ["Max trades per day", tradesPerDayLimit > 0 ? `${tradesPerDayLimit}` : "Unlimited"],
          [
            "Started",
            selectedAcct.created_at
              ? new Date(selectedAcct.created_at).toLocaleDateString("en-IN")
              : "Active",
          ],
        ]
      : isOneStep
        ? [
            ["Program", "1-Step Challenge"],
            ["Profit target", `${targetPct}% (${formatINR(targetAmt)})`],
            ["Max daily loss", `${dailyLossPct}% (${formatINR(snap.daily_loss_limit_amt)})`],
            ["Daily loss floor", formatINR(snap.daily_loss_floor)],
            ["Max overall loss", `${maxLossPct}% (Floor ${formatINR(maxLossFloor)})`],
            ["Min trading days", `${daysDone} / ${minDays} days`],
            ["Max time limit", "No limit (∞)"],
            ["Funded transition", "Automatic upon passing"],
            ["Funded split", `${snap.profit_split}%`],
            ["Max trades per day", tradesPerDayLimit > 0 ? `${tradesPerDayLimit}` : "Unlimited"],
            [
              "Started",
              selectedAcct.created_at
                ? new Date(selectedAcct.created_at).toLocaleDateString("en-IN")
                : "Active",
            ],
          ]
        : [
            ...(targetPct > 0
              ? [["Profit target", `${targetPct}% (${formatINR(targetAmt)})`]]
              : [["Program", productBadgeLabel(selectedAcct)]]),
            ["Max daily loss", `${dailyLossPct}% (${formatINR((cap * dailyLossPct) / 100)})`],
            ["Max overall loss", `${maxLossPct}% (${formatINR((cap * maxLossPct) / 100)})`],
            ["Min trading days", minDays > 0 ? `${minDays} days` : "None"],
            ["Max trades per day", tradesPerDayLimit > 0 ? `${tradesPerDayLimit}` : "Unlimited"],
            ["Profit split", `${selectedAcct.profit_split ?? snap.profit_split}%`],
            [
              "Started",
              selectedAcct.created_at
                ? new Date(selectedAcct.created_at).toLocaleDateString("en-IN")
                : "Active",
            ],
          ];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <button
              type="button"
              onClick={closeDetail}
              className="text-xs text-[var(--muted)] hover:text-[var(--text)] inline-flex items-center gap-1.5 mb-2"
            >
              <ArrowLeft size={13} /> All accounts
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)]">
                {selectedAcct.plan_name}
              </h1>
              <StatusPill status={selectedAcct.status || "Active"} />
            </div>
            <div className="text-xs font-mono text-[var(--muted-2)] mt-1">
              {selectedAcct.account_number || selectedAcct.id} · IndiFunded-Sim ·{" "}
              {productBadgeLabel(selectedAcct)}
            </div>
          </div>
          {!isFailed ? (
            <Link
              to={`/app/terminal?account=${encodeURIComponent(selectedAcct.id)}`}
              className="btn-amber rounded-xl px-4 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              Trade <ArrowRight size={13} />
            </Link>
          ) : (
            <span className="text-xs font-mono uppercase tracking-wider px-3 py-2 rounded-xl border border-[var(--rose)]/40 bg-[var(--rose)]/10 text-[var(--rose)]">
              Trading Disabled
            </span>
          )}
        </div>

        {isFailed && (
          <div
            className="card-panel p-4 border-[var(--rose)]/45 bg-[var(--rose)]/10 flex items-start gap-3"
            data-testid="account-breach-banner"
          >
            <ShieldAlert size={18} className="text-[var(--rose)] shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-[var(--rose)]">
                Account Failed — Automated Breach Enforcement
              </div>
              <div className="text-[var(--text)]">
                {selectedAcct.breach_reason ||
                  "Loss limit breached. Trading has been permanently disabled."}
              </div>
              {selectedAcct.breached_at && (
                <div className="font-mono text-[11px] text-[var(--muted)]">
                  Recorded at {new Date(selectedAcct.breached_at).toLocaleString("en-IN")} · Pending
                  orders cancelled &amp; open positions squared off automatically.
                </div>
              )}
            </div>
          </div>
        )}

        {isPassed && (
          <div
            className="card-panel p-4 border-[var(--emerald)]/45 bg-[var(--emerald)]/10 flex flex-wrap items-center justify-between gap-3"
            data-testid="account-passed-banner"
          >
            <div className="flex items-start gap-3 text-xs">
              <CheckCircle2 size={18} className="text-[var(--emerald)] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold text-[var(--emerald)]">
                  1-Step Challenge Passed — Eligible for Funded Account
                </div>
                <div className="text-[var(--text)]">
                  You achieved the {targetPct}% profit target with {daysDone} trading days and zero
                  rule breaches.
                </div>
              </div>
            </div>
            {selectedAcct.linked_funded_account_id && (
              <button
                type="button"
                onClick={() => openDetail(selectedAcct.linked_funded_account_id)}
                className="btn-amber rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                Open Funded Account <ArrowRight size={13} />
              </button>
            )}
          </div>
        )}

        {/* 4 Detail KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
          <div className="card-panel p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
              Equity
            </div>
            <div className="font-display text-2xl font-semibold text-[var(--text)] mt-1.5">
              {formatINR(equity)}
            </div>
          </div>
          <div className="card-panel p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
              Starting Capital
            </div>
            <div className="font-display text-2xl font-semibold text-[var(--text)] mt-1.5">
              {formatINR(cap)}
            </div>
          </div>
          <div className="card-panel p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
              Net P&amp;L
            </div>
            <div
              className={`font-display text-2xl font-semibold mt-1.5 ${
                netPnl >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
              }`}
            >
              {signedINR(netPnl)}
            </div>
          </div>
          <div className="card-panel p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
              Today&apos;s P&amp;L
            </div>
            <div
              className={`font-display text-2xl font-semibold mt-1.5 ${
                todayPnl >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
              }`}
            >
              {signedINR(todayPnl)}
            </div>
          </div>
        </div>

        {/* 5 Detail Tabs */}
        <div className="border-b border-[var(--border)] flex gap-1 overflow-x-auto">
          {["Overview", "Calendar", "Statistics", "Trades", "Activity"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setDetailTab(tab)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                detailTab === tab
                  ? "border-[var(--accent)] text-[var(--emerald)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {detailTab === "Overview" && (
          <div className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-5 tabular-nums">
              <div className="card-panel p-5 space-y-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  {isInstant ? "Funded Risk & Buffer Guardrails" : "Trading Objectives"}
                </div>

                {!isInstant && targetPct > 0 && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[var(--muted)]">Profit target ({targetPct}%)</span>
                      <span className="font-mono text-[var(--text)]">
                        {signedINR(snap.net_profit)} / {formatINR(targetAmt)}
                      </span>
                    </div>
                    <div className="meter is-ok !mt-0">
                      <i style={{ width: `${targetPctDone}%` }} />
                    </div>
                  </div>
                )}

                {!isClassic && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[var(--muted)]">
                        Daily loss floor ({dailyLossPct}% · {formatINR(snap.daily_loss_floor)})
                      </span>
                      <span className="font-mono text-[var(--emerald)]">
                        {formatINR(snap.daily_loss_room)} room left
                      </span>
                    </div>
                    <div className="meter is-ok !mt-0">
                      <i
                        style={{
                          width: `${snap.daily_loss_limit_amt > 0 ? Math.min(100, (snap.daily_loss_room / snap.daily_loss_limit_amt) * 100) : 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-[var(--muted)]">
                      {isInstant
                        ? `Trailing DD floor (${snap.trailing_drawdown_pct}% ${snap.drawdown_mode.toUpperCase()} · ${formatINR(maxLossFloor)})`
                        : `Max overall loss floor (${maxLossPct}% · ${formatINR(maxLossFloor)})`}
                    </span>
                    <span className="font-mono text-[var(--emerald)]">
                      {formatINR(maxLossRoom)} room left
                    </span>
                  </div>
                  <div className="meter is-ok !mt-0">
                    <i
                      style={{
                        width: `${cap > 0 ? Math.min(100, (maxLossRoom / ((cap * maxLossPct) / 100)) * 100) : 100}%`,
                      }}
                    />
                  </div>
                </div>

                {isInstant && (
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-[var(--muted)]">
                        Reserved 3% Profit Buffer ({formatINR(snap.buffer_amount)})
                      </span>
                      <span className="font-mono text-[var(--text)]">
                        {snap.buffer_satisfied
                          ? `Cleared · Withdrawable ${formatINR(snap.withdrawable_profit)}`
                          : `${Math.round(snap.buffer_progress_pct)}%`}
                      </span>
                    </div>
                    <div className="meter is-ok !mt-0">
                      <i style={{ width: `${snap.buffer_progress_pct}%` }} />
                    </div>
                  </div>
                )}

                {minDays > 0 && (
                  <div className="flex justify-between text-xs pt-2 border-t border-[var(--border)]">
                    <span className="text-[var(--muted)]">Minimum trading days</span>
                    <span className="font-mono text-[var(--text)]">
                      {daysDone} / {minDays} days {isOneStep ? "· No time limit (∞)" : ""}
                    </span>
                  </div>
                )}
              </div>

              <div className="card-panel p-5">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-3">
                  Account Rules
                </div>
                <div className="divide-y divide-[var(--border)] text-xs">
                  {ruleRows.map(([k, v]) => (
                    <div key={k} className="py-2 flex items-center justify-between gap-4">
                      <span className="text-[var(--muted)]">{k}</span>
                      <span className="font-mono text-[var(--text)] text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="card-panel p-5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-3">
                Equity trajectory
              </div>
              <svg viewBox="0 0 600 150" className="w-full h-40 equity-svg">
                <polyline points={pts} />
                <polygon points={`0,150 ${pts} 600,150`} />
              </svg>
            </div>
          </div>
        )}

        {detailTab === "Calendar" && (
          <div className="card-panel p-5 tabular-nums">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <div className="font-display text-lg font-semibold text-[var(--text)]">
                  {MONTHS[m]} {y}
                </div>
                <div className="text-xs font-mono text-[var(--muted-2)]">
                  Month P&amp;L:{" "}
                  <span className={monthPnl >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"}>
                    {signedINR(monthPnl)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setCalCursor((c) =>
                      c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 },
                    )
                  }
                  className="btn-ghost p-2 rounded-lg"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCalCursor((c) =>
                      c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 },
                    )
                  }
                  className="btn-ghost p-2 rounded-lg"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
            <div className="cal-grid">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="cal-head">
                  {d}
                </div>
              ))}
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`pad-${i}`} className="cal-day is-off" />
              ))}
              {Array.from({ length: totalDays }).map((_, i) => {
                const day = i + 1;
                const key = `${monthPrefix}-${String(day).padStart(2, "0")}`;
                const val = dailyMap[key];
                const hasTrade = val !== undefined;
                return (
                  <div
                    key={key}
                    className={`cal-day ${hasTrade ? (val >= 0 ? "is-up" : "is-down") : ""}`}
                  >
                    <span>{day}</span>
                    {hasTrade && <strong>{signedINR(val)}</strong>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {detailTab === "Statistics" && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            {[
              ["Win rate", `${winRate}%`, `${wins.length}W / ${losses.length}L`],
              ["Profit factor", String(profitFactor), "Gross profit / loss"],
              ["Average win", formatINR(avgWin), "Per winning trade"],
              ["Average loss", formatINR(avgLoss), "Per losing trade"],
              ["Best trade", signedINR(bestTrade), "Single trade high"],
              ["Worst trade", signedINR(worstTrade), "Single trade low"],
              ["Total trades", String(trades.length), `${daysDone} active days`],
              ["Total orders", String(acctOrders.length), "Terminal executions"],
            ].map(([lbl, val, sub]) => (
              <div key={lbl} className="card-panel p-4">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  {lbl}
                </div>
                <div className="font-display text-2xl font-semibold text-[var(--text)] mt-1.5">
                  {val}
                </div>
                <div className="text-xs text-[var(--muted-2)] mt-1">{sub}</div>
              </div>
            ))}
          </div>
        )}

        {detailTab === "Trades" && (
          <div className="card-panel overflow-x-auto">
            <table className="w-full text-xs dash-table tabular-nums">
              <thead>
                <tr>
                  <th className="text-left">Time</th>
                  <th className="text-left">Instrument</th>
                  <th className="text-left">Side</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Exit</th>
                  <th className="text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {trades.length ? (
                  trades.map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono text-[var(--muted-2)]">
                        {String(t.out || t.created_at || "")
                          .slice(0, 16)
                          .replace("T", " ")}
                      </td>
                      <td className="font-medium text-[var(--text)]">{t.symbol}</td>
                      <td
                        className={
                          t.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                        }
                      >
                        {t.side}
                      </td>
                      <td className="text-right">{t.qty}</td>
                      <td className="text-right">{t.entry}</td>
                      <td className="text-right">{t.exit}</td>
                      <td
                        className={`text-right font-mono font-semibold ${
                          Number(t.pnl || 0) >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                        }`}
                      >
                        {signedINR(t.pnl)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-[var(--muted)]">
                      No closed trades yet on this account.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {detailTab === "Activity" && (
          <div className="card-panel divide-y divide-[var(--border)]">
            {transactions.length ? (
              transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-4 flex items-center justify-between gap-3 text-xs tabular-nums"
                >
                  <div>
                    <div className="font-medium text-[var(--text)]">{tx.note || tx.kind}</div>
                    <div className="text-[11px] font-mono text-[var(--muted-2)]">
                      {new Date(tx.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div
                    className={`font-mono font-semibold ${
                      tx.kind === "debit" ? "text-[var(--rose)]" : "text-[var(--emerald)]"
                    }`}
                  >
                    {tx.kind === "debit" ? "−" : "+"}
                    {formatINR(tx.amount)}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-[var(--muted)]">
                Account provisioned{" "}
                {selectedAcct.created_at
                  ? new Date(selectedAcct.created_at).toLocaleDateString("en-IN")
                  : "recently"}{" "}
                · No ledger adjustments yet.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Accounts List View
  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)]">
            Accounts
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Evaluation &amp; funded accounts provisioned from your plan purchases and desk
            allocations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Link
            to="/app/terminal"
            className="btn-ghost rounded-xl px-4 py-2.5 text-xs font-medium inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
          >
            <CandlestickChart size={14} className="text-[var(--emerald)]" /> Open terminal
          </Link>
          <Link
            to="/challenges"
            className="btn-amber rounded-xl px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
          >
            <Plus size={14} /> Buy new account
          </Link>
        </div>
      </div>

      {!loaded ? (
        <div className="card-panel p-8 text-center text-[var(--muted)]">Loading accounts…</div>
      ) : traderAccounts.length || orders.length ? (
        <div className="space-y-6">
          {traderAccounts.map((a, i) => {
            const pType = getAccountProductType(a);
            const isInstant = pType === PRODUCT_TYPES.INSTANT;
            const isOneStep = pType === PRODUCT_TYPES.ONE_STEP;
            const isOneStepFunded = pType === PRODUCT_TYPES.ONE_STEP_FUNDED;
            const isFailed =
              String(a.status || "").toLowerCase() === "failed" || a.trading_enabled === false;
            const isPassed = String(a.status || "").toLowerCase() === "passed";
            const snap = computeAccountRiskSnapshot({ account: a });

            const cap = snap.starting_capital;
            const bal = Number(a.current_equity ?? a.balance ?? cap);
            const pnl = Number(a.realized_pnl ?? bal - cap);
            const targetPct = snap.profit_target_pct;
            const dailyLossPct = snap.daily_loss_limit_pct;
            const maxLossPct = snap.max_loss_limit_pct;
            const targetAmt = snap.profit_target_amt;
            const targetProgress = Math.round(snap.profit_target_progress_pct);
            const maxLossFloor = snap.trailing_drawdown_floor;
            const roomLeft = snap.overall_loss_room;
            const roomPct =
              cap > 0 && maxLossPct > 0
                ? Math.min(
                    100,
                    Math.max(0, Math.round((roomLeft / ((cap * maxLossPct) / 100)) * 100)),
                  )
                : 100;

            return (
              <div
                key={a.id || i}
                className="card-panel p-5 sm:p-6 space-y-5 tabular-nums"
                data-testid={`user-account-${i}`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusPill status={a.status || "Active"} />
                      <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--bg-2)] text-[var(--muted)] border border-[var(--border)]">
                        {productBadgeLabel(a)} · {snap.profit_split}% split
                      </span>
                    </div>
                    <h2 className="font-display text-xl font-semibold text-[var(--text)] mt-2">
                      {a.plan_name}
                    </h2>
                    <div className="text-xs font-mono text-[var(--muted-2)] mt-0.5">
                      {a.account_number || a.id} · IndiFunded-Sim
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openDetail(a.id)}
                      className="btn-ghost rounded-xl px-3.5 py-2 text-xs font-medium inline-flex items-center gap-1"
                    >
                      Details <ArrowRight size={12} />
                    </button>
                    {!isFailed ? (
                      <Link
                        to={`/app/terminal?account=${encodeURIComponent(a.id)}`}
                        className="btn-amber rounded-xl px-3.5 py-2 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        Trade <ArrowRight size={12} />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openDetail(a.id)}
                        className="btn-ghost rounded-xl px-3.5 py-2 text-xs font-medium text-[var(--rose)]"
                      >
                        View Breach
                      </button>
                    )}
                  </div>
                </div>

                {isFailed && (
                  <div className="text-xs text-[var(--rose)] bg-[var(--rose)]/10 border border-[var(--rose)]/35 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
                    <ShieldAlert size={15} className="shrink-0" />
                    <span>
                      <strong>Account Failed:</strong>{" "}
                      {a.breach_reason || "Automated risk breach detected. Trading is disabled."}
                    </span>
                  </div>
                )}

                {isPassed && (
                  <div className="text-xs text-[var(--emerald)] bg-[var(--emerald)]/10 border border-[var(--emerald)]/35 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                    <span className="flex items-center gap-2">
                      <CheckCircle2 size={15} className="shrink-0" />
                      <strong>Challenge Passed:</strong> Eligible for funded account activation.
                    </span>
                    {a.linked_funded_account_id && (
                      <button
                        type="button"
                        onClick={() => openDetail(a.linked_funded_account_id)}
                        className="underline font-semibold"
                      >
                        Open Funded Account →
                      </button>
                    )}
                  </div>
                )}

                {/* 4 KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="dash-subcard p-3">
                    <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">
                      Starting Capital
                    </div>
                    <div className="font-mono text-base font-semibold text-[var(--text)] mt-1">
                      {formatINR(cap)}
                    </div>
                  </div>
                  <div className="dash-subcard p-3">
                    <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">
                      Equity (incl. open)
                    </div>
                    <div className="font-mono text-base font-semibold text-[var(--text)] mt-1">
                      {formatINR(bal)}
                    </div>
                  </div>
                  <div className="dash-subcard p-3">
                    <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">
                      Net P&amp;L
                    </div>
                    <div
                      className={`font-mono text-base font-semibold mt-1 ${
                        pnl >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                      }`}
                    >
                      {signedINR(pnl)}
                    </div>
                  </div>
                  <div className="dash-subcard p-3">
                    <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">
                      Available Margin
                    </div>
                    <div className="font-mono text-base font-semibold text-[var(--emerald)] mt-1">
                      {formatINR(a.available_margin ?? bal)}
                    </div>
                  </div>
                </div>

                {/* 2-Column Trading Objectives + Account Rules */}
                <div className="grid lg:grid-cols-2 gap-5 pt-2 border-t border-[var(--border)]">
                  <div className="space-y-3.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                      {isInstant ? "Funded Guardrails & Buffer" : "Trading Objectives"}
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[var(--muted)]">
                          {isInstant
                            ? `Trailing DD floor (${formatINR(maxLossFloor)})`
                            : `Loss floor (${formatINR(maxLossFloor)})`}
                        </span>
                        <span className="font-mono text-[var(--emerald)]">
                          {formatINR(roomLeft)} room
                        </span>
                      </div>
                      <div className="meter is-ok !mt-0">
                        <i style={{ width: `${roomPct}%` }} />
                      </div>
                    </div>

                    {isInstant ? (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[var(--muted)]">
                            3% Buffer reserve ({formatINR(snap.buffer_amount)})
                          </span>
                          <span className="font-mono text-[var(--text)]">
                            {snap.buffer_satisfied
                              ? `Cleared · Withdrawable ${formatINR(snap.withdrawable_profit)}`
                              : `${Math.round(snap.buffer_progress_pct)}%`}
                          </span>
                        </div>
                        <div className="meter is-ok !mt-0">
                          <i style={{ width: `${snap.buffer_progress_pct}%` }} />
                        </div>
                      </div>
                    ) : targetPct > 0 ? (
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[var(--muted)]">Profit target ({targetPct}%)</span>
                          <span className="font-mono text-[var(--text)]">{targetProgress}%</span>
                        </div>
                        <div className="meter is-ok !mt-0">
                          <i style={{ width: `${targetProgress}%` }} />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--emerald)] bg-[var(--bg-2)] border border-[var(--border)] rounded-lg px-3 py-2">
                        Live Funded Account · Withdraw profits under Payouts
                      </div>
                    )}

                    {a.note && (
                      <div className="text-xs text-[var(--muted)] bg-[var(--bg-2)] border border-[var(--border)] rounded-lg px-3 py-2">
                        {a.note}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2">
                      Account Rules
                    </div>
                    <div className="divide-y divide-[var(--border)] text-xs">
                      {isInstant ? (
                        <>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">Drawdown mode</span>
                            <span className="font-mono text-[var(--text)] uppercase">
                              {snap.drawdown_mode} ({snap.trailing_drawdown_pct}% trailing)
                            </span>
                          </div>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">Daily loss limit</span>
                            <span className="font-mono text-[var(--text)]">{dailyLossPct}%</span>
                          </div>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">Highest equity watermark</span>
                            <span className="font-mono text-[var(--text)]">
                              {formatINR(snap.highest_recorded_equity)}
                            </span>
                          </div>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">Payout cycle</span>
                            <span className="font-mono text-[var(--text)]">
                              {snap.payout_cycle === "monthly"
                                ? "Monthly (90%)"
                                : "Bi-Weekly (80%)"}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">Profit target</span>
                            <span className="font-mono text-[var(--text)]">
                              {targetPct > 0
                                ? `${targetPct}% (${formatINR(targetAmt)})`
                                : "None (Funded)"}
                            </span>
                          </div>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">Max daily loss</span>
                            <span className="font-mono text-[var(--text)]">{dailyLossPct}%</span>
                          </div>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">Max overall loss</span>
                            <span className="font-mono text-[var(--text)]">{maxLossPct}%</span>
                          </div>
                          <div className="py-1.5 flex justify-between">
                            <span className="text-[var(--muted)]">
                              {isOneStep
                                ? "Trading days / Time limit"
                                : isOneStepFunded
                                  ? "Program"
                                  : "Min trading days"}
                            </span>
                            <span className="font-mono text-[var(--text)]">
                              {isOneStep
                                ? `${snap.trading_days} / ${snap.min_trading_days}d · No limit`
                                : isOneStepFunded
                                  ? "1-Step Funded"
                                  : `${a.min_trading_days ?? 10} days`}
                            </span>
                          </div>
                        </>
                      )}
                      <div className="py-1.5 flex justify-between">
                        <span className="text-[var(--muted)]">Started</span>
                        <span className="font-mono text-[var(--text)]">
                          {a.created_at
                            ? new Date(a.created_at).toLocaleDateString("en-IN")
                            : "Active"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Trade on IndiFunded Web Card */}
          {traderAccounts.length > 0 && (
            <div className="card-panel p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="space-y-1.5 max-w-xl">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
                  <Monitor size={15} className="text-[var(--emerald)]" /> Trade on IndiFunded Web
                </div>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  Sign in with your IndiFunded account — the same email &amp; password you use here.
                  No separate trading password or extra terminal download required.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 w-full md:w-auto">
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[var(--border-hi)] bg-[var(--bg-2)] w-full sm:w-auto">
                  <div>
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                      Account Number
                    </div>
                    <div className="text-xs font-mono font-semibold text-[var(--text)]">
                      {traderAccounts[0].account_number || traderAccounts[0].id}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        traderAccounts[0].account_number || traderAccounts[0].id,
                        traderAccounts[0].id,
                      )
                    }
                    className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)]"
                    aria-label="Copy account number"
                  >
                    {copiedId === traderAccounts[0].id ? (
                      <Check size={13} className="text-[var(--emerald)]" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                </div>
                <Link
                  to={`/app/terminal?account=${encodeURIComponent(traderAccounts[0].id)}`}
                  className="btn-amber rounded-xl px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                >
                  Open IndiFunded Web <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          )}

          {orders.length > 0 && (
            <section className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={15} className="text-[var(--emerald)]" />
                <h2 className="font-display text-lg font-semibold text-[var(--text)]">
                  Challenge purchases ({orders.length})
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {orders.map((o, i) => (
                  <div key={o.id || i} className="card-panel p-5" data-testid={`user-order-${i}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
                          Plan order
                        </div>
                        <div className="font-display text-xl text-[var(--text)] mt-1">
                          {o.plan_name}
                        </div>
                      </div>
                      <Rocket size={17} className="text-[var(--accent)]" />
                    </div>
                    <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs tabular-nums">
                      <div className="text-[var(--muted)]">
                        Paid{" "}
                        <span className="text-[var(--text)] font-mono">{formatINR(o.amount)}</span>
                      </div>
                      {statusBadge(o.status)}
                    </div>
                    <div className="text-[11px] text-[var(--muted-2)] mt-2.5 font-mono">
                      {new Date(o.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="card-panel p-10 text-center" data-testid="accounts-empty-cta">
          <Rocket size={28} className="text-[var(--accent)] mx-auto" />
          <div className="font-display text-2xl text-[var(--text)] mt-4">
            No purchased accounts yet
          </div>
          <p className="text-sm text-[var(--muted)] mt-3 max-w-md mx-auto">
            Your simulated capital is currently ₹0. Go for a funded account to unlock your challenge
            wallet and start trading real NSE &amp; BSE prices.
          </p>
          <Link
            to="/challenges"
            className="btn-amber rounded-xl px-6 py-3 text-xs font-semibold mt-6 inline-flex items-center gap-2"
          >
            Buy new account <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
