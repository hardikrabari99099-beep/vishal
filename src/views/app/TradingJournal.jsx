import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Calendar,
  Download,
  ImagePlus,
  Loader2,
  Maximize2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { api, formatApiError, formatINR } from "../../lib/api";
import { formatPrice } from "../../lib/useLiveMarket";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Textarea } from "../../components/ui/textarea";

const PRESET_TAGS = [
  "ORB",
  "VWAP Pullback",
  "Breakout",
  "Reversal",
  "EMA Cross",
  "Trend Follow",
  "Scalp",
  "Support/Resistance",
];

const SUGGESTED_SYMBOLS = [
  "NIFTY 50",
  "BANKNIFTY",
  "FINNIFTY",
  "SENSEX",
  "RELIANCE",
  "HDFCBANK",
  "ICICIBANK",
  "INFY",
  "TCS",
  "SBIN",
];

const TIMEFRAMES = ["", "1m", "3m", "5m", "15m", "30m", "1H", "4H", "1D"];
const EMOTIONS = ["", "Disciplined", "Calm", "Focused", "Hesitant", "FOMO", "Revenge"];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function signedINR(value) {
  const n = Number(value || 0);
  const absFormatted = formatINR(Math.abs(Math.round(n)));
  if (n > 0) return `+${absFormatted}`;
  if (n < 0) return `−${absFormatted}`;
  return absFormatted;
}

export function safeScreenshotSrc(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^\/api\/media\/[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp)$/i.test(s)) return s;
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(s)) return s;
  return "";
}

function computePnlFromPrices(side, entryPrice, exitPrice, qty) {
  const entry = Number(entryPrice);
  const exit = Number(exitPrice);
  const q = Number(qty);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(q) || q <= 0) {
    return null;
  }
  if (exitPrice === "" || exitPrice === null || exitPrice === undefined) return null;
  const diff = String(side || "BUY").toUpperCase() === "SELL" ? entry - exit : exit - entry;
  return +(diff * q).toFixed(2);
}

function makeEmptyForm(defaultAccountId = "") {
  return {
    symbol: "",
    side: "BUY",
    trade_date: todayIsoDate(),
    timeframe: "5m",
    entry_price: "",
    exit_price: "",
    qty: "1",
    pnl: "",
    setup: "",
    emotions: "Disciplined",
    rating: 4,
    account_id: defaultAccountId,
    strategy_tags: [],
    notes: "",
    screenshot_url: "",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected image file."));
    reader.readAsDataURL(file);
  });
}

