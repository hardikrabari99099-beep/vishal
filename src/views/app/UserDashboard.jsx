import { useCallback, useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useAuth } from "../../context/AuthContext";
import { api, formatINR } from "../../lib/api";
import {
  PRODUCT_TYPES,
  getAccountProductType,
  productBadgeLabel,
} from "../../lib/funding-products";
import { TradingOverview, StatusPill } from "./TraderScreens";
import {
  Wallet,
  Briefcase,
  Award,
  ArrowRight,
  Rocket,
  ArrowDownLeft,
  CandlestickChart,
  Plus,
  Clock,
  CheckCircle2,
} from "lucide-react";

export default function UserDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [payoutInfo, setPayoutInfo] = useState(null);
  const [certsCount, setCertsCount] = useState(0);

  const load = useCallback(() => {
    api
      .get("/me/dashboard")
      .then((r) => setData(r.data))
      .catch(() => {});
    api
      .get("/me/payouts")
      .then((r) => setPayoutInfo(r.data))
      .catch(() => {});
    api
      .get("/me/certificates")
      .then((r) => setCertsCount(Array.isArray(r.data) ? r.data.length : 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 6000);
    return () => clearInterval(id);
  }, [load]);

  const firstName = (user?.name || "Trader").split(" ")[0];
  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const accounts = data?.accounts || [];
  const totalEquity = Number(data?.simulated_capital ?? 0);
  const totalStarting = accounts.reduce(
    (s, a) => s + Number(a.starting_capital ?? a.balance ?? 0),
    0,
  );
  const netPnl = Number(data?.net_pnl ?? 0);
  const netPct = totalStarting > 0 ? ((totalEquity - totalStarting) / totalStarting) * 100 : 0;

  const fundedCount = accounts.filter(
    (a) =>
      ["funded", "passed"].includes(String(a.status || "").toLowerCase()) ||
      String(a.account_type || "").toLowerCase() === "funded",
  ).length;
  const evalCount = Math.max(0, accounts.length - fundedCount);
  const activeCount = accounts.filter((a) =>
    ["active", "funded"].includes(String(a.status || "active").toLowerCase()),
  ).length;

  const eligiblePayout = Number(payoutInfo?.eligible ?? 0);
  const pendingPayout = Number(payoutInfo?.pending_amount ?? 0);
  const paidOut = Number(payoutInfo?.total_paid ?? data?.total_paid_out ?? 0);
  const payoutsCount = Number(data?.payouts_count ?? 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)]">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Here&apos;s how your trading is looking today.
          </p>
          <div className="text-[11px] font-mono text-[var(--muted-2)] mt-1.5">
            {todayFormatted} · Simulated trading
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <Link
            to="/app/terminal"
            className="btn-ghost rounded-xl px-4 py-2.5 text-xs font-medium inline-flex items-center justify-center gap-2 flex-1 sm:flex-initial"
          >
            <CandlestickChart size={14} className="text-[var(--emerald)]" /> Web terminal
          </Link>
          <Link
            to="/challenges"
            className="btn-amber rounded-xl px-4 py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
          >
            <Plus size={14} /> Start new evaluation
          </Link>
        </div>
      </div>

      {/* 2-Column Hero: Total Equity + Your Payouts */}
      <div className="grid lg:grid-cols-[1.45fr_1fr] gap-5">
        {/* Left Card: TOTAL EQUITY */}
        <div className="card-panel p-6 flex flex-col justify-between gap-6 tabular-nums">
          <div data-testid="stat-simulatedcapital">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)]">
                Total Equity
              </span>
              <span className="text-[11px] font-mono text-[var(--muted-2)]">
                {accounts.length} account{accounts.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="font-display text-3xl sm:text-4xl font-semibold text-[var(--text)] mt-2">
              {formatINR(totalEquity)}
            </div>
            <div className="text-xs font-mono mt-1.5 flex items-center gap-2 flex-wrap">
              <span className={netPnl >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"}>
                {netPnl >= 0 ? "+" : "−"}
                {formatINR(Math.abs(netPnl))} ({netPct >= 0 ? "+" : ""}
                {netPct.toFixed(2)}%)
              </span>
              <span className="text-[var(--muted-2)]">
                across {activeCount} active account balance{activeCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-[var(--border)]">
            <Link
              to="/app/accounts"
              className="dash-subcard p-3 hover:border-[var(--accent)] transition-colors"
              data-testid="stat-fundedaccounts"
            >
              <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>Funded</span>
                <Briefcase size={13} className="text-[var(--emerald)]" />
              </div>
              <div className="font-display text-xl font-semibold text-[var(--text)] mt-1">
                {fundedCount}
              </div>
              <div className="text-[10px] text-[var(--muted-2)]">accounts</div>
            </Link>

            <Link
              to="/app/evaluation"
              className="dash-subcard p-3 hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>In evaluation</span>
                <Clock size={13} className="text-[var(--accent-hi)]" />
              </div>
              <div className="font-display text-xl font-semibold text-[var(--text)] mt-1">
                {evalCount}
              </div>
              <div className="text-[10px] text-[var(--muted-2)]">
                account{evalCount === 1 ? "" : "s"}
              </div>
            </Link>

            <Link
              to="/app/certificates"
              className="dash-subcard p-3 hover:border-[var(--accent)] transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>Certificates</span>
                <Award size={13} className="text-amber-400" />
              </div>
              <div className="font-display text-xl font-semibold text-[var(--text)] mt-1">
                {certsCount}
              </div>
              <div className="text-[10px] text-[var(--muted-2)]">earned</div>
            </Link>

            <Link
              to="/app/payouts"
              className="dash-subcard p-3 hover:border-[var(--accent)] transition-colors"
              data-testid="stat-totalpaidout"
            >
              <div className="flex items-center justify-between text-[11px] text-[var(--muted)]">
                <span>Payouts</span>
                <CheckCircle2 size={13} className="text-[var(--emerald)]" />
              </div>
              <div className="font-display text-xl font-semibold text-[var(--text)] mt-1">
                {payoutsCount}
              </div>
              <div className="text-[10px] text-[var(--muted-2)]">settled</div>
            </Link>
          </div>
        </div>

        {/* Right Card: Your Payouts */}
        <div className="card-panel p-6 flex flex-col justify-between gap-5 tabular-nums">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[var(--text)]">
                Your payouts
              </h2>
              <Wallet size={16} className="text-[var(--emerald)]" />
            </div>
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted-2)] mt-3">
              Your Share Accrued
            </div>
            <div className="font-display text-3xl font-semibold text-[var(--emerald)] mt-1">
              {formatINR(eligiblePayout)}
            </div>
            <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
              Withdrawable profit split across funded accounts once evaluation and KYC checks are
              completed.
            </p>
          </div>

          <div className="space-y-2.5 pt-3 border-t border-[var(--border)] text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">Payouts paid to date</span>
              <span className="font-mono font-semibold text-[var(--text)]">
                {formatINR(paidOut)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--muted)]">In flight</span>
              <span className="font-mono font-semibold text-[var(--text)]">
                {formatINR(pendingPayout)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-[11px] text-[var(--muted-2)]">
              {fundedCount > 0
                ? "Request UPI or IMPS settlement anytime."
                : "Pass an evaluation to unlock payouts."}
            </span>
            <Link
              to="/app/payouts"
              className="btn-ghost rounded-xl px-3.5 py-2 text-xs font-medium shrink-0 inline-flex items-center gap-1.5"
            >
              Payouts <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* Your Accounts Section */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-baseline gap-2.5">
            <h2 className="font-display text-xl font-semibold text-[var(--text)]">Your accounts</h2>
            <span className="text-xs font-mono text-[var(--muted-2)]">
              {activeCount} active of {accounts.length}
            </span>
          </div>
          <Link
            to="/app/accounts"
            className="text-xs font-medium text-[var(--emerald)] hover:underline inline-flex items-center gap-1"
          >
            All accounts <ArrowRight size={12} />
          </Link>
        </div>

        {accounts.length ? (
          <div className="grid md:grid-cols-2 gap-4">
            {accounts.map((o, i) => {
              const pType = getAccountProductType(o);
              const isFailed =
                String(o.status || "").toLowerCase() === "failed" || o.trading_enabled === false;
              const isPassed = String(o.status || "").toLowerCase() === "passed";
              const bal = Number(o.balance ?? o.starting_capital ?? o.amount ?? 0);
              const eq = Number(o.current_equity ?? bal);
              const cap = Number(o.starting_capital ?? o.balance ?? 0);
              const pnl = Number(o.realized_pnl ?? bal - cap);
              const ruleSummary =
                pType === PRODUCT_TYPES.INSTANT
                  ? `Trailing DD ${o.trailing_drawdown_pct ?? 5}% (${String(o.drawdown_mode || "intraday").toUpperCase()}) · Buffer ${o.buffer_satisfied ? "Cleared" : `${o.buffer_pct ?? 3}%`} · Split ${o.profit_split ?? 80}%`
                  : pType === PRODUCT_TYPES.ONE_STEP
                    ? `Target ${o.profit_target_pct ?? 10}% · Max DD ${o.max_loss_limit ?? 6}% · ${o.trading_days_done ?? 0}/${o.min_trading_days ?? 3}d · ∞`
                    : pType === PRODUCT_TYPES.ONE_STEP_FUNDED
                      ? `1-Step Funded · Max DD ${o.max_loss_limit ?? 6}% · Split ${o.profit_split ?? 80}%`
                      : `Split ${o.profit_split ?? 70}% · DD ${o.max_loss_limit ?? 20}%`;

              return (
                <div
                  key={o.id || i}
                  className="card-panel p-5 flex flex-col justify-between gap-4 tabular-nums"
                  data-testid={`account-card-${i}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--emerald)]">
                          {productBadgeLabel(o)}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--muted-2)]">
                          {o.account_number || o.id} · IndiFunded-Sim
                        </span>
                      </div>
                      <div className="font-display text-lg font-semibold text-[var(--text)] mt-1.5">
                        {o.plan_name}
                      </div>
                    </div>
                    <StatusPill status={o.status || "Active"} />
                  </div>

                  {isFailed && o.breach_reason && (
                    <div className="text-xs text-[var(--rose)] bg-[var(--rose)]/10 border border-[var(--rose)]/30 rounded-lg px-3 py-2">
                      Breached: {o.breach_reason}
                    </div>
                  )}
                  {isPassed && (
                    <div className="text-xs text-[var(--emerald)] bg-[var(--emerald)]/10 border border-[var(--emerald)]/30 rounded-lg px-3 py-2">
                      {o.linked_funded_account_id
                        ? "Passed 1-Step Challenge · Funded account activated"
                        : "Passed 1-Step Challenge · Eligible for funded account"}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 py-3 border-y border-[var(--border)]">
                    <div>
                      <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">
                        Equity
                      </div>
                      <div className="font-mono text-sm font-semibold text-[var(--text)] mt-0.5">
                        {formatINR(eq)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">
                        Capital
                      </div>
                      <div className="font-mono text-sm font-semibold text-[var(--text)] mt-0.5">
                        {formatINR(cap)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">
                        Net P&amp;L
                      </div>
                      <div
                        className={`font-mono text-sm font-semibold mt-0.5 ${
                          pnl >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                        }`}
                      >
                        {pnl >= 0 ? "+" : "−"}
                        {formatINR(Math.abs(pnl))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-mono text-[var(--muted-2)]">
                      {ruleSummary}
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/app/accounts?account=${encodeURIComponent(o.id)}`}
                        className="btn-ghost rounded-xl px-3 py-1.5 text-xs font-medium"
                      >
                        Details
                      </Link>
                      <Link
                        to={`/app/terminal?account=${encodeURIComponent(o.id)}`}
                        className={
                          isFailed
                            ? "btn-ghost rounded-xl px-3.5 py-1.5 text-xs font-medium text-[var(--rose)] inline-flex items-center gap-1"
                            : "btn-amber rounded-xl px-3.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1"
                        }
                      >
                        {isFailed ? "Locked" : "Trade"} <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card-panel p-8 text-center" data-testid="no-accounts-cta">
            <Rocket size={24} className="text-[var(--accent)] mx-auto" />
            <div className="font-display text-xl text-[var(--text)] mt-3">
              No funded account yet
            </div>
            <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto">
              Your simulated trading balance is currently ₹0. Purchase a challenge plan to unlock
              capital and start trading live NSE &amp; BSE instruments.
            </p>
            <Link
              to="/challenges"
              className="btn-amber rounded-xl px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-2 mt-5"
            >
              Start new evaluation <ArrowRight size={14} />
            </Link>
          </div>
        )}
      </section>

      {/* Recent Ledger Activity */}
      {!!data?.recent_transactions?.length && (
        <section>
          <div className="flex items-end justify-between mb-4">
            <h2 className="font-display text-xl font-semibold text-[var(--text)]">
              Recent fund credits &amp; ledger
            </h2>
            <Link to="/app/accounts" className="text-xs text-[var(--emerald)] hover:underline">
              Account details →
            </Link>
          </div>
          <div className="card-panel divide-y divide-[var(--border)]">
            {data.recent_transactions.map((tx) => {
              const isDebit = tx.kind === "debit";
              return (
                <div
                  key={tx.id}
                  className="p-4 flex items-center justify-between gap-4 tabular-nums"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="notif-icon">
                      <ArrowDownLeft size={16} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--text)] truncate">
                        {tx.note || tx.kind}
                      </div>
                      <div className="text-xs text-[var(--muted-2)] font-mono">
                        {tx.account_number || tx.account_id} ·{" "}
                        {new Date(tx.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono font-semibold ${
                        isDebit ? "text-[var(--rose)]" : "text-[var(--emerald)]"
                      }`}
                    >
                      {isDebit ? "−" : "+"}
                      {formatINR(tx.amount)}
                    </div>
                    <div className="text-[11px] text-[var(--muted-2)]">
                      Bal {formatINR(tx.balance_after)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!!accounts.length && <TradingOverview />}
    </div>
  );
}
