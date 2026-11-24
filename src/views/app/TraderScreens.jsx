import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { toast } from "sonner";
import { api, formatINR, formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { useLiveMarketQuotes, formatPrice } from "../../lib/useLiveMarket";
import { useTraderState } from "../../lib/useTraderState";
import {
  PRODUCT_TYPES,
  computeAccountRiskSnapshot,
  getAccountProductType,
  isClassicProduct,
  productBadgeLabel,
} from "../../lib/funding-products";
import { CandleChart } from "../../components/CandleChart";
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  CheckCircle2,
  Bell,
  ShieldAlert,
  TrendingUp,
  Target,
  CalendarDays,
  LifeBuoy,
  Send,
  Wallet,
  BadgeCheck,
  AlertTriangle,
  Activity,
  Radio,
  ArrowRight,
  Lock,
  Pencil,
  StickyNote,
} from "lucide-react";

/* ---------- shared bits ---------- */
export function LiveFeedBadge({ status }) {
  const isLive = status === "LIVE";
  return (
    <span className={`live-badge ${isLive ? "is-live" : "is-closed"}`}>
      <Radio size={11} /> {isLive ? "NSE/BSE Live" : "NSE/BSE Last Close"}
    </span>
  );
}

function PageHead({ title, sub, badge, children }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-3xl md:text-4xl">{title}</h1>
          {badge || null}
        </div>
        {sub && <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function NoAccountCta({ title = "No active funded account", message }) {
  return (
    <div className="card-panel p-10 text-center" data-testid="no-active-account-cta">
      <Lock size={26} className="text-[var(--accent)] mx-auto" />
      <div className="font-display text-2xl mt-4">{title}</div>
      <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto">
        {message ||
          "Your trading balance is ₹0. Purchase a challenge plan first to unlock trading capital, evaluation tracking, and live risk monitoring."}
      </p>
      <Link
        to="/challenges"
        className="btn-amber rounded-full px-6 py-3 text-sm mt-6 inline-flex items-center gap-2"
      >
        Go for a funded account <ArrowRight size={14} />
      </Link>
    </div>
  );
}

const inr = (n) => formatINR(Math.round(Number(n) || 0));
const signed = (n) => `${n >= 0 ? "+" : "−"}${inr(Math.abs(n))}`;
const pnlCls = (n) => (n >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]");

export function StatusPill({ status }) {
  const s = String(status || "").toLowerCase();
  const tone = [
    "active",
    "executed",
    "paid",
    "funded",
    "approved",
    "open",
    "verified",
    "resolved",
    "passed",
  ].includes(s)
    ? "ok"
    : ["pending", "processing", "submitted", "in review", "under review"].includes(s)
      ? "wait"
      : ["failed", "rejected", "cancelled", "breached"].includes(s)
        ? "bad"
        : "neutral";
  return <span className={`status-pill is-${tone}`}>{status}</span>;
}

function Table({ cols, rows, empty = "Nothing here yet." }) {
  return (
    <div className="card-panel overflow-x-auto">
      <table className="w-full text-sm min-w-[640px] dash-table tabular-nums">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.k} className={c.right ? "text-right" : "text-left"}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={r.id || `${r.symbol || "row"}-${i}`}>
                {cols.map((c) => (
                  <td key={c.k} className={c.right ? "text-right" : ""}>
                    {c.render ? c.render(r) : r[c.k]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={cols.length} className="text-center text-[var(--muted)] py-10">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Meter({ label, value, max, money = true, warnAt = 0.7, sub }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const tone = pct >= 90 ? "bad" : pct >= warnAt * 100 ? "wait" : "ok";
  return (
    <div className="card-panel p-5 tabular-nums">
      <div className="flex justify-between text-xs text-[var(--muted-2)] uppercase tracking-wider font-mono">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="font-display text-2xl mt-2">
        {money ? inr(value) : value}{" "}
        <span className="text-sm text-[var(--muted)]">/ {money ? inr(max) : max}</span>
      </div>
      <div className={`meter is-${tone}`}>
        <i style={{ width: `${pct}%` }} />
      </div>
      {sub && <div className="text-xs text-[var(--muted)] mt-2">{sub}</div>}
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon, tone }) {
  return (
    <div className="card-panel p-5 tabular-nums">
      <div className="flex justify-between items-start">
        <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
          {label}
        </div>
        {Icon && <Icon size={16} className="text-[var(--accent)]" />}
      </div>
      <div className={`font-display text-2xl md:text-3xl mt-3 ${tone || ""}`}>{value}</div>
      {sub && <div className="text-xs text-[var(--muted-2)] mt-1">{sub}</div>}
    </div>
  );
}

export { CandleChart };

export { TradingTerminal } from "./TradingTerminal";

/* ---------- tables ---------- */
function NoteCell({ note, onEdit }) {
  return (
    <div className="flex items-center gap-2 max-w-[220px]">
      <span
        className={`truncate text-xs ${note ? "text-white" : "text-[var(--muted-2)] italic"}`}
        title={note || ""}
      >
        {note || "—"}
      </span>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="text-[var(--muted-2)] hover:text-[var(--emerald)] shrink-0 p-1 rounded"
          title={note ? "Edit note" : "Add note"}
          aria-label="Edit trade note"
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  );
}

function TradesTable({ rows, onEditNote }) {
  return (
    <Table
      rows={rows}
      empty="No closed trades yet."
      cols={[
        {
          k: "id",
          label: "Trade ID",
          render: (r) => <span className="font-mono text-xs">{r.id}</span>,
        },
        { k: "symbol", label: "Instrument" },
        {
          k: "side",
          label: "Side",
          render: (r) => (
            <span className={r.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"}>
              {r.side}
            </span>
          ),
        },
        { k: "entry", label: "Entry", right: true, render: (r) => formatPrice(r.entry) },
        { k: "exit", label: "Exit", right: true, render: (r) => formatPrice(r.exit) },
        { k: "qty", label: "Qty", right: true },
        {
          k: "note",
          label: "Note",
          render: (r) => (
            <NoteCell note={r.note} onEdit={onEditNote ? () => onEditNote(r) : null} />
          ),
        },
        {
          k: "out",
          label: "Exit time",
          render: (r) =>
            String(r.out || r.in || "")
              .slice(0, 16)
              .replace("T", " "),
        },
        {
          k: "pnl",
          label: "P&L",
          right: true,
          render: (r) => <span className={pnlCls(r.pnl)}>{signed(r.pnl)}</span>,
        },
      ]}
    />
  );
}

function PositionsTable({ rows, onClose }) {
  const cols = [
    { k: "symbol", label: "Instrument" },
    {
      k: "qty",
      label: "Qty",
      right: true,
      render: (r) => (
        <span className={r.qty >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"}>{r.qty}</span>
      ),
    },
    { k: "avg", label: "Avg entry", right: true, render: (r) => formatPrice(r.avg) },
    { k: "ltp", label: "Live LTP", right: true, render: (r) => formatPrice(r.ltp) },
    {
      k: "note",
      label: "Note",
      render: (r) => <NoteCell note={r.note} />,
    },
    {
      k: "pnl",
      label: "MTM P&L",
      right: true,
      render: (r) => <span className={pnlCls(r.pnl)}>{signed(r.pnl)}</span>,
    },
    { k: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
  ];
  if (onClose) {
    cols.push({
      k: "act",
      label: "",
      right: true,
      render: (r) => (
        <button
          type="button"
          onClick={() => onClose(r)}
          className="btn-ghost px-3 py-1 rounded-full text-xs text-[var(--rose)]"
        >
          Square off
        </button>
      ),
    });
  }
  return <Table rows={rows} empty="No open positions." cols={cols} />;
}

function OrdersTable({ rows, onEditNote }) {
  return (
    <Table
      rows={rows}
      empty="No orders placed yet."
      cols={[
        {
          k: "id",
          label: "Order ID",
          render: (r) => <span className="font-mono text-xs">{r.id}</span>,
        },
        { k: "symbol", label: "Instrument" },
        {
          k: "side",
          label: "Side",
          render: (r) => (
            <span className={r.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"}>
              {r.side}
            </span>
          ),
        },
        { k: "qty", label: "Qty", right: true },
        { k: "price", label: "Price", right: true, render: (r) => formatPrice(r.price) },
        {
          k: "note",
          label: "Note",
          render: (r) => (
            <NoteCell note={r.note} onEdit={onEditNote ? () => onEditNote(r) : null} />
          ),
        },
        {
          k: "date",
          label: "Date",
          render: (r) =>
            String(r.date || "")
              .slice(0, 16)
              .replace("T", " "),
        },
        { k: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
      ]}
    />
  );
}

export function TradeBook() {
  const { activeAccount, orders, trades, updateNote } = useTraderState({ pollMs: 8000 });
  const [viewMode, setViewMode] = useState("all"); // "all" shows every Buy & Sell immediately; "closed" shows closed P&L ledger
  const [q, setQ] = useState("");
  const [searchText, setSearchText] = useState("");
  const [noteModal, setNoteModal] = useState(null);

  const filterFn = (row) => {
    const sym = String(row.symbol || "").toUpperCase();
    if (q === "NSE" && sym.endsWith(".BO")) return false;
    if (q === "BSE" && !sym.endsWith(".BO") && sym !== "SENSEX" && sym !== "BANKEX") return false;
    if (q && q !== "NSE" && q !== "BSE" && !sym.includes(q)) return false;
    if (searchText.trim()) {
      const needle = searchText.trim().toUpperCase();
      return (
        sym.includes(needle) ||
        String(row.id || "")
          .toUpperCase()
          .includes(needle) ||
        String(row.note || "")
          .toUpperCase()
          .includes(needle)
      );
    }
    return true;
  };

  const filteredOrders = orders.filter(filterFn);
  const filteredTrades = trades.filter(filterFn);
  const totalPnl = filteredTrades.reduce((s, t) => s + Number(t.pnl || 0), 0);
  const notesCount = filteredOrders.filter((o) => String(o.note || "").trim()).length;

  const saveNote = async (e) => {
    e.preventDefault();
    if (!noteModal) return;
    try {
      await updateNote(noteModal.kind, noteModal.id, noteModal.note);
      toast.success("Note saved to Trade Book");
      setNoteModal(null);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Could not update note"));
    }
  };

  return (
    <div>
      <PageHead
        title="Trade book"
        sub={
          activeAccount
            ? `Every BUY & SELL execution, trade note, and realized P&L for ${activeAccount.account_number || activeAccount.id}.`
            : "Every BUY & SELL execution, journal note, and closed trade P&L."
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg">
            <button
              type="button"
              className={viewMode === "all" ? "is-on" : ""}
              onClick={() => setViewMode("all")}
              data-testid="tradebook-tab-all"
            >
              Buy &amp; Sell Logs ({filteredOrders.length})
            </button>
            <button
              type="button"
              className={viewMode === "closed" ? "is-on" : ""}
              onClick={() => setViewMode("closed")}
              data-testid="tradebook-tab-closed"
            >
              Closed Trades ({filteredTrades.length})
            </button>
          </div>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filter symbol / note / ID…"
            className="input-dark !w-48 !py-1.5 !px-3 text-xs"
          />
          <div className="seg flex-wrap">
            {[
              ["", "All"],
              ["NIFTY", "NIFTY"],
              ["BANKNIFTY", "BANK NIFTY"],
              ["SENSEX", "SENSEX"],
              ["NSE", "NSE"],
              ["BSE", "BSE"],
            ].map(([val, lbl]) => (
              <button
                key={val || "all"}
                className={q === val ? "is-on" : ""}
                onClick={() => setQ(val)}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </PageHead>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Buy & sell executions" value={filteredOrders.length} icon={Activity} />
        <Kpi label="Trades with notes" value={notesCount} icon={StickyNote} />
        <Kpi
          label="Winning closes"
          value={filteredTrades.filter((t) => t.pnl > 0).length}
          icon={TrendingUp}
        />
        <Kpi label="Realized P&L" value={signed(totalPnl)} tone={pnlCls(totalPnl)} icon={Wallet} />
      </div>

      {viewMode === "all" ? (
        <Table
          rows={filteredOrders}
          empty="Place a BUY or SELL trade in the Terminal — your execution & trade note appear here immediately."
          cols={[
            {
              k: "id",
              label: "Exec ID",
              render: (r) => <span className="font-mono text-xs">{r.id}</span>,
            },
            { k: "symbol", label: "Instrument" },
            {
              k: "side",
              label: "Side",
              render: (r) => (
                <span
                  className={`font-semibold ${r.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"}`}
                >
                  {r.side}
                </span>
              ),
            },
            { k: "qty", label: "Qty", right: true },
            { k: "price", label: "Exec price", right: true, render: (r) => formatPrice(r.price) },
            {
              k: "note",
              label: "Trade note",
              render: (r) => (
                <NoteCell
                  note={r.note}
                  onEdit={() => setNoteModal({ kind: "order", id: r.id, note: r.note || "" })}
                />
              ),
            },
            {
              k: "date",
              label: "Time",
              render: (r) =>
                String(r.date || r.created_at || "")
                  .slice(0, 16)
                  .replace("T", " "),
            },
            { k: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
          ]}
        />
      ) : (
        <TradesTable
          rows={filteredTrades}
          onEditNote={(r) => setNoteModal({ kind: "trade", id: r.id, note: r.note || "" })}
        />
      )}

      <Dialog open={!!noteModal} onOpenChange={(v) => !v && setNoteModal(null)}>
        <DialogContent className="max-w-sm bg-[var(--bg-2)] border-[var(--border)] text-white">
          <DialogTitle>Trade Book Note</DialogTitle>
          <DialogDescription>Update trade note for {noteModal?.id}.</DialogDescription>
          <form onSubmit={saveNote} className="space-y-4">
            <textarea
              rows={3}
              maxLength={400}
              className="input-dark text-sm"
              placeholder="Entry thesis, chart pattern, or exit reflection…"
              value={noteModal?.note || ""}
              onChange={(e) =>
                setNoteModal((prev) => (prev ? { ...prev, note: e.target.value } : prev))
              }
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full py-2 border border-[var(--border-hi)] text-sm"
                onClick={() => setNoteModal(null)}
              >
                Cancel
              </button>
              <button type="submit" className="flex-1 btn-amber rounded-full py-2 text-sm">
                Save note
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Positions() {
  const { authenticated, activeAccount, positions, closePosition } = useTraderState({
    pollMs: 5000,
  });
  const symbols = useMemo(() => {
    const set = new Set(["NIFTY", "BANKNIFTY", ...positions.map((p) => p.symbol)]);
    return Array.from(set);
  }, [positions]);
  const { quoteMap, marketStatus } = useLiveMarketQuotes(symbols, { pollMs: 5000 });
  const liveRows = useMemo(
    () =>
      positions.map((p) => {
        const ltp = quoteMap[p.symbol]?.ltp ?? p.ltp ?? p.avg;
        const pnl = +((ltp - p.avg) * p.qty).toFixed(2);
        return { ...p, ltp: +Number(ltp).toFixed(2), pnl };
      }),
    [positions, quoteMap],
  );
  const total = liveRows.reduce((s, p) => s + p.pnl, 0);
  const grossExposure = liveRows.reduce(
    (s, p) => s + Math.abs(Number(p.ltp || 0) * Number(p.qty || 0)),
    0,
  );

  const handleClose = async (pos) => {
    if (!authenticated || !pos.id) return;
    try {
      await closePosition(pos.id);
      toast.success(`Closed ${pos.symbol}`);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Square off failed"));
    }
  };

  return (
    <div>
      <PageHead
        title="Positions"
        badge={<LiveFeedBadge status={marketStatus} />}
        sub="Open positions on your active account marked live to NSE & BSE prices."
      >
        <Link to="/app/terminal" className="btn-amber rounded-full px-5 py-2 text-xs font-semibold">
          Trade in Terminal
        </Link>
      </PageHead>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Kpi
          label="Open positions"
          value={liveRows.length}
          sub={activeAccount?.account_number}
          icon={Activity}
        />
        <Kpi label="Position value" value={inr(grossExposure)} icon={Wallet} />
        <Kpi label="Unrealised MTM" value={signed(total)} tone={pnlCls(total)} icon={TrendingUp} />
      </div>
      <PositionsTable rows={liveRows} onClose={authenticated ? handleClose : null} />
    </div>
  );
}

export function Orders() {
  const { orders, updateNote } = useTraderState({ pollMs: 6000 });
  const [f, setF] = useState("All");
  const [exch, setExch] = useState("");
  const [searchText, setSearchText] = useState("");
  const [noteModal, setNoteModal] = useState(null);

  const rows = orders.filter((o) => {
    if (f !== "All" && o.status !== f) return false;
    const sym = String(o.symbol || "").toUpperCase();
    if (exch === "NSE" && sym.endsWith(".BO")) return false;
    if (exch === "BSE" && !sym.endsWith(".BO") && sym !== "SENSEX" && sym !== "BANKEX")
      return false;
    if (exch && exch !== "NSE" && exch !== "BSE" && !sym.includes(exch)) return false;
    if (searchText.trim()) {
      const needle = searchText.trim().toUpperCase();
      return (
        sym.includes(needle) ||
        String(o.id || "")
          .toUpperCase()
          .includes(needle) ||
        String(o.note || "")
          .toUpperCase()
          .includes(needle)
      );
    }
    return true;
  });

  const buyCount = rows.filter((r) => r.side === "BUY").length;
  const sellCount = rows.filter((r) => r.side === "SELL").length;
  const execCount = rows.filter((r) => r.status === "Executed").length;

  const saveNote = async (e) => {
    e.preventDefault();
    if (!noteModal) return;
    try {
      await updateNote("order", noteModal.id, noteModal.note);
      toast.success("Order note saved");
      setNoteModal(null);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Could not update note"));
    }
  };

  return (
    <div>
      <PageHead
        title="Orders"
        sub="All NSE, BSE, NIFTY, BANK NIFTY & equity orders placed on your trading account."
      >
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filter symbol / note / ID…"
            className="input-dark !w-44 !py-1.5 !px-3 text-xs"
          />
          <div className="seg flex-wrap">
            {[
              ["", "All"],
              ["NIFTY", "NIFTY"],
              ["BANKNIFTY", "BANK NIFTY"],
              ["SENSEX", "SENSEX"],
              ["NSE", "NSE"],
              ["BSE", "BSE"],
            ].map(([val, lbl]) => (
              <button
                key={val || "all"}
                className={exch === val ? "is-on" : ""}
                onClick={() => setExch(val)}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="seg">
            {["All", "Executed", "Pending", "Cancelled"].map((s) => (
              <button key={s} className={f === s ? "is-on" : ""} onClick={() => setF(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Total orders" value={rows.length} icon={Activity} />
        <Kpi label="Executed" value={execCount} tone="text-[var(--emerald)]" icon={CheckCircle2} />
        <Kpi label="Buy orders" value={buyCount} tone="text-[var(--emerald)]" />
        <Kpi label="Sell orders" value={sellCount} tone="text-[var(--rose)]" />
      </div>

      <OrdersTable rows={rows} onEditNote={(r) => setNoteModal({ id: r.id, note: r.note || "" })} />

      <Dialog open={!!noteModal} onOpenChange={(v) => !v && setNoteModal(null)}>
        <DialogContent className="max-w-sm bg-[var(--bg-2)] border-[var(--border)] text-white">
          <DialogTitle>Order Note</DialogTitle>
          <DialogDescription>Edit note for order {noteModal?.id}.</DialogDescription>
          <form onSubmit={saveNote} className="space-y-4">
            <textarea
              rows={3}
              maxLength={400}
              className="input-dark text-sm"
              placeholder="Write setup or entry reasoning…"
              value={noteModal?.note || ""}
              onChange={(e) =>
                setNoteModal((prev) => (prev ? { ...prev, note: e.target.value } : prev))
              }
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-full py-2 border border-[var(--border-hi)] text-sm"
                onClick={() => setNoteModal(null)}
              >
                Cancel
              </button>
              <button type="submit" className="flex-1 btn-amber rounded-full py-2 text-sm">
                Save note
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Evaluation (Unified Challenge Progress & Guardrails) ---------- */
export function EvaluationProgress() {
  const {
    activeAccount,
    accounts,
    evaluationRisk,
    orders,
    positions,
    trades,
    selectAccount,
    loading,
  } = useTraderState({
    pollMs: 8000,
  });

  if (loading && !activeAccount) {
    return (
      <div className="card-panel p-8 text-center text-[var(--muted)]">Loading evaluation…</div>
    );
  }

  if (!activeAccount) {
    return (
      <div>
        <PageHead
          title="Evaluation progress"
          sub="Track your challenge targets, drawdown limits, and trading day milestones."
        />
        <NoAccountCta
          title="Purchase a plan to start evaluation"
          message="Your evaluation targets and daily progress begin once you purchase a challenge plan or receive a funded account."
        />
      </div>
    );
  }

  const snap = computeAccountRiskSnapshot({
    account: activeAccount,
    trades,
    positions,
    orders,
    evaluationRisk,
  });
  const pType = snap.product_type;
  const isClassic = isClassicProduct(activeAccount);
  const isInstant = pType === PRODUCT_TYPES.INSTANT;
  const isOneStep = pType === PRODUCT_TYPES.ONE_STEP;
  const isOneStepFunded = pType === PRODUCT_TYPES.ONE_STEP_FUNDED;
  const isFailed =
    String(activeAccount.status || "").toLowerCase() === "failed" ||
    activeAccount.trading_enabled === false;
  const isPassed = String(activeAccount.status || "").toLowerCase() === "passed";

  const cap = snap.starting_capital;
  const pnl = snap.net_profit;
  const targetPct = snap.profit_target_pct;
  const targetAmt = Math.round(snap.profit_target_amt);
  const progress = Math.round(snap.profit_target_progress_pct);
  const remainingTarget = Math.max(0, Math.round(targetAmt - pnl));

  const minDays = snap.min_trading_days;
  const totalDays = Number(
    activeAccount.total_trading_days ?? (isClassic ? (evaluationRisk.total_trading_days ?? 30) : 0),
  );
  const daysDone = snap.trading_days;
  const elapsedDefault =
    activeAccount.created_at && totalDays > 0
      ? Math.max(
          1,
          Math.min(
            totalDays,
            Math.floor((Date.now() - Date.parse(activeAccount.created_at)) / 86400000) + 1,
          ),
        )
      : 0;
  const daysElapsed =
    activeAccount.days_elapsed != null ? Number(activeAccount.days_elapsed) : elapsedDefault;

  const wins = trades.filter((t) => Number(t.pnl || 0) > 0).length;
  const actualAccuracy = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  const targetAccuracy = Number(
    activeAccount.profit_accuracy_pct ?? evaluationRisk.profit_accuracy_pct ?? 70,
  );

  const maxLossPct = snap.max_loss_limit_pct;
  const dailyLossPct = snap.daily_loss_limit_pct;
  const overallLimit = Math.round((cap * maxLossPct) / 100);
  const dailyLimit = Math.round(snap.daily_loss_limit_amt);
  const ddUsed = Math.round(snap.overall_drawdown);
  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyLossUsed = Math.min(dailyLimit, Math.round(snap.daily_loss));
  const tradesToday = orders.filter((o) => String(o.created_at || "").startsWith(todayStr)).length;
  const maxTrades = isClassic
    ? Number(activeAccount.trades_per_day ?? evaluationRisk.trades_per_day ?? 5)
    : Number(activeAccount.trades_per_day ?? 0);

  return (
    <div>
      <PageHead
        title={isInstant ? "Instant funded account" : "Evaluation progress"}
        sub={`${activeAccount.plan_name} (${productBadgeLabel(activeAccount)}) · ${activeAccount.account_number || activeAccount.id}`}
      >
        <div className="flex items-center gap-3 flex-wrap">
          {accounts.length > 1 && (
            <select
              value={activeAccount.id}
              onChange={(e) => selectAccount(e.target.value)}
              className="input-dark !w-auto !py-1.5 !px-3 text-xs font-mono"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number || a.id} · {a.plan_name}
                </option>
              ))}
            </select>
          )}
          <StatusPill status={activeAccount.status || "Active"} />
        </div>
      </PageHead>

      {isFailed && (
        <div className="card-panel p-4 mb-6 border-[var(--rose)]/45 bg-[var(--rose)]/10 flex items-start gap-3 text-xs">
          <ShieldAlert size={18} className="text-[var(--rose)] shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-[var(--rose)]">
              Account Failed — Trading Disabled
            </div>
            <div className="text-[var(--text)] mt-0.5">
              {activeAccount.breach_reason || "Automated risk limit breached."}
            </div>
          </div>
        </div>
      )}

      {isPassed && (
        <div className="card-panel p-4 mb-6 border-[var(--emerald)]/45 bg-[var(--emerald)]/10 flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-[var(--emerald)] shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-[var(--emerald)]">
                1-Step Challenge Passed — Eligible for Funded Account
              </div>
              <div className="text-[var(--text)] mt-0.5">
                {activeAccount.linked_funded_account_id
                  ? "Your live 1-Step Funded account has been automatically provisioned."
                  : "All profit target & minimum trading day conditions completed."}
              </div>
            </div>
          </div>
          {activeAccount.linked_funded_account_id && (
            <button
              type="button"
              onClick={() => selectAccount(activeAccount.linked_funded_account_id)}
              className="btn-amber rounded-xl px-3.5 py-2 text-xs font-semibold"
            >
              Switch to Funded Account
            </button>
          )}
        </div>
      )}

      {isInstant || isOneStepFunded ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi
            label="Current equity"
            value={inr(snap.current_equity)}
            sub={`Starting ${inr(cap)}`}
            icon={Wallet}
          />
          <Kpi
            label="Net P&L"
            value={signed(pnl)}
            tone={pnlCls(pnl)}
            sub={`${snap.profit_split}% trader profit split`}
            icon={TrendingUp}
          />
          {isInstant ? (
            <Kpi
              label={`Reserved Buffer (${snap.buffer_pct}%)`}
              value={snap.buffer_satisfied ? "Cleared" : inr(snap.buffer_amount)}
              tone={snap.buffer_satisfied ? "text-[var(--emerald)]" : ""}
              sub={`Withdrawable: ${inr(snap.withdrawable_profit)}`}
              icon={BadgeCheck}
            />
          ) : (
            <Kpi
              label="Account phase"
              value="Funded"
              tone="text-[var(--emerald)]"
              sub="No profit target required"
              icon={BadgeCheck}
            />
          )}
          <Kpi
            label={
              isInstant
                ? `Trailing DD Floor (${snap.drawdown_mode.toUpperCase()})`
                : `Overall Loss Floor (${maxLossPct}%)`
            }
            value={inr(snap.trailing_drawdown_floor)}
            sub={`Peak watermark: ${inr(snap.highest_recorded_equity)}`}
            icon={ShieldAlert}
          />
        </div>
      ) : (
        <>
          <div className="card-panel p-6 md:p-8 eval-hero">
            <div className="ring" style={{ "--p": progress }}>
              <span className="font-display tabular-nums">{progress}%</span>
              <small>of target</small>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 flex-1">
              <Kpi label={`Profit target (${targetPct}%)`} value={inr(targetAmt)} icon={Target} />
              <Kpi label="Current P&L" value={signed(pnl)} tone={pnlCls(pnl)} icon={TrendingUp} />
              <Kpi label="Remaining target" value={inr(remainingTarget)} icon={Target} />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-6">
            <Meter
              label="Trading days"
              value={daysDone}
              max={Math.max(1, minDays)}
              money={false}
              warnAt={2}
              sub={`${Math.max(0, minDays - daysDone)} more days needed`}
            />
            {isOneStep || totalDays <= 0 ? (
              <Kpi
                label="Maximum time limit"
                value="No Limit (∞)"
                sub="Trade at your own pace — no expiry countdown"
                icon={CalendarDays}
              />
            ) : (
              <Meter
                label="Days elapsed"
                value={daysElapsed}
                max={totalDays}
                money={false}
                sub={`${Math.max(0, totalDays - daysElapsed)} days remaining`}
              />
            )}
            <Kpi
              label="Win accuracy"
              value={`${actualAccuracy}%`}
              sub={
                isOneStep
                  ? `${trades.length} closed trades · ${snap.profitable_days} profitable days`
                  : `Target benchmark ${targetAccuracy}% · ${trades.length} closed trades`
              }
              icon={BadgeCheck}
            />
          </div>
        </>
      )}

      <h2 className="font-display text-xl mt-8 mb-4">
        {isInstant ? "Instant Funded guardrails & buffer" : "Challenge limits & rules"}
      </h2>
      <div className="grid md:grid-cols-3 gap-4">
        <Meter
          label={`Daily loss used (${dailyLossPct}%)`}
          value={dailyLossUsed}
          max={Math.max(1, dailyLimit)}
          sub={`${inr(snap.daily_loss_room)} allowance left · Floor ${inr(snap.daily_loss_floor)}`}
        />
        <Meter
          label={
            isInstant
              ? `Trailing drawdown (${snap.trailing_drawdown_pct}% ${snap.drawdown_mode.toUpperCase()})`
              : `Overall drawdown (${maxLossPct}%)`
          }
          value={ddUsed}
          max={Math.max(1, overallLimit)}
          sub={`${inr(snap.overall_loss_room)} buffer remaining · Floor ${inr(snap.trailing_drawdown_floor)}`}
        />
        {maxTrades > 0 ? (
          <Meter
            label="Trades today"
            value={tradesToday}
            max={maxTrades}
            money={false}
            sub={`${Math.max(0, maxTrades - tradesToday)} executions left today`}
          />
        ) : (
          <Kpi
            label="Trades today"
            value={tradesToday}
            sub="Unlimited daily executions allowed"
            icon={Activity}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Risk (Admin-controlled limits + live usage) ---------- */
export function RiskManagement() {
  const {
    activeAccount,
    accounts,
    evaluationRisk,
    orders,
    positions,
    trades,
    selectAccount,
    loading,
  } = useTraderState({ pollMs: 8000 });

  if (loading && !activeAccount) {
    return (
      <div className="card-panel p-8 text-center text-[var(--muted)]">Loading risk status…</div>
    );
  }

  if (!activeAccount) {
    return (
      <div>
        <PageHead
          title="Risk management"
          sub="Daily loss, max drawdown, and per-day trade limits configured by admin."
        />
        <NoAccountCta
          title="No active account to monitor"
          message="Risk rules apply automatically once your challenge or funded account is active."
        />
      </div>
    );
  }

  const snap = computeAccountRiskSnapshot({
    account: activeAccount,
    trades,
    positions,
    orders,
    evaluationRisk,
  });
  const pType = snap.product_type;
  const isClassic = isClassicProduct(activeAccount);
  const isInstant = pType === PRODUCT_TYPES.INSTANT;
  const isFailed =
    String(activeAccount.status || "").toLowerCase() === "failed" ||
    activeAccount.trading_enabled === false;

  const cap = snap.starting_capital;
  const maxLossPct = snap.max_loss_limit_pct;
  const dailyLossPct = snap.daily_loss_limit_pct;
  const overallLimit = Math.round((cap * maxLossPct) / 100);
  const dailyLimit = Math.round(snap.daily_loss_limit_amt);
  const ddUsed = Math.round(snap.overall_drawdown);
  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyLossUsed = Math.min(dailyLimit, Math.round(snap.daily_loss));
  const tradesToday = orders.filter((o) => String(o.created_at || "").startsWith(todayStr)).length;
  const maxTrades = isClassic
    ? Number(activeAccount.trades_per_day ?? evaluationRisk.trades_per_day ?? 5)
    : Number(activeAccount.trades_per_day ?? 0);

  const drawdownPct = cap > 0 ? +((ddUsed / cap) * 100).toFixed(2) : 0;
  const rules = [
    {
      t: `Daily loss within ${dailyLossPct}% limit (${inr(dailyLimit)} · Floor ${inr(snap.daily_loss_floor)})`,
      ok:
        !isFailed &&
        snap.daily_loss < snap.daily_loss_limit_amt &&
        snap.current_equity > snap.daily_loss_floor,
    },
    {
      t: isInstant
        ? `5% Trailing drawdown (${snap.drawdown_mode.toUpperCase()} floor ${inr(snap.trailing_drawdown_floor)})`
        : `Overall drawdown within ${maxLossPct}% limit (Floor ${inr(snap.trailing_drawdown_floor)})`,
      ok: !isFailed && snap.current_equity > snap.trailing_drawdown_floor,
    },
    ...(maxTrades > 0
      ? [
          {
            t: `Trades per day within limit (${tradesToday} / ${maxTrades})`,
            ok: tradesToday <= maxTrades,
          },
        ]
      : [
          {
            t: `Trades per day: Unlimited (${tradesToday} placed today)`,
            ok: true,
          },
        ]),
    ...(isInstant
      ? [
          {
            t: `First ${snap.buffer_pct}% profit buffer (${inr(snap.buffer_amount)}): ${snap.buffer_satisfied ? "Cleared" : "Building"}`,
            ok: snap.buffer_satisfied,
          },
        ]
      : []),
    {
      t: "Available margin positive",
      ok: Number(activeAccount.available_margin ?? snap.current_balance) >= 0,
    },
  ];

  return (
    <div>
      <PageHead
        title="Risk management"
        sub={`${activeAccount.plan_name} (${productBadgeLabel(activeAccount)}) · ${activeAccount.account_number || activeAccount.id} — rules enforced live by the backend risk engine.`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 1 && (
            <select
              value={activeAccount.id}
              onChange={(e) => selectAccount(e.target.value)}
              className="input-dark !w-auto !py-1.5 !px-3 text-xs font-mono"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number || a.id} · {a.plan_name}
                </option>
              ))}
            </select>
          )}
          <StatusPill status={activeAccount.status || "Active"} />
        </div>
      </PageHead>

      {isFailed && (
        <div className="card-panel p-4 mb-5 border-[var(--rose)]/45 bg-[var(--rose)]/10 flex items-start gap-3 text-xs">
          <ShieldAlert size={18} className="text-[var(--rose)] shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-[var(--rose)]">Account Breached &amp; Failed</div>
            <div className="text-[var(--text)] mt-0.5">
              {activeAccount.breach_reason ||
                "Loss limit breached. Automated close-all and trading lock applied."}
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Meter
          label={`Daily loss used (${dailyLossPct}%)`}
          value={dailyLossUsed}
          max={Math.max(1, dailyLimit)}
          sub={`${inr(snap.daily_loss_room)} left today · Floor ${inr(snap.daily_loss_floor)}`}
        />
        <Meter
          label={
            isInstant
              ? `Trailing drawdown (${snap.trailing_drawdown_pct}% ${snap.drawdown_mode.toUpperCase()})`
              : `Overall drawdown (${maxLossPct}%)`
          }
          value={ddUsed}
          max={Math.max(1, overallLimit)}
          sub={`${inr(snap.overall_loss_room)} remaining · ${drawdownPct}% DD · Peak ${inr(snap.highest_recorded_equity)}`}
        />
        {maxTrades > 0 ? (
          <Meter
            label="Trades today"
            value={tradesToday}
            max={maxTrades}
            money={false}
            sub={`${Math.max(0, maxTrades - tradesToday)} trades left today`}
          />
        ) : (
          <Kpi
            label="Daily trade limit"
            value="Unlimited"
            sub={`${tradesToday} order(s) placed today`}
            icon={Activity}
          />
        )}
        <div className="card-panel p-5">
          <div className="text-xs text-[var(--muted-2)] uppercase tracking-wider font-mono mb-3">
            Rule compliance
          </div>
          <ul className="space-y-2 text-sm">
            {rules.map((r) => (
              <li key={r.t} className="flex items-center gap-2">
                {r.ok ? (
                  <CheckCircle2 size={16} className="text-[var(--emerald)] shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="text-[var(--rose)] shrink-0" />
                )}
                <span>{r.t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ---------- Calendar (real trades aggregated strictly on days traded) ---------- */
function toLocalDateKey(value) {
  if (!value) return "";
  const raw = String(value);
  const ts = Date.parse(raw);
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return raw.slice(0, 10);
}

export function TradingCalendar() {
  const { trades, orders } = useTraderState({ pollMs: 10000 });
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedKey, setSelectedKey] = useState("");
  const { year, month } = cursor;
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const activityByDate = useMemo(() => {
    const map = {};
    for (const o of orders) {
      if (String(o.status || "").toLowerCase() === "cancelled") continue;
      const key = toLocalDateKey(o.date || o.created_at);
      if (!key) continue;
      if (!map[key]) map[key] = { pnl: 0, closedCount: 0, orderCount: 0, orders: [], trades: [] };
      map[key].orderCount += 1;
      map[key].orders.push(o);
    }
    for (const t of trades) {
      const key = toLocalDateKey(t.out || t.created_at || t.in);
      if (!key) continue;
      if (!map[key]) map[key] = { pnl: 0, closedCount: 0, orderCount: 0, orders: [], trades: [] };
      map[key].pnl += Number(t.pnl || 0);
      map[key].closedCount += 1;
      map[key].trades.push(t);
    }
    return map;
  }, [trades, orders]);

  const days = useMemo(() => {
    const totalDays = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => {
      const day = i + 1;
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const info = activityByDate[key];
      if (!info) return { day, key, traded: false, pnl: null, count: 0 };
      return {
        day,
        key,
        traded: true,
        pnl: Math.round(info.pnl),
        count: info.closedCount || info.orderCount,
        info,
      };
    });
  }, [year, month, activityByDate]);

  const lead = new Date(year, month, 1).getDay();
  const tradedDays = days.filter((d) => d.traded);
  const total = tradedDays.reduce((s, d) => s + (d.pnl || 0), 0);
  const selectedDay = days.find((d) => d.key === selectedKey && d.traded);

  const shiftMonth = (delta) => {
    const next = new Date(year, month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
    setSelectedKey("");
  };

  return (
    <div>
      <PageHead
        title="Trading calendar"
        sub="Click any highlighted trading day to inspect orders, P&L, and trade notes."
      >
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost rounded-full p-2"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="font-display text-lg w-44 text-center">
            {new Date(year, month, 1).toLocaleString("en-IN", { month: "long", year: "numeric" })}
          </div>
          <button
            className="btn-ghost rounded-full p-2"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </PageHead>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi
          label="Profitable days"
          value={tradedDays.filter((d) => d.pnl > 0).length}
          tone="text-[var(--emerald)]"
          icon={TrendingUp}
        />
        <Kpi
          label="Losing days"
          value={tradedDays.filter((d) => d.pnl < 0).length}
          tone="text-[var(--rose)]"
        />
        <Kpi label="Traded days" value={tradedDays.length} icon={CalendarDays} />
        <Kpi label="Month P&L" value={signed(total)} tone={pnlCls(total)} icon={Wallet} />
      </div>
      <div className="card-panel p-4 md:p-5">
        <div className="cal-grid" data-testid="trading-calendar-grid">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="cal-head">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`e${i}`} />
          ))}
          {days.map((d) => {
            const isToday = d.key === todayKey;
            const isSelected = d.key === selectedKey;
            return (
              <button
                type="button"
                key={d.day}
                disabled={!d.traded}
                onClick={() => d.traded && setSelectedKey(d.key === selectedKey ? "" : d.key)}
                className={`cal-day text-left transition ${
                  !d.traded ? "is-off" : d.pnl > 0 ? "is-up" : d.pnl < 0 ? "is-down" : "is-flat"
                } ${isToday ? "ring-1 ring-[var(--accent)]" : ""} ${isSelected ? "ring-2 ring-white" : ""}`}
                data-traded={d.traded ? "true" : "false"}
              >
                <span className="flex items-center justify-between w-full font-mono text-[11px]">
                  <span>{d.day}</span>
                  {d.traded && <span className="text-[9px] opacity-70">{d.count}x</span>}
                </span>
                {d.traded && (
                  <strong>
                    {d.pnl === 0
                      ? `${d.count} ${d.count === 1 ? "trade" : "trades"}`
                      : `${d.pnl > 0 ? "+" : "−"}${Math.abs(d.pnl).toLocaleString("en-IN")}`}
                  </strong>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {selectedDay?.info && (
        <div className="card-panel p-5 mt-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted-2)]">
                Activity for {selectedDay.key}
              </div>
              <div className={`font-display text-xl mt-0.5 ${pnlCls(selectedDay.pnl || 0)}`}>
                {signed(selectedDay.pnl || 0)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedKey("")}
              className="btn-ghost rounded-full px-3 py-1 text-xs"
            >
              Close
            </button>
          </div>
          <div className="space-y-2 text-xs">
            {selectedDay.info.orders.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-[var(--bg-1)] border border-[var(--border)]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-semibold ${o.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"}`}
                  >
                    {o.side}
                  </span>
                  <span className="font-mono text-white">{o.symbol}</span>
                  <span className="text-[var(--muted-2)]">× {o.qty}</span>
                  {o.note && <span className="text-[var(--emerald)]">· {o.note}</span>}
                </div>
                <span className="font-mono text-[var(--muted)]">@ {formatPrice(o.price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {tradedDays.length === 0 && (
        <p className="text-xs text-[var(--muted-2)] mt-4 text-center">
          No trades executed this month yet — P&amp;L highlights appear only on days you trade.
        </p>
      )}
    </div>
  );
}

/* ---------- Funded account ---------- */
export function FundedAccount() {
  const { accounts, activeAccount, selectAccount, evaluationRisk, loading } = useTraderState({
    pollMs: 6000,
  });
  const fundedAccounts = accounts.filter(
    (a) =>
      ["funded"].includes(String(a.status || "").toLowerCase()) ||
      String(a.account_type || "").toLowerCase() === "funded" ||
      getAccountProductType(a) === PRODUCT_TYPES.INSTANT ||
      getAccountProductType(a) === PRODUCT_TYPES.ONE_STEP_FUNDED,
  );
  const liveFunded =
    fundedAccounts.find((a) => a.id === activeAccount?.id) ||
    fundedAccounts.find((a) => String(a.status || "").toLowerCase() === "funded") ||
    fundedAccounts[0];

  if (loading && !accounts.length) {
    return <div className="card-panel p-8 text-center text-[var(--muted)]">Loading…</div>;
  }

  if (!liveFunded) {
    return (
      <div>
        <PageHead title="Funded account" sub="Live capital payout and split details." />
        <NoAccountCta
          title="No funded account yet"
          message="Pass your evaluation challenge or go directly for an Instant Funding account to unlock profit splits and payouts."
        />
      </div>
    );
  }

  const snap = computeAccountRiskSnapshot({ account: liveFunded, evaluationRisk });
  const isInstant = snap.product_type === PRODUCT_TYPES.INSTANT;
  const isFailed =
    String(liveFunded.status || "").toLowerCase() === "failed" ||
    liveFunded.trading_enabled === false;
  const size = snap.starting_capital;
  const bal = snap.current_balance;
  const pnl = snap.closed_pnl;
  const profitSplit = snap.profit_split;
  const maxLossPct = snap.max_loss_limit_pct;
  const start = String(liveFunded.created_at || "").slice(0, 10) || "Active";
  const share = isInstant ? snap.withdrawable_profit : Math.max(0, pnl) * (profitSplit / 100);

  return (
    <div>
      <PageHead
        title="Funded account"
        sub={`${liveFunded.account_number || liveFunded.id} · ${productBadgeLabel(liveFunded)} · started ${start}`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {fundedAccounts.length > 1 && (
            <select
              value={liveFunded.id}
              onChange={(e) => selectAccount(e.target.value)}
              className="input-dark !w-auto !py-1.5 !px-3 text-xs font-mono"
            >
              {fundedAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_number || a.id} · {a.plan_name}
                </option>
              ))}
            </select>
          )}
          <StatusPill status={liveFunded.status || "Funded"} />
        </div>
      </PageHead>

      {isFailed && (
        <div className="card-panel p-4 mb-6 border-[var(--rose)]/45 bg-[var(--rose)]/10 flex items-start gap-3 text-xs">
          <ShieldAlert size={18} className="text-[var(--rose)] shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-[var(--rose)]">
              Funded Account Breached &amp; Failed
            </div>
            <div className="text-[var(--text)] mt-0.5">
              {liveFunded.breach_reason || "Drawdown or daily loss limit breached."}
            </div>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label="Account size" value={inr(size)} icon={Wallet} />
        <Kpi
          label="Current equity"
          value={inr(snap.current_equity)}
          sub={`Balance ${inr(bal)}`}
          icon={Wallet}
        />
        <Kpi label="Net P&L" value={signed(pnl)} tone={pnlCls(pnl)} icon={TrendingUp} />
        <Kpi
          label="Profit split"
          value={`${profitSplit}%`}
          sub={
            isInstant
              ? snap.payout_cycle === "monthly"
                ? "Monthly payout schedule (30d)"
                : "Bi-weekly payout schedule (14d)"
              : "Funded trader split"
          }
          icon={BadgeCheck}
        />
        <Kpi
          label={
            isInstant
              ? `Trailing DD floor (${maxLossPct}% ${snap.drawdown_mode.toUpperCase()})`
              : `Overall loss floor (${maxLossPct}%)`
          }
          value={inr(snap.trailing_drawdown_floor)}
          sub={`Daily loss limit: ${snap.daily_loss_limit_pct}% (${inr(snap.daily_loss_floor)})`}
          icon={ShieldAlert}
        />
        <Kpi
          label={isInstant ? "Withdrawable share (after 3% buffer)" : "Your share (if paid now)"}
          value={inr(share)}
          tone="text-[var(--emerald)]"
          sub={
            isInstant
              ? snap.buffer_satisfied
                ? `Buffer ${inr(snap.buffer_amount)} cleared`
                : `Reserve buffer ${inr(snap.buffer_amount)} first`
              : undefined
          }
          icon={Wallet}
        />
      </div>
      <div className="card-panel p-6 mt-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="font-display text-xl">Ready to withdraw?</div>
          <p className="text-sm text-[var(--muted)] mt-1">
            {isInstant
              ? `Instant Funding payouts unlock profits above the ${snap.buffer_pct}% (${inr(snap.buffer_amount)}) safety buffer after KYC verification.`
              : "Payouts are processed after KYC verification."}
          </p>
        </div>
        <Link to="/app/payouts" className="btn-amber rounded-full px-5 py-2.5 text-sm">
          Request payout
        </Link>
      </div>
    </div>
  );
}

/* ---------- KYC (Real submission to /me/kyc) ---------- */
export function Kyc() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ aadhaar: "", pan: "", bank: "", ifsc: "", holder: "" });
  const [files, setFiles] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const k = user?.kyc;
    if (k && typeof k === "object") {
      setForm({
        aadhaar: k.aadhaar || "",
        pan: k.pan || "",
        bank: k.bank_account_number || "",
        ifsc: k.ifsc || "",
        holder: k.full_name || user?.name || "",
      });
    } else if (user?.name) {
      setForm((prev) => ({ ...prev, holder: prev.holder || user.name }));
    }
  }, [user]);

  const rawStatus = String(user?.kyc?.status || "").toLowerCase();
  const status =
    rawStatus === "verified" || rawStatus === "approved"
      ? "Verified"
      : rawStatus === "submitted" || rawStatus === "under review"
        ? "Under review"
        : "Not submitted";

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const docs = [
    ["aadhaar_doc", "Aadhaar (front & back)"],
    ["pan_doc", "PAN card"],
    ["bank_doc", "Cancelled cheque / bank statement"],
  ];
  const valid =
    /^\d{12}$/.test(form.aadhaar.replace(/\s/g, "")) &&
    /^[A-Z]{5}\d{4}[A-Z]$/.test(form.pan.toUpperCase()) &&
    form.bank.length >= 6 &&
    /^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc.toUpperCase()) &&
    form.holder.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (!valid)
      return toast.error(
        "Please check the Aadhaar (12 digits), PAN (ABCDE1234F), account number and IFSC.",
      );
    setSaving(true);
    try {
      await api.put("/me/kyc", {
        full_name: form.holder.trim(),
        aadhaar: form.aadhaar.replace(/\s/g, ""),
        pan: form.pan.toUpperCase().trim(),
        bank_account_number: form.bank.trim(),
        ifsc: form.ifsc.toUpperCase().trim(),
      });
      await refresh();
      toast.success("KYC details saved and submitted for verification.");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Could not submit KYC"));
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    ["Submitted", status !== "Not submitted"],
    ["Under review", status === "Under review" || status === "Verified"],
    ["Verified", status === "Verified"],
  ];

  return (
    <div>
      <PageHead
        title="KYC verification"
        sub="Required before your first payout. Your PAN and bank details are encrypted and saved to your trader profile."
      >
        <StatusPill status={status} />
      </PageHead>
      <div className="kyc-steps mb-6">
        {steps.map(([t, on], i) => (
          <div key={t} className={on ? "is-on" : ""}>
            <span>{on ? <CheckCircle2 size={16} /> : i + 1}</span>
            {t}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="grid lg:grid-cols-2 gap-6">
        <div className="card-panel p-6 space-y-4">
          <div className="font-display text-lg">Identity & bank details</div>
          {[
            ["aadhaar", "Aadhaar number", "123456789012"],
            ["pan", "PAN", "ABCDE1234F"],
            ["holder", "Account holder name", "As per bank"],
            ["bank", "Bank account number", ""],
            ["ifsc", "IFSC", "SBIN0001234"],
          ].map(([k, l, ph]) => (
            <div key={k}>
              <label className="dash-label" htmlFor={`kyc-${k}`}>
                {l}
              </label>
              <input
                id={`kyc-${k}`}
                className="input-dark"
                placeholder={ph}
                value={form[k]}
                onChange={set(k)}
                maxLength={k === "aadhaar" ? 14 : 34}
                autoComplete="off"
              />
            </div>
          ))}
        </div>
        <div className="card-panel p-6 space-y-4">
          <div className="font-display text-lg">Supporting documents (optional quick check)</div>
          {docs.map(([k, l]) => (
            <label key={k} className={`upload-box ${files[k] ? "has-file" : ""}`}>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0]?.name })}
              />
              {files[k] ? <CheckCircle2 size={18} /> : <Upload size={18} />}
              <div>
                <strong>{l}</strong>
                <small>{files[k] || "JPG, PNG or PDF"}</small>
              </div>
            </label>
          ))}
          <button
            type="submit"
            className="btn-amber rounded-full w-full py-3 text-sm disabled:opacity-50"
            disabled={saving}
          >
            {saving
              ? "Saving…"
              : status === "Verified"
                ? "Verified"
                : status === "Under review"
                  ? "Update & resubmit KYC"
                  : "Submit for verification"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Notifications (real /me/notifications + live account alerts) ---------- */
export function Notifications() {
  const { activeAccount, hasActiveAccount, hasPurchasedChallenge, kyc } = useTraderState({
    pollMs: 12000,
  });
  const [serverList, setServerList] = useState([]);
  const [dismissedLive, setDismissedLive] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    api
      .get("/me/notifications")
      .then((r) => {
        setServerList(Array.isArray(r.data) ? r.data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const liveNotices = useMemo(() => {
    const out = [];
    if (!hasActiveAccount && !hasPurchasedChallenge) {
      out.push({
        id: "live-no-plan",
        type: "progress",
        title: "No active trading plan",
        body: "Your simulated capital is ₹0. Purchase a challenge plan to start trading.",
        time: "Current status",
        read: dismissedLive.includes("live-no-plan"),
        virtual: true,
      });
    }
    if (
      activeAccount &&
      String(activeAccount.status || "").toLowerCase() !== "failed" &&
      Number(activeAccount.starting_capital || 0) > 0
    ) {
      const snap = computeAccountRiskSnapshot({ account: activeAccount });
      const maxLossAmt = (snap.starting_capital * snap.max_loss_limit_pct) / 100;
      if (maxLossAmt > 0 && snap.overall_drawdown / maxLossAmt >= 0.7) {
        out.push({
          id: "live-dd-warn",
          type: "risk",
          title: "Drawdown limit warning",
          body: `Account ${activeAccount.account_number || activeAccount.id} has used ${Math.round((snap.overall_drawdown / maxLossAmt) * 100)}% of overall drawdown allowance.`,
          time: "Live alert",
          read: dismissedLive.includes("live-dd-warn"),
          virtual: true,
        });
      }
    }
    if (!kyc?.status) {
      out.push({
        id: "live-kyc",
        type: "kyc",
        title: "Complete KYC verification",
        body: "Submit PAN and bank details in the KYC tab before requesting your first payout.",
        time: "Account checklist",
        read: dismissedLive.includes("live-kyc"),
        virtual: true,
      });
    }
    return out;
  }, [hasActiveAccount, hasPurchasedChallenge, activeAccount, kyc, dismissedLive]);

  const items = [...serverList, ...liveNotices];
  const icon = {
    risk: ShieldAlert,
    trade: Activity,
    progress: Target,
    kyc: BadgeCheck,
    payout: Wallet,
  };

  const markOne = async (n) => {
    if (n.read) return;
    if (n.virtual) {
      setDismissedLive((prev) => [...prev, n.id]);
      return;
    }
    await api.post("/me/notifications/read", { id: n.id }).catch(() => {});
    setServerList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  };

  const markAll = async () => {
    setDismissedLive(liveNotices.map((n) => n.id));
    await api.post("/me/notifications/read", {}).catch(() => {});
    setServerList((prev) => prev.map((x) => ({ ...x, read: true })));
  };

  return (
    <div>
      <PageHead title="Notifications" sub="Account credits, risk alerts, and verification updates.">
        <button className="btn-ghost rounded-full px-4 py-2 text-xs" onClick={markAll}>
          Mark all read
        </button>
      </PageHead>
      {!loaded ? (
        <div className="card-panel p-8 text-center text-[var(--muted)]">Loading notifications…</div>
      ) : items.length ? (
        <ul className="space-y-3">
          {items.map((n) => {
            const Icon = icon[n.type || n.kind] || Bell;
            const unread = !n.read;
            return (
              <li
                key={n.id}
                className={`card-panel p-4 flex gap-4 items-start notif cursor-pointer ${unread ? "is-unread" : ""}`}
                onClick={() => markOne(n)}
              >
                <span className="notif-icon">
                  <Icon size={17} />
                </span>
                <div className="flex-1">
                  <div className="flex justify-between gap-3">
                    <strong className="text-sm">{n.title || n.t}</strong>
                    <small className="text-[var(--muted-2)]">{n.time}</small>
                  </div>
                  <p className="text-sm text-[var(--muted)] mt-1">{n.body || n.d}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="card-panel p-8 text-center text-sm text-[var(--muted)]">
          No notifications right now.
        </div>
      )}
    </div>
  );
}

/* ---------- Support (real /me/tickets) ---------- */
export function Support() {
  const [tickets, setTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "Account", message: "" });

  const load = useCallback(() => {
    api
      .get("/me/tickets")
      .then((r) => {
        setTickets(Array.isArray(r.data) ? r.data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.subject.trim().length < 4 || form.message.trim().length < 10)
      return toast.error("Please add a subject (min 4 chars) and description (min 10 chars).");
    setSubmitting(true);
    try {
      const { data } = await api.post("/me/tickets", form);
      setTickets((prev) => [data, ...prev]);
      setForm({ subject: "", category: "Account", message: "" });
      toast.success(`Support ticket ${data.id} submitted.`);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Could not create ticket"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHead title="Support" sub="Raise a support ticket tied to your account." />
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
        <form onSubmit={submit} className="card-panel p-6 space-y-4">
          <div className="font-display text-lg flex items-center gap-2">
            <LifeBuoy size={18} /> New ticket
          </div>
          <div>
            <label className="dash-label" htmlFor="tk-cat">
              Category
            </label>
            <select
              id="tk-cat"
              className="input-dark"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {["Account", "Trading", "Payouts", "KYC", "Other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="dash-label" htmlFor="tk-sub">
              Subject
            </label>
            <input
              id="tk-sub"
              className="input-dark"
              maxLength={120}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>
          <div>
            <label className="dash-label" htmlFor="tk-msg">
              Message
            </label>
            <textarea
              id="tk-msg"
              rows={5}
              className="input-dark"
              maxLength={2000}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </div>
          <button
            disabled={submitting}
            className="btn-amber rounded-full w-full py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send size={15} /> {submitting ? "Submitting…" : "Submit ticket"}
          </button>
        </form>
        <div>
          <h2 className="font-display text-xl mb-3">Your tickets</h2>
          <Table
            rows={loaded ? tickets : []}
            empty={loaded ? "No support tickets submitted yet." : "Loading tickets…"}
            cols={[
              {
                k: "id",
                label: "Ticket",
                render: (r) => <span className="font-mono text-xs">{r.id}</span>,
              },
              { k: "subject", label: "Subject" },
              { k: "date", label: "Date" },
              { k: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- Real Trading Overview (no sample fallback) ---------- */
export function TradingOverview() {
  const { activeAccount, evaluationRisk, trades } = useTraderState({ pollMs: 8000 });
  const cap = Number(activeAccount?.starting_capital || 0);
  const bal = Number(activeAccount?.balance || 0);

  const curve = useMemo(() => {
    const chrono = [...trades].reverse();
    let v = cap;
    const series = [v];
    for (const t of chrono) {
      v += Number(t.pnl || 0);
      series.push(v);
    }
    if (series.length === 1) series.push(bal);
    return series;
  }, [trades, cap, bal]);

  if (!activeAccount) return null;

  const snap = computeAccountRiskSnapshot({ account: activeAccount, trades, evaluationRisk });
  const isInstant = snap.product_type === PRODUCT_TYPES.INSTANT;
  const isOneStepFunded = snap.product_type === PRODUCT_TYPES.ONE_STEP_FUNDED;
  const pnl = snap.net_profit;
  const progress = Math.round(snap.profit_target_progress_pct);
  const minDays = snap.min_trading_days;
  const daysDone = snap.trading_days;
  const drawdownPct = cap > 0 ? +((snap.overall_drawdown / cap) * 100).toFixed(2) : 0;

  const lo = Math.min(...curve);
  const hi = Math.max(...curve);
  const pts = curve
    .map(
      (v, i) =>
        `${(i / Math.max(1, curve.length - 1)) * 600},${150 - ((v - lo) / (hi - lo || 1)) * 140}`,
    )
    .join(" ");

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h2 className="font-display text-2xl">Trading overview</h2>
        <span className="text-xs text-[var(--muted-2)] font-mono">
          Account {activeAccount.account_number || activeAccount.id} ·{" "}
          {productBadgeLabel(activeAccount)}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Starting capital" value={inr(cap)} />
        <Kpi label="Equity" value={inr(snap.current_equity)} />
        <Kpi label="Available margin" value={inr(activeAccount.available_margin ?? bal)} />
        <Kpi label="Total P&L" value={signed(pnl)} tone={pnlCls(pnl)} />
        <Kpi
          label="Realized P&L"
          value={signed(activeAccount.realized_pnl || 0)}
          tone={pnlCls(activeAccount.realized_pnl || 0)}
        />
        <Kpi
          label={isInstant ? "Trailing drawdown" : "Drawdown"}
          value={`${drawdownPct}%`}
          sub={`Floor ${inr(snap.trailing_drawdown_floor)}`}
        />
        <Kpi
          label="Trading days"
          value={minDays > 0 ? `${daysDone} / ${minDays}` : `${daysDone}`}
          icon={CalendarDays}
        />
        {isInstant ? (
          <Kpi
            label="Withdrawable share"
            value={inr(snap.withdrawable_profit)}
            tone="text-[var(--emerald)]"
            sub={snap.buffer_satisfied ? "Buffer cleared" : `Buffer: ${inr(snap.buffer_amount)}`}
            icon={Target}
          />
        ) : isOneStepFunded ? (
          <Kpi label="Funded split" value={`${snap.profit_split}%`} icon={Target} />
        ) : (
          <Kpi label="Target progress" value={`${progress}%`} icon={Target} />
        )}
      </div>
      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 mt-6">
        <div className="card-panel p-5">
          <div className="text-xs text-[var(--muted-2)] uppercase tracking-wider font-mono mb-3">
            Real equity trajectory
          </div>
          <svg
            viewBox="0 0 600 160"
            className="w-full h-auto equity-svg"
            role="img"
            aria-label="Equity curve"
          >
            <polyline points={pts} />
            <polygon points={`0,160 ${pts} 600,160`} />
          </svg>
        </div>
        <div className="card-panel p-5">
          <div className="text-xs text-[var(--muted-2)] uppercase tracking-wider font-mono mb-3">
            Recent trades
          </div>
          {trades.length ? (
            <ul className="space-y-2 text-sm tabular-nums">
              {trades.slice(0, 5).map((t) => (
                <li key={t.id} className="flex justify-between gap-3">
                  <span>
                    {t.side === "BUY" ? "▲" : "▼"} {t.symbol}{" "}
                    <small className="text-[var(--muted-2)]">
                      {String(t.in || "")
                        .slice(5, 16)
                        .replace("T", " ")}
                    </small>
                  </span>
                  <span className={pnlCls(t.pnl)}>{signed(t.pnl)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Place your first trade in the terminal to build history.
            </p>
          )}
          <Link
            to="/app/tradebook"
            className="text-xs text-[var(--accent)] mt-4 inline-block hover:underline"
          >
            Open trade book →
          </Link>
        </div>
      </div>
    </section>
  );
}