export default function TradingJournal() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState("ALL");
  const [tagFilter, setTagFilter] = useState("");

  // Create / Edit Dialog
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [form, setForm] = useState(() => makeEmptyForm());
  const [pnlManuallyEdited, setPnlManuallyEdited] = useState(false);
  const [customTag, setCustomTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Inline delete confirmation & lightbox
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [lightboxEntry, setLightboxEntry] = useState(null);

  const fileInputRef = useRef(null);

  const loadJournal = useCallback(async () => {
    setLoadError("");
    try {
      const [journalRes, acctRes] = await Promise.all([
        api.get("/me/journal"),
        api.get("/me/accounts").catch(() => ({ data: { accounts: [] } })),
      ]);
      setEntries(Array.isArray(journalRes.data) ? journalRes.data : []);
      const acctData = acctRes.data;
      setAccounts(Array.isArray(acctData) ? [] : acctData?.accounts || []);
    } catch (err) {
      setLoadError(
        formatApiError(err?.response?.data?.detail) || "Could not load trading journal.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJournal();
  }, [loadJournal]);

  const allTagsWithCounts = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) {
      const tags = Array.isArray(entry.strategy_tags) ? entry.strategy_tags : [];
      for (const tag of tags) {
        const clean = String(tag || "").trim();
        if (!clean) continue;
        counts.set(clean, (counts.get(clean) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (sideFilter !== "ALL" && String(entry.side || "").toUpperCase() !== sideFilter) {
        return false;
      }
      const pnl = Number(entry.pnl || 0);
      if (outcomeFilter === "wins" && pnl <= 0) return false;
      if (outcomeFilter === "losses" && pnl >= 0) return false;
      if (outcomeFilter === "breakeven" && pnl !== 0) return false;
      if (tagFilter) {
        const tags = Array.isArray(entry.strategy_tags) ? entry.strategy_tags : [];
        if (!tags.some((t) => t.toLowerCase() === tagFilter.toLowerCase())) return false;
      }
      if (q) {
        const hay = [
          entry.symbol,
          entry.notes,
          entry.setup,
          entry.emotions,
          entry.account_label,
          ...(Array.isArray(entry.strategy_tags) ? entry.strategy_tags : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, sideFilter, outcomeFilter, tagFilter]);

  const stats = useMemo(() => {
    const scope = filteredEntries;
    const total = scope.length;
    const wins = scope.filter((e) => Number(e.pnl || 0) > 0);
    const losses = scope.filter((e) => Number(e.pnl || 0) < 0);
    const decided = wins.length + losses.length;
    const winRate = decided > 0 ? Math.round((wins.length / decided) * 1000) / 10 : 0;
    const netPnl = scope.reduce((s, e) => s + Number(e.pnl || 0), 0);

    const tagPnl = new Map();
    for (const e of scope) {
      const tags = Array.isArray(e.strategy_tags) ? e.strategy_tags : [];
      for (const t of tags) {
        const cur = tagPnl.get(t) || { tag: t, pnl: 0, count: 0 };
        cur.pnl += Number(e.pnl || 0);
        cur.count += 1;
        tagPnl.set(t, cur);
      }
    }
    const topTag =
      [...tagPnl.values()].sort((a, b) => b.pnl - a.pnl || b.count - a.count)[0] || null;
    return {
      total,
      wins: wins.length,
      losses: losses.length,
      winRate,
      netPnl,
      topTag,
    };
  }, [filteredEntries]);

  const hasActiveFilters =
    Boolean(search.trim()) || outcomeFilter !== "all" || sideFilter !== "ALL" || Boolean(tagFilter);

  const resetFilters = () => {
    setSearch("");
    setOutcomeFilter("all");
    setSideFilter("ALL");
    setTagFilter("");
  };

  const openCreateModal = () => {
    setEditingEntry(null);
    setForm(makeEmptyForm(accounts[0]?.id || ""));
    setPnlManuallyEdited(false);
    setCustomTag("");
    setEditorOpen(true);
  };

  const openEditModal = (entry) => {
    setEditingEntry(entry);
    setForm({
      symbol: entry.symbol || "",
      side: entry.side === "SELL" ? "SELL" : "BUY",
      trade_date: String(entry.trade_date || todayIsoDate()).slice(0, 10),
      timeframe: entry.timeframe || "",
      entry_price:
        entry.entry_price !== undefined && entry.entry_price !== null
          ? String(entry.entry_price)
          : "",
      exit_price:
        entry.exit_price !== undefined && entry.exit_price !== null ? String(entry.exit_price) : "",
      qty: entry.qty !== undefined && entry.qty !== null ? String(entry.qty) : "1",
      pnl: entry.pnl !== undefined && entry.pnl !== null ? String(entry.pnl) : "",
      setup: entry.setup || "",
      emotions: entry.emotions || "",
      rating: Number(entry.rating || 0),
      account_id: entry.account_id || "",
      strategy_tags: Array.isArray(entry.strategy_tags) ? [...entry.strategy_tags] : [],
      notes: entry.notes || "",
      screenshot_url: entry.screenshot_url || "",
    });
    setPnlManuallyEdited(true);
    setCustomTag("");
    setEditorOpen(true);
  };

  const updatePricingField = (patch) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (!pnlManuallyEdited) {
        const auto = computePnlFromPrices(next.side, next.entry_price, next.exit_price, next.qty);
        if (auto !== null) next.pnl = String(auto);
      }
      return next;
    });
  };

  const toggleStrategyTag = (tag) => {
    const clean = String(tag || "")
      .trim()
      .slice(0, 32);
    if (!clean) return;
    setForm((prev) => {
      const exists = prev.strategy_tags.some((t) => t.toLowerCase() === clean.toLowerCase());
      if (exists) {
        return {
          ...prev,
          strategy_tags: prev.strategy_tags.filter((t) => t.toLowerCase() !== clean.toLowerCase()),
        };
      }
      if (prev.strategy_tags.length >= 12) {
        toast.error("Maximum 12 strategy tags per trade.");
        return prev;
      }
      return { ...prev, strategy_tags: [...prev.strategy_tags, clean] };
    });
  };

  const addCustomTag = () => {
    const clean = customTag.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!clean) return;
    if (form.strategy_tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setCustomTag("");
      return;
    }
    if (form.strategy_tags.length >= 12) {
      toast.error("Maximum 12 strategy tags per trade.");
      return;
    }
    setForm((prev) => ({ ...prev, strategy_tags: [...prev.strategy_tags, clean] }));
    setCustomTag("");
  };

  const handleScreenshotFile = async (file) => {
    if (!file) return;
    const allowed = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    if (!allowed.has(String(file.type || "").toLowerCase())) {
      toast.error("Please select a PNG, JPEG, or WebP chart screenshot.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Chart screenshot must be under 4 MB.");
      return;
    }
    setUploadingShot(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await api.post("/me/journal/screenshot", {
        data_url: dataUrl,
        filename: file.name || "chart-screenshot.png",
      });
      if (res.data?.url) {
        setForm((prev) => ({ ...prev, screenshot_url: res.data.url }));
        toast.success("Chart screenshot uploaded.");
      }
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Screenshot upload failed.");
    } finally {
      setUploadingShot(false);
    }
  };

  const handlePasteScreenshot = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          await handleScreenshotFile(file);
          return;
        }
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.symbol.trim()) {
      toast.error("Instrument symbol is required.");
      return;
    }
    if (
      form.entry_price === "" ||
      Number(form.entry_price) < 0 ||
      Number.isNaN(Number(form.entry_price))
    ) {
      toast.error("Please enter a valid entry price.");
      return;
    }

    const linkedAcct = accounts.find((a) => a.id === form.account_id);
    const payload = {
      symbol: form.symbol.trim().toUpperCase(),
      side: form.side,
      trade_date: form.trade_date || todayIsoDate(),
      timeframe: form.timeframe,
      entry_price: Number(form.entry_price),
      exit_price: form.exit_price !== "" ? Number(form.exit_price) : null,
      qty: form.qty !== "" ? Number(form.qty) : 1,
      pnl: form.pnl !== "" ? Number(form.pnl) : undefined,
      setup: form.setup.trim(),
      emotions: form.emotions,
      rating: Number(form.rating || 0),
      account_id: form.account_id,
      account_label: linkedAcct
        ? `${linkedAcct.plan_name || "Account"} (${linkedAcct.account_number || linkedAcct.id})`
        : "",
      strategy_tags: form.strategy_tags,
      notes: form.notes.trim(),
      screenshot_url: form.screenshot_url.trim(),
    };

    setSaving(true);
    try {
      if (editingEntry?.id) {
        const res = await api.put(`/me/journal/${encodeURIComponent(editingEntry.id)}`, payload);
        setEntries((prev) => prev.map((x) => (x.id === editingEntry.id ? res.data : x)));
        toast.success("Journal entry updated.");
      } else {
        const res = await api.post("/me/journal", payload);
        setEntries((prev) => [res.data, ...prev]);
        toast.success("Trade logged to journal.");
      }
      setEditorOpen(false);
      setEditingEntry(null);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not save journal entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/me/journal/${encodeURIComponent(id)}`);
      setEntries((prev) => prev.filter((x) => x.id !== id));
      setConfirmDeleteId("");
      if (lightboxEntry?.id === id) setLightboxEntry(null);
      toast.success("Journal entry deleted.");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not delete entry.");
    } finally {
      setDeletingId("");
    }
  };

  const exportCsv = () => {
    if (!filteredEntries.length || typeof window === "undefined") return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "date",
      "symbol",
      "side",
      "timeframe",
      "entry_price",
      "exit_price",
      "qty",
      "pnl",
      "strategy_tags",
      "emotions",
      "rating",
      "notes",
      "screenshot_url",
    ];
    const rows = filteredEntries.map((e) =>
      [
        e.trade_date,
        e.symbol,
        e.side,
        e.timeframe,
        e.entry_price,
        e.exit_price ?? "",
        e.qty,
        e.pnl,
        (e.strategy_tags || []).join("; "),
        e.emotions,
        e.rating || "",
        e.notes,
        e.screenshot_url,
      ]
        .map(esc)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `indifunded-journal-${todayIsoDate()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const previewScreenshotSrc = safeScreenshotSrc(form.screenshot_url);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)]">
            Trading Journal
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
            Log trades manually with execution notes, strategy tags, and chart screenshots to review
            what drives your edge.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {filteredEntries.length > 0 && (
            <button
              type="button"
              onClick={exportCsv}
              className="btn-ghost rounded-xl px-3.5 py-2.5 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download size={14} /> Export CSV
            </button>
          )}
          <button
            type="button"
            onClick={openCreateModal}
            data-testid="journal-log-btn"
            className="btn-amber rounded-xl px-4 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus size={14} /> Log trade
          </button>
        </div>
      </div>

      {/* 4-Card Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="card-panel p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Logged Trades
          </div>
          <div
            className="font-display text-2xl font-semibold text-[var(--text)] mt-1.5"
            data-testid="journal-kpi-total"
          >
            {stats.total}
          </div>
          <div className="text-[11px] font-mono text-[var(--muted-2)] mt-1">
            {stats.wins}W · {stats.losses}L
          </div>
        </div>

        <div className="card-panel p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Win Rate
          </div>
          <div className="font-display text-2xl font-semibold text-[var(--text)] mt-1.5">
            {stats.winRate}%
          </div>
          <div className="text-[11px] font-mono text-[var(--muted-2)] mt-1">
            across decided trades
          </div>
        </div>

        <div className="card-panel p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Net Journal P&amp;L
          </div>
          <div
            className={`font-display text-2xl font-semibold mt-1.5 ${
              stats.netPnl >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
            }`}
            data-testid="journal-kpi-pnl"
          >
            {signedINR(stats.netPnl)}
          </div>
          <div className="text-[11px] font-mono text-[var(--muted-2)] mt-1">
            {hasActiveFilters ? "filtered selection" : "all logged entries"}
          </div>
        </div>

        <div className="card-panel p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Top Strategy
          </div>
          <div className="font-display text-xl font-semibold text-[var(--text)] mt-1.5 truncate">
            {stats.topTag ? stats.topTag.tag : "—"}
          </div>
          <div className="text-[11px] font-mono text-[var(--muted-2)] mt-1 truncate">
            {stats.topTag
              ? `${signedINR(stats.topTag.pnl)} · ${stats.topTag.count} trade${stats.topTag.count === 1 ? "" : "s"}`
              : "Add strategy tags to track"}
          </div>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="card-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)] pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol, notes, setup, or strategy tag…"
              aria-label="Search journal entries"
              data-testid="journal-search"
              className="input-dark !pl-9 !py-2 text-xs"
            />
          </div>

          <div className="seg !p-0.5" role="group" aria-label="Outcome filter">
            {[
              ["all", "All"],
              ["wins", "Wins"],
              ["losses", "Losses"],
              ["breakeven", "Flat"],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOutcomeFilter(k)}
                className={`!px-3 !py-1.5 text-xs ${outcomeFilter === k ? "is-on" : ""}`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="seg !p-0.5" role="group" aria-label="Side filter">
            {["ALL", "BUY", "SELL"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSideFilter(s)}
                className={`!px-3 !py-1.5 text-xs ${
                  sideFilter === s
                    ? s === "BUY"
                      ? "is-buy"
                      : s === "SELL"
                        ? "is-sell"
                        : "is-on"
                    : ""
                }`}
              >
                {s === "ALL" ? "All sides" : s}
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs text-[var(--emerald)] hover:underline px-2 py-1"
            >
              Clear filters
            </button>
          )}
        </div>

        {allTagsWithCounts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-[var(--border)]">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] mr-1 inline-flex items-center gap-1">
              <Tag size={11} /> Strategies
            </span>
            {allTagsWithCounts.map(([tag, count]) => {
              const active = tagFilter.toLowerCase() === tag.toLowerCase();
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTagFilter(active ? "" : tag)}
                  data-testid={`journal-tag-filter-${tag}`}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
                    active
                      ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                      : "bg-[var(--bg-2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)] hover:border-[var(--border-hi)]"
                  }`}
                >
                  {tag} · {count}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* States: Loading / Error / Empty / Entries List */}
      {loading ? (
        <div className="space-y-4" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-2xl border border-[var(--border)] bg-[var(--bg-1)] animate-pulse"
            />
          ))}
        </div>
      ) : loadError ? (
        <div className="card-panel p-8 text-center space-y-3">
          <p className="text-sm text-[var(--rose)]">{loadError}</p>
          <button
            type="button"
            onClick={loadJournal}
            className="btn-ghost rounded-xl px-4 py-2 text-xs font-medium"
          >
            Retry
          </button>
        </div>
      ) : !entries.length ? (
        <div className="card-panel p-10 text-center" data-testid="journal-empty-state">
          <BookOpen size={26} className="text-[var(--accent)] mx-auto" />
          <div className="font-display text-xl font-semibold text-[var(--text)] mt-4">
            Your trading journal is empty
          </div>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto">
            Record manual trades with entry &amp; exit prices, strategy tags, mindset notes, and
            chart screenshots to build a repeatable playbook.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="btn-amber rounded-xl px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5 mt-5"
          >
            <Plus size={14} /> Log your first trade
          </button>
        </div>
      ) : !filteredEntries.length ? (
        <div className="card-panel p-8 text-center space-y-3">
          <div className="font-display text-lg font-semibold text-[var(--text)]">
            No journal entries match your filters
          </div>
          <p className="text-xs text-[var(--muted)]">
            Try clearing your search query or strategy filter to view all {entries.length} entries.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="btn-ghost rounded-xl px-4 py-2 text-xs font-medium"
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div className="space-y-4" data-testid="journal-list">
          {filteredEntries.map((entry) => {
            const pnl = Number(entry.pnl || 0);
            const isWin = pnl > 0;
            const isLoss = pnl < 0;
            const imgSrc = safeScreenshotSrc(entry.screenshot_url);
            const tags = Array.isArray(entry.strategy_tags) ? entry.strategy_tags : [];
            const isConfirmingDelete = confirmDeleteId === entry.id;

            return (
              <article
                key={entry.id}
                data-testid={`journal-entry-${entry.id}`}
                className="card-panel p-5 transition-colors hover:border-[var(--border-hi)]"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left: Trade Details & Notes */}
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="font-display text-lg font-semibold text-[var(--text)]">
                            {entry.symbol}
                          </h2>
                          <span
                            className={`text-[11px] font-mono font-semibold inline-flex items-center gap-1 ${
                              entry.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                            }`}
                          >
                            {entry.side === "BUY" ? (
                              <TrendingUp size={13} />
                            ) : (
                              <TrendingDown size={13} />
                            )}
                            {entry.side}
                          </span>
                          <span className="text-xs font-mono text-[var(--muted-2)] tabular-nums">
                            {entry.trade_date}
                            {entry.timeframe ? ` · ${entry.timeframe}` : ""}
                            {entry.emotions ? ` · ${entry.emotions}` : ""}
                            {entry.account_label ? ` · ${entry.account_label}` : ""}
                          </span>
                        </div>

                        {entry.setup && (
                          <div className="text-xs text-[var(--muted)] mt-0.5">
                            Setup: <span className="text-[var(--text)]">{entry.setup}</span>
                          </div>
                        )}
                      </div>

                      {/* P&L and Rating */}
                      <div className="text-left sm:text-right shrink-0 tabular-nums">
                        <div
                          className={`font-mono text-xl font-semibold ${
                            isWin
                              ? "text-[var(--emerald)]"
                              : isLoss
                                ? "text-[var(--rose)]"
                                : "text-[var(--text)]"
                          }`}
                        >
                          {signedINR(pnl)}
                        </div>
                        {Number(entry.rating) > 0 && (
                          <div
                            className="flex items-center sm:justify-end gap-0.5 mt-0.5 text-amber-400"
                            aria-label={`Execution rating ${entry.rating} out of 5`}
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star
                                key={n}
                                size={11}
                                className={
                                  n <= entry.rating
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-[var(--border-hi)]"
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Execution Price Strip */}
                    <div className="grid grid-cols-3 sm:inline-grid sm:grid-cols-3 gap-4 py-2 px-3 rounded-xl bg-[var(--bg-2)] border border-[var(--border)] text-xs tabular-nums">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[var(--muted-2)] block">
                          Entry
                        </span>
                        <span className="font-mono font-medium text-[var(--text)]">
                          {formatPrice(entry.entry_price)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[var(--muted-2)] block">
                          Exit
                        </span>
                        <span className="font-mono font-medium text-[var(--text)]">
                          {entry.exit_price !== null && entry.exit_price !== undefined
                            ? formatPrice(entry.exit_price)
                            : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-[var(--muted-2)] block">
                          Qty
                        </span>
                        <span className="font-mono font-medium text-[var(--text)]">
                          {entry.qty}
                        </span>
                      </div>
                    </div>

                    {/* Strategy Tags */}
                    {tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setTagFilter((cur) =>
                                cur.toLowerCase() === tag.toLowerCase() ? "" : tag,
                              )
                            }
                            className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-[var(--accent-soft)] text-[var(--emerald)] hover:opacity-85 transition-opacity"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Notes */}
                    {entry.notes ? (
                      <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed whitespace-pre-line">
                        {entry.notes}
                      </p>
                    ) : (
                      <p className="text-xs italic text-[var(--muted-2)]">
                        No trade notes recorded.
                      </p>
                    )}

                    {/* Entry Actions */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openEditModal(entry)}
                        data-testid={`journal-edit-${entry.id}`}
                        className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                      >
                        <Pencil size={12} /> Edit
                      </button>

                      {isConfirmingDelete ? (
                        <div className="inline-flex items-center gap-1.5 bg-[var(--rose)]/10 border border-[var(--rose)]/35 rounded-lg px-2.5 py-1">
                          <span className="text-[11px] text-[var(--rose)] font-medium">
                            Delete this entry?
                          </span>
                          <button
                            type="button"
                            disabled={deletingId === entry.id}
                            onClick={() => handleDelete(entry.id)}
                            data-testid={`journal-confirm-delete-${entry.id}`}
                            className="text-[11px] font-semibold text-[var(--rose)] hover:underline px-1.5"
                          >
                            {deletingId === entry.id ? "Deleting…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId("")}
                            className="text-[11px] text-[var(--muted)] hover:text-[var(--text)] px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          data-testid={`journal-delete-${entry.id}`}
                          className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--rose)] inline-flex items-center gap-1.5"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Chart Screenshot Thumbnail */}
                  {imgSrc && (
                    <div className="lg:w-60 shrink-0">
                      <button
                        type="button"
                        onClick={() => setLightboxEntry(entry)}
                        data-testid={`journal-shot-${entry.id}`}
                        className="group relative block w-full overflow-hidden rounded-xl border border-[var(--border-hi)] bg-[var(--bg-2)] text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                        aria-label={`View chart screenshot for ${entry.symbol}`}
                      >
                        <img
                          src={imgSrc}
                          alt={`${entry.symbol} chart screenshot`}
                          loading="lazy"
                          className="w-full h-36 object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                        />
                        <span className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/70 text-white text-[10px] font-mono inline-flex items-center gap-1">
                          <Maximize2 size={10} /> Chart
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Create / Edit Trade Journal Dialog */}
      <Dialog
        open={editorOpen}
        onOpenChange={(next) => {
          setEditorOpen(next);
          if (!next) setEditingEntry(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-[var(--text)]">
              {editingEntry ? `Edit ${editingEntry.symbol} entry` : "Log trade to journal"}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Record execution prices, strategy tags, mindset notes, and attach your chart
              screenshot.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} onPaste={handlePasteScreenshot} className="space-y-4 mt-2">
            {/* Row 1: Symbol, Side, Date, Timeframe */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label
                  htmlFor="journal-symbol"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Instrument *
                </label>
                <input
                  id="journal-symbol"
                  list="journal-symbol-suggestions"
                  type="text"
                  required
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                  placeholder="NIFTY 24500 CE"
                  className="input-dark !py-2 text-xs uppercase"
                  data-testid="journal-input-symbol"
                />
                <datalist id="journal-symbol-suggestions">
                  {SUGGESTED_SYMBOLS.map((sym) => (
                    <option key={sym} value={sym} />
                  ))}
                </datalist>
              </div>

              <div>
                <span className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1">
                  Side
                </span>
                <div
                  className="seg !p-0.5 w-full grid grid-cols-2"
                  role="group"
                  aria-label="Trade side"
                >
                  {["BUY", "SELL"].map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => updatePricingField({ side })}
                      data-testid={`journal-side-${side}`}
                      className={`!py-1.5 text-xs ${
                        form.side === side ? (side === "BUY" ? "is-buy" : "is-sell") : ""
                      }`}
                    >
                      {side}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="journal-date"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Trade Date
                </label>
                <div className="relative">
                  <Calendar
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-2)] pointer-events-none"
                  />
                  <input
                    id="journal-date"
                    type="date"
                    value={form.trade_date}
                    onChange={(e) => setForm((f) => ({ ...f, trade_date: e.target.value }))}
                    className="input-dark !pl-8 !py-2 text-xs font-mono"
                    data-testid="journal-input-date"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="journal-timeframe"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Timeframe
                </label>
                <select
                  id="journal-timeframe"
                  value={form.timeframe}
                  onChange={(e) => setForm((f) => ({ ...f, timeframe: e.target.value }))}
                  className="input-dark !py-2 text-xs"
                >
                  {TIMEFRAMES.map((tf) => (
                    <option key={tf || "none"} value={tf}>
                      {tf || "Select…"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Entry, Exit, Qty, P&L */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
              <div>
                <label
                  htmlFor="journal-entry"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Entry Price *
                </label>
                <input
                  id="journal-entry"
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={form.entry_price}
                  onChange={(e) => updatePricingField({ entry_price: e.target.value })}
                  placeholder="245.50"
                  className="input-dark !py-2 text-xs font-mono"
                  data-testid="journal-input-entry"
                />
              </div>

              <div>
                <label
                  htmlFor="journal-exit"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Exit Price
                </label>
                <input
                  id="journal-exit"
                  type="number"
                  step="any"
                  min="0"
                  value={form.exit_price}
                  onChange={(e) => updatePricingField({ exit_price: e.target.value })}
                  placeholder="278.00"
                  className="input-dark !py-2 text-xs font-mono"
                  data-testid="journal-input-exit"
                />
              </div>

              <div>
                <label
                  htmlFor="journal-qty"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Qty / Units
                </label>
                <input
                  id="journal-qty"
                  type="number"
                  step="any"
                  min="0"
                  value={form.qty}
                  onChange={(e) => updatePricingField({ qty: e.target.value })}
                  placeholder="50"
                  className="input-dark !py-2 text-xs font-mono"
                  data-testid="journal-input-qty"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="journal-pnl"
                    className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)]"
                  >
                    Net P&amp;L (₹)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const calc = computePnlFromPrices(
                        form.side,
                        form.entry_price,
                        form.exit_price,
                        form.qty,
                      );
                      if (calc !== null) {
                        setPnlManuallyEdited(false);
                        setForm((f) => ({ ...f, pnl: String(calc) }));
                      }
                    }}
                    className="text-[10px] font-mono text-[var(--emerald)] hover:underline inline-flex items-center gap-0.5"
                    title="Auto-calculate from Entry, Exit & Qty"
                  >
                    <Sparkles size={9} /> Calc
                  </button>
                </div>
                <input
                  id="journal-pnl"
                  type="number"
                  step="any"
                  value={form.pnl}
                  onChange={(e) => {
                    setPnlManuallyEdited(true);
                    setForm((f) => ({ ...f, pnl: e.target.value }));
                  }}
                  placeholder="1625"
                  className="input-dark !py-2 text-xs font-mono"
                  data-testid="journal-input-pnl"
                />
              </div>
            </div>

            {/* Row 3: Setup, Mindset, Account, Execution Rating */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="journal-setup"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Setup / Catalyst
                </label>
                <input
                  id="journal-setup"
                  type="text"
                  value={form.setup}
                  onChange={(e) => setForm((f) => ({ ...f, setup: e.target.value }))}
                  placeholder="Opening range retest"
                  className="input-dark !py-2 text-xs"
                />
              </div>

              <div>
                <label
                  htmlFor="journal-emotions"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Mindset
                </label>
                <select
                  id="journal-emotions"
                  value={form.emotions}
                  onChange={(e) => setForm((f) => ({ ...f, emotions: e.target.value }))}
                  className="input-dark !py-2 text-xs"
                >
                  {EMOTIONS.map((em) => (
                    <option key={em || "none"} value={em}>
                      {em || "Select mindset…"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1">
                  Execution Rating
                </span>
                <div className="h-[34px] px-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, rating: f.rating === star ? 0 : star }))
                        }
                        aria-label={`Rate ${star} stars`}
                        className="p-0.5 hover:scale-110 transition-transform"
                      >
                        <Star
                          size={15}
                          className={
                            star <= form.rating
                              ? "fill-amber-400 text-amber-400"
                              : "text-[var(--muted-2)]"
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-[var(--muted-2)] tabular-nums">
                    {form.rating ? `${form.rating}/5` : "Unrated"}
                  </span>
                </div>
              </div>
            </div>

            {accounts.length > 0 && (
              <div>
                <label
                  htmlFor="journal-account"
                  className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
                >
                  Trading Account (optional)
                </label>
                <select
                  id="journal-account"
                  value={form.account_id}
                  onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
                  className="input-dark !py-2 text-xs"
                >
                  <option value="">Personal / Unlinked</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.plan_name} · {a.account_number || a.id} ({a.status || "Active"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Strategy Tags */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  Strategy Tags
                </span>
                <span className="text-[10px] font-mono text-[var(--muted-2)]">
                  {form.strategy_tags.length}/12 selected
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.map((tag) => {
                  const selected = form.strategy_tags.some(
                    (t) => t.toLowerCase() === tag.toLowerCase(),
                  );
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleStrategyTag(tag)}
                      data-testid={`journal-preset-tag-${tag}`}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
                        selected
                          ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                          : "bg-[var(--bg-2)] text-[var(--muted)] border-[var(--border)] hover:text-[var(--text)]"
                      }`}
                    >
                      {selected ? `✓ ${tag}` : `+ ${tag}`}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomTag();
                    }
                  }}
                  placeholder="Add custom strategy tag (press Enter)…"
                  className="input-dark !py-1.5 text-xs flex-1"
                  data-testid="journal-custom-tag-input"
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  data-testid="journal-add-tag-btn"
                  className="btn-ghost rounded-xl px-3 py-1.5 text-xs font-medium shrink-0"
                >
                  Add tag
                </button>
              </div>

              {form.strategy_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.strategy_tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-[var(--accent-soft)] text-[var(--emerald)]"
                    >
                      #{tag}
                      <button
                        type="button"
                        onClick={() => toggleStrategyTag(tag)}
                        aria-label={`Remove tag ${tag}`}
                        className="hover:text-[var(--rose)]"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label
                htmlFor="journal-notes"
                className="block text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-1"
              >
                Trade Notes &amp; Lessons
              </label>
              <Textarea
                id="journal-notes"
                rows={4}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Why did you enter? Where was your stop-loss and target? What would you repeat or fix next time?"
                className="text-xs bg-[var(--bg-2)] border-[var(--border)] text-[var(--text)]"
                data-testid="journal-input-notes"
              />
            </div>

            {/* Chart Screenshot Upload & Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  Chart Screenshot
                </span>
                <span className="text-[10px] font-mono text-[var(--muted-2)]">
                  PNG, JPG, WebP · max 4 MB · paste or drop
                </span>
              </div>

              {previewScreenshotSrc ? (
                <div className="relative rounded-xl overflow-hidden border border-[var(--border-hi)] bg-[var(--bg-2)]">
                  <img
                    src={previewScreenshotSrc}
                    alt="Trade chart preview"
                    className="w-full max-h-56 object-contain bg-black/20"
                    data-testid="journal-screenshot-preview"
                  />
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--border)] bg-[var(--bg-1)] text-xs">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingShot}
                      className="text-[var(--emerald)] hover:underline inline-flex items-center gap-1"
                    >
                      <Upload size={12} /> Replace image
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, screenshot_url: "" }))}
                      className="text-[var(--rose)] hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Remove screenshot
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setDragActive(false);
                    const file = e.dataTransfer?.files?.[0];
                    if (file) await handleScreenshotFile(file);
                  }}
                  className={`rounded-xl border border-dashed p-5 text-center transition-colors ${
                    dragActive
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border-hi)] bg-[var(--bg-2)]/60"
                  }`}
                >
                  {uploadingShot ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
                      <Loader2 size={15} className="animate-spin text-[var(--accent)]" /> Uploading
                      chart screenshot…
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <ImagePlus size={22} className="mx-auto text-[var(--accent)]" />
                      <div className="text-xs text-[var(--muted)]">
                        Drag &amp; drop a chart screenshot, paste with{" "}
                        <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-1)] border border-[var(--border)] font-mono text-[10px]">
                          Ctrl+V
                        </kbd>
                        , or
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                      >
                        <Upload size={12} /> Choose chart image
                      </button>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                data-testid="journal-screenshot-input"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) await handleScreenshotFile(file);
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="btn-ghost rounded-xl px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingShot}
                data-testid="journal-save-btn"
                className="btn-amber rounded-xl px-5 py-2 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Saving…
                  </>
                ) : editingEntry ? (
                  "Save changes"
                ) : (
                  "Save trade"
                )}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Chart Screenshot Lightbox Modal */}
      <Dialog
        open={Boolean(lightboxEntry)}
        onOpenChange={(open) => !open && setLightboxEntry(null)}
      >
        <DialogContent className="max-w-4xl bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--text)]">
          {lightboxEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-lg flex items-center gap-2.5 flex-wrap">
                  <span>{lightboxEntry.symbol}</span>
                  <span
                    className={`text-xs font-mono ${
                      lightboxEntry.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                    }`}
                  >
                    {lightboxEntry.side}
                  </span>
                  <span
                    className={`text-sm font-mono tabular-nums ${
                      Number(lightboxEntry.pnl || 0) >= 0
                        ? "text-[var(--emerald)]"
                        : "text-[var(--rose)]"
                    }`}
                  >
                    {signedINR(lightboxEntry.pnl)}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-xs font-mono text-[var(--muted-2)]">
                  {lightboxEntry.trade_date}
                  {lightboxEntry.timeframe ? ` · ${lightboxEntry.timeframe}` : ""}
                  {lightboxEntry.setup ? ` · ${lightboxEntry.setup}` : ""}
                </DialogDescription>
              </DialogHeader>
              {safeScreenshotSrc(lightboxEntry.screenshot_url) && (
                <div className="rounded-xl overflow-hidden border border-[var(--border)] bg-black/30">
                  <img
                    src={safeScreenshotSrc(lightboxEntry.screenshot_url)}
                    alt={`${lightboxEntry.symbol} chart full view`}
                    className="w-full max-h-[68vh] object-contain mx-auto"
                  />
                </div>
              )}
              {lightboxEntry.notes && (
                <p className="text-xs sm:text-sm text-[var(--muted)] whitespace-pre-line border-t border-[var(--border)] pt-3">
                  {lightboxEntry.notes}
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
