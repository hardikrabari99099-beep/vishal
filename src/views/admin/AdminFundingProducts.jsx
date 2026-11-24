import { useCallback, useEffect, useMemo, useState } from "react";
import { api, formatINR, formatApiError } from "../../lib/api";
import { broadcastSync } from "../../context/SettingsContext";
import {
  DEFAULT_FUNDING_PRODUCTS,
  PRODUCT_TYPES,
  getAccountProductType,
  normalizeFundingProductsConfig,
  productBadgeLabel,
} from "../../lib/funding-products";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { toast } from "sonner";
import {
  ShieldCheck,
  Zap,
  Award,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Save,
  Eye,
  Clock,
  Search,
} from "lucide-react";

const TABS = [
  { id: "instant", label: "Instant Funding", icon: Zap },
  { id: "one_step", label: "1-Step Challenge", icon: Award },
  { id: "accounts", label: "Accounts & Live Risk", icon: Activity },
  { id: "audit", label: "Breaches & Passed", icon: AlertTriangle },
];

function StatusBadge({ status }) {
  const s = String(status || "Active").toLowerCase();
  const cls =
    s === "failed" || s === "breached"
      ? "bg-rose-500/15 text-rose-300 border-rose-500/40"
      : s === "passed"
        ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
        : ["funded", "active"].includes(s)
          ? "bg-[var(--accent-soft)] text-[var(--emerald)] border-[var(--emerald)]/35"
          : "bg-[var(--bg-2)] text-[var(--muted)] border-[var(--border)]";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${cls}`}>
      {status || "Active"}
    </span>
  );
}

export default function AdminFundingProducts() {
  const [tab, setTab] = useState("instant");
  const [config, setConfig] = useState(() =>
    normalizeFundingProductsConfig(DEFAULT_FUNDING_PRODUCTS),
  );
  const [loadingCfg, setLoadingCfg] = useState(true);
  const [saving, setSaving] = useState(false);

  const [acctData, setAcctData] = useState({ accounts: [], breaches: [], events: [] });
  const [loadingAccts, setLoadingAccts] = useState(false);
  const [evaluating, setEvaluating] = useState(false);

  const [productFilter, setProductFilter] = useState("non_classic");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDetail, setHistoryDetail] = useState(null);

  const loadConfig = useCallback(async () => {
    setLoadingCfg(true);
    try {
      const { data } = await api.get("/admin/funding-products");
      setConfig(normalizeFundingProductsConfig(data));
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail, "Could not load funding products"));
    } finally {
      setLoadingCfg(false);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoadingAccts(true);
    try {
      const { data } = await api.get("/admin/funding-accounts");
      setAcctData({
        accounts: data?.accounts || [],
        breaches: data?.breaches || [],
        events: data?.events || [],
      });
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail, "Could not load funding accounts"));
    } finally {
      setLoadingAccts(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadAccounts();
  }, [loadConfig, loadAccounts]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/funding-products", config);
      setConfig(normalizeFundingProductsConfig(data));
      broadcastSync("funding_products");
      toast.success("Funding product configuration saved");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail, "Could not save configuration"));
    } finally {
      setSaving(false);
    }
  };

  const runRiskSweep = async (settleEod = false) => {
    setEvaluating(true);
    try {
      const { data } = await api.post("/admin/risk/evaluate", { settle_eod: settleEod });
      toast.success(
        `${settleEod ? "EOD settlement" : "Risk check"} complete: ${data.evaluated} evaluated, ${data.breached} breached, ${data.passed} passed`,
      );
      await loadAccounts();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail, "Risk check failed"));
    } finally {
      setEvaluating(false);
    }
  };

  const openHistory = async (accountId) => {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryDetail(null);
    try {
      const { data } = await api.get(`/admin/funding-accounts/${accountId}/history`);
      setHistoryDetail(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail, "Could not load account history"));
      setHistoryOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const updateInstant = (patch) =>
    setConfig((prev) => ({ ...prev, instant_funding: { ...prev.instant_funding, ...patch } }));

  const updateInstantCycle = (cycleKey, patch) =>
    setConfig((prev) => ({
      ...prev,
      instant_funding: {
        ...prev.instant_funding,
        payout_cycles: {
          ...prev.instant_funding.payout_cycles,
          [cycleKey]: { ...prev.instant_funding.payout_cycles[cycleKey], ...patch },
        },
      },
    }));

  const updateInstantTier = (idx, patch) =>
    setConfig((prev) => ({
      ...prev,
      instant_funding: {
        ...prev.instant_funding,
        tiers: prev.instant_funding.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
      },
    }));

  const updateOneStep = (patch) =>
    setConfig((prev) => ({ ...prev, one_step: { ...prev.one_step, ...patch } }));

  const updateOneStepTier = (idx, patch) =>
    setConfig((prev) => ({
      ...prev,
      one_step: {
        ...prev.one_step,
        tiers: prev.one_step.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
      },
    }));

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (acctData.accounts || []).filter((a) => {
      const pType = getAccountProductType(a);
      if (productFilter === "non_classic" && pType === PRODUCT_TYPES.CLASSIC) return false;
      if (productFilter !== "all" && productFilter !== "non_classic" && pType !== productFilter) {
        return false;
      }
      if (statusFilter !== "all" && String(a.status || "").toLowerCase() !== statusFilter) {
        return false;
      }
      if (q) {
        const hay =
          `${a.account_number || ""} ${a.user_email || ""} ${a.user_name || ""} ${a.plan_name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [acctData.accounts, productFilter, statusFilter, search]);

  const nonClassicAccounts = useMemo(
    () =>
      (acctData.accounts || []).filter((a) => getAccountProductType(a) !== PRODUCT_TYPES.CLASSIC),
    [acctData.accounts],
  );

  const passedChallenges = useMemo(
    () =>
      (acctData.accounts || []).filter(
        (a) =>
          getAccountProductType(a) === PRODUCT_TYPES.ONE_STEP &&
          String(a.status || "") === "Passed",
      ),
    [acctData.accounts],
  );

  const inst = config.instant_funding;
  const one = config.one_step;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="chip mb-3">Isolated Product Engines</div>
          <h1
            className="font-display text-3xl sm:text-4xl"
            data-testid="admin-funding-products-title"
          >
            Funding Products &amp; Risk Automation
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Configure independent pricing, drawdown rules, and automated breach/pass workflows for{" "}
            <strong className="text-white">Instant Funding</strong> and{" "}
            <strong className="text-white">1-Step Challenge</strong>. Existing Classic IndiFunded
            plans remain completely untouched.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => runRiskSweep(false)}
            disabled={evaluating}
            className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-1.5"
            data-testid="admin-run-risk-check"
          >
            <RefreshCw size={14} className={evaluating ? "animate-spin" : ""} />
            Run Risk Check
          </button>
          <button
            type="button"
            onClick={() => runRiskSweep(true)}
            disabled={evaluating}
            className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-1.5"
            data-testid="admin-run-eod-settlement"
          >
            <Clock size={14} /> Run EOD Settlement
          </button>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="card-panel p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            New Product Accounts
          </div>
          <div className="font-display text-3xl mt-2">{nonClassicAccounts.length}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Instant &amp; 1-Step combined</div>
        </div>
        <div className="card-panel p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Active / Funded Live
          </div>
          <div className="font-display text-3xl text-[var(--emerald)] mt-2">
            {nonClassicAccounts.filter((a) => ["Active", "Funded"].includes(a.status)).length}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">Automated monitoring enabled</div>
        </div>
        <div className="card-panel p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Passed 1-Step
          </div>
          <div className="font-display text-3xl text-amber-300 mt-2">{passedChallenges.length}</div>
          <div className="text-xs text-[var(--muted)] mt-1">Auto-promoted to Funded</div>
        </div>
        <div className="card-panel p-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            Auto-Breaches Logged
          </div>
          <div className="font-display text-3xl text-[var(--rose)] mt-2">
            {(acctData.breaches || []).length}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">Zero manual delay</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              data-testid={`funding-tab-${t.id}`}
              className={`px-4 py-2 rounded-full text-xs font-medium inline-flex items-center gap-2 transition ${
                active
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--bg-1)] border border-[var(--border)] text-[var(--muted)] hover:text-white"
              }`}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: INSTANT FUNDING */}
      {tab === "instant" && (
        <div className="space-y-6">
          <div className="card-panel p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-display text-2xl">
                  Instant Funding — Global Rules &amp; Visibility
                </h2>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Independent from Classic IndiFunded rules. Immediate Funded status upon payment.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(inst.enabled)}
                    onChange={(e) => updateInstant({ enabled: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>Product Enabled</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(inst.public_visible)}
                    onChange={(e) => updateInstant({ public_visible: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>Visible on /challenges</span>
                </label>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Daily Loss Limit (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={inst.daily_loss_limit_pct}
                  onChange={(e) => updateInstant({ daily_loss_limit_pct: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Overall Trailing Drawdown (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={inst.trailing_drawdown_pct}
                  onChange={(e) => updateInstant({ trailing_drawdown_pct: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Reserved Profit Buffer (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={inst.buffer_pct}
                  onChange={(e) => updateInstant({ buffer_pct: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Default Drawdown Mode</Label>
                <select
                  value={inst.default_drawdown_mode || "intraday"}
                  onChange={(e) => updateInstant({ default_drawdown_mode: e.target.value })}
                  className="input-dark mt-1.5"
                >
                  <option value="intraday">Intraday Trailing (live peak)</option>
                  <option value="eod">EOD Trailing (end-of-day settled)</option>
                </select>
              </div>
              <div>
                <Label>Max Trades Per Day (0 = Unlimited)</Label>
                <Input
                  type="number"
                  min="0"
                  value={inst.trades_per_day}
                  onChange={(e) => updateInstant({ trades_per_day: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Breach Handling Policy</Label>
                <select
                  value={inst.breach_policy || "close_all_and_fail"}
                  onChange={(e) => updateInstant({ breach_policy: e.target.value })}
                  className="input-dark mt-1.5"
                >
                  <option value="close_all_and_fail">
                    Cancel pending + Close all positions + Fail
                  </option>
                  <option value="cancel_and_fail">Cancel pending orders + Fail</option>
                </select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-3 border-t border-[var(--border)]">
              <div className="p-4 rounded-xl bg-[var(--bg-1)] border border-[var(--border)] space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-[var(--emerald)]">
                  Bi-Weekly Payout Option
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Profit Split (%)</Label>
                    <Input
                      type="number"
                      value={inst.payout_cycles.biweekly.profit_split}
                      onChange={(e) =>
                        updateInstantCycle("biweekly", { profit_split: Number(e.target.value) })
                      }
                      className="bg-[var(--bg-2)] border-[var(--border-hi)] mt-1"
                    />
                  </div>
                  <div>
                    <Label>Interval (Days)</Label>
                    <Input
                      type="number"
                      value={inst.payout_cycles.biweekly.interval_days}
                      onChange={(e) =>
                        updateInstantCycle("biweekly", { interval_days: Number(e.target.value) })
                      }
                      className="bg-[var(--bg-2)] border-[var(--border-hi)] mt-1"
                    />
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-[var(--bg-1)] border border-[var(--border)] space-y-3">
                <div className="text-xs font-mono uppercase tracking-wider text-[var(--accent)]">
                  Monthly Payout Option
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Profit Split (%)</Label>
                    <Input
                      type="number"
                      value={inst.payout_cycles.monthly.profit_split}
                      onChange={(e) =>
                        updateInstantCycle("monthly", { profit_split: Number(e.target.value) })
                      }
                      className="bg-[var(--bg-2)] border-[var(--border-hi)] mt-1"
                    />
                  </div>
                  <div>
                    <Label>Interval (Days)</Label>
                    <Input
                      type="number"
                      value={inst.payout_cycles.monthly.interval_days}
                      onChange={(e) =>
                        updateInstantCycle("monthly", { interval_days: Number(e.target.value) })
                      }
                      className="bg-[var(--bg-2)] border-[var(--border-hi)] mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-panel overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-display text-xl">Instant Funding Pricing Tiers (INR)</h3>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  Configure exact fees separately for Intraday vs EOD drawdown across all 6 sizes.
                </p>
              </div>
              <button
                type="button"
                onClick={saveConfig}
                disabled={saving || loadingCfg}
                className="btn-amber rounded-full px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5"
                data-testid="save-instant-config"
              >
                <Save size={14} /> {saving ? "Saving…" : "Save Instant Config"}
              </button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border)]">
                  <TableHead>Account Size</TableHead>
                  <TableHead>Intraday Price (₹)</TableHead>
                  <TableHead>EOD Price (₹)</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Public</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inst.tiers.map((tier, idx) => (
                  <TableRow key={tier.size} className="border-[var(--border)]">
                    <TableCell className="font-mono font-semibold text-white">
                      {formatINR(tier.size)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={tier.intraday_price}
                        onChange={(e) =>
                          updateInstantTier(idx, { intraday_price: Number(e.target.value) })
                        }
                        className="bg-[var(--bg-1)] border-[var(--border-hi)] w-36 font-mono"
                        data-testid={`instant-intraday-price-${tier.size}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={tier.eod_price}
                        onChange={(e) =>
                          updateInstantTier(idx, { eod_price: Number(e.target.value) })
                        }
                        className="bg-[var(--bg-1)] border-[var(--border-hi)] w-36 font-mono"
                        data-testid={`instant-eod-price-${tier.size}`}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={Boolean(tier.enabled)}
                        onChange={(e) => updateInstantTier(idx, { enabled: e.target.checked })}
                        className="accent-[var(--accent)]"
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={Boolean(tier.public_visible)}
                        onChange={(e) =>
                          updateInstantTier(idx, { public_visible: e.target.checked })
                        }
                        className="accent-[var(--accent)]"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 2: 1-STEP CHALLENGE */}
      {tab === "one_step" && (
        <div className="space-y-6">
          <div className="card-panel p-6 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-display text-2xl">1-Step Challenge — Rules &amp; Automation</h2>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Single-phase challenge with automated funded promotion upon achieving target &amp;
                  minimum trading days.
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs flex-wrap">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(one.enabled)}
                    onChange={(e) => updateOneStep({ enabled: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>Product Enabled</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(one.public_visible)}
                    onChange={(e) => updateOneStep({ public_visible: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>Visible on /challenges</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(one.auto_activate_funded)}
                    onChange={(e) => updateOneStep({ auto_activate_funded: e.target.checked })}
                    className="accent-[var(--accent)]"
                  />
                  <span>Auto-Activate Funded Account</span>
                </label>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label>Profit Target (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={one.profit_target_pct}
                  onChange={(e) => updateOneStep({ profit_target_pct: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Daily Loss Limit (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={one.daily_loss_limit_pct}
                  onChange={(e) => updateOneStep({ daily_loss_limit_pct: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Maximum Overall Loss (%)</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={one.overall_loss_limit_pct}
                  onChange={(e) =>
                    updateOneStep({ overall_loss_limit_pct: Number(e.target.value) })
                  }
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Minimum Trading Days</Label>
                <Input
                  type="number"
                  min="0"
                  value={one.min_trading_days}
                  onChange={(e) => updateOneStep({ min_trading_days: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Funded Profit Split (%)</Label>
                <Input
                  type="number"
                  value={one.profit_split}
                  onChange={(e) => updateOneStep({ profit_split: Number(e.target.value) })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-1.5"
                />
              </div>
              <div>
                <Label>Breach Handling Policy</Label>
                <select
                  value={one.breach_policy || "close_all_and_fail"}
                  onChange={(e) => updateOneStep({ breach_policy: e.target.value })}
                  className="input-dark mt-1.5"
                >
                  <option value="close_all_and_fail">
                    Cancel pending + Close all positions + Fail
                  </option>
                  <option value="cancel_and_fail">Cancel pending orders + Fail</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card-panel overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-display text-xl">1-Step Challenge Pricing Tiers (INR)</h3>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  Individual pricing for ₹1,00,000 (₹2,999 starting) through ₹10,00,000.
                </p>
              </div>
              <button
                type="button"
                onClick={saveConfig}
                disabled={saving || loadingCfg}
                className="btn-amber rounded-full px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-1.5"
                data-testid="save-one-step-config"
              >
                <Save size={14} /> {saving ? "Saving…" : "Save 1-Step Config"}
              </button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border)]">
                  <TableHead>Account Size</TableHead>
                  <TableHead>Challenge Fee (₹)</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Public</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {one.tiers.map((tier, idx) => (
                  <TableRow key={tier.size} className="border-[var(--border)]">
                    <TableCell className="font-mono font-semibold text-white">
                      {formatINR(tier.size)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={tier.price}
                        onChange={(e) => updateOneStepTier(idx, { price: Number(e.target.value) })}
                        className="bg-[var(--bg-1)] border-[var(--border-hi)] w-40 font-mono"
                        data-testid={`one-step-price-${tier.size}`}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={Boolean(tier.enabled)}
                        onChange={(e) => updateOneStepTier(idx, { enabled: e.target.checked })}
                        className="accent-[var(--accent)]"
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={Boolean(tier.public_visible)}
                        onChange={(e) =>
                          updateOneStepTier(idx, { public_visible: e.target.checked })
                        }
                        className="accent-[var(--accent)]"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: ACCOUNTS & LIVE RISK */}
      {tab === "accounts" && (
        <div className="space-y-5">
          <div className="card-panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-2)]"
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search account # or email…"
                  className="input-dark !pl-8 !py-1.5 !w-56 text-xs"
                />
              </div>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="input-dark !w-auto !py-1.5 !px-3 text-xs"
              >
                <option value="non_classic">Instant &amp; 1-Step Only</option>
                <option value={PRODUCT_TYPES.INSTANT}>Instant Funding</option>
                <option value={PRODUCT_TYPES.ONE_STEP}>1-Step Challenge</option>
                <option value={PRODUCT_TYPES.ONE_STEP_FUNDED}>1-Step Funded</option>
                <option value={PRODUCT_TYPES.CLASSIC}>Classic IndiFunded</option>
                <option value="all">All Products</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-dark !w-auto !py-1.5 !px-3 text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="funded">Funded</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed / Breached</option>
              </select>
            </div>
            <button
              type="button"
              onClick={loadAccounts}
              disabled={loadingAccts}
              className="btn-ghost rounded-lg px-3 py-1.5 text-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={loadingAccts ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          <div className="card-panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border)]">
                  <TableHead>Account / Trader</TableHead>
                  <TableHead>Product / Mode</TableHead>
                  <TableHead>Equity / Capital</TableHead>
                  <TableHead>Daily Floor</TableHead>
                  <TableHead>Trailing / Max Floor</TableHead>
                  <TableHead>Days / Buffer / Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.length ? (
                  filteredAccounts.map((a) => {
                    const pType = getAccountProductType(a);
                    const cap = Number(a.starting_capital || 0);
                    const eq = Number(a.current_equity ?? a.balance ?? cap);
                    return (
                      <TableRow key={a.id} className="border-[var(--border)] tabular-nums text-xs">
                        <TableCell>
                          <div className="font-mono font-semibold text-white">
                            {a.account_number || a.id}
                          </div>
                          <div className="text-[11px] text-[var(--muted)]">{a.user_email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-white">{productBadgeLabel(a)}</div>
                          <div className="text-[11px] text-[var(--muted-2)]">
                            {a.profit_split ?? 70}% split
                            {pType === PRODUCT_TYPES.INSTANT
                              ? ` · ${a.payout_cycle || "biweekly"}`
                              : ""}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-white font-semibold">{formatINR(eq)}</div>
                          <div className="text-[11px] text-[var(--muted-2)]">
                            Cap {formatINR(cap)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-white">
                            {formatINR(
                              a.daily_loss_floor ?? cap * (1 - (a.daily_loss_limit_pct || 3) / 100),
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--muted-2)]">
                            Loss {formatINR(a.daily_loss || 0)} ({a.daily_loss_limit_pct}%)
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-white">
                            {formatINR(
                              a.trailing_drawdown_floor ??
                                cap * (1 - (a.max_loss_limit || 5) / 100),
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--muted-2)]">
                            Peak{" "}
                            {formatINR(
                              a.drawdown_mode === "eod"
                                ? (a.eod_high_watermark ?? cap)
                                : (a.highest_recorded_equity ?? cap),
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {pType === PRODUCT_TYPES.INSTANT ? (
                            <div>
                              <div className="text-white">
                                Buffer {a.buffer_pct ?? 3}% (
                                {a.buffer_satisfied ? "Cleared" : "Building"})
                              </div>
                              <div className="text-[11px] text-[var(--emerald)]">
                                Withdrawable {formatINR(a.withdrawable_profit || 0)}
                              </div>
                            </div>
                          ) : pType === PRODUCT_TYPES.ONE_STEP ? (
                            <div>
                              <div className="text-white">
                                {Number(a.profit_target_progress_pct || 0).toFixed(1)}% of{" "}
                                {a.profit_target_pct}%
                              </div>
                              <div className="text-[11px] text-[var(--muted-2)]">
                                Days {a.trading_days_done || 0} / {a.min_trading_days || 3} · ∞ time
                              </div>
                            </div>
                          ) : (
                            <div className="text-[var(--muted)]">Classic rules</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={a.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() => openHistory(a.id)}
                            className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs inline-flex items-center gap-1"
                            data-testid={`inspect-account-${a.id}`}
                          >
                            <Eye size={12} /> History
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-[var(--muted)]">
                      No matching funding accounts found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 4: BREACHES & PASSED */}
      {tab === "audit" && (
        <div className="space-y-8">
          <div className="card-panel overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-[var(--rose)]" />
                <h2 className="font-display text-xl">Automated Loss-Limit Breaches</h2>
              </div>
              <span className="text-xs font-mono text-[var(--muted-2)]">
                {(acctData.breaches || []).length} record(s)
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border)]">
                  <TableHead>Time (UTC)</TableHead>
                  <TableHead>Account / Email</TableHead>
                  <TableHead>Code &amp; Reason</TableHead>
                  <TableHead>Equity vs Floor</TableHead>
                  <TableHead>Actions Taken</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(acctData.breaches || []).length ? (
                  acctData.breaches.map((b) => (
                    <TableRow key={b.id} className="border-[var(--border)] text-xs tabular-nums">
                      <TableCell className="font-mono text-[var(--muted)] whitespace-nowrap">
                        {String(b.breached_at || b.created_at || "")
                          .slice(0, 19)
                          .replace("T", " ")}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono font-semibold text-white">{b.account_number}</div>
                        <div className="text-[11px] text-[var(--muted)]">{b.user_email}</div>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 mr-2">
                          {b.breach_code}
                        </span>
                        <span className="text-[var(--muted)]">{b.breach_reason}</span>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-rose-300">
                          Eq {formatINR(b.equity_at_breach)}
                        </div>
                        <div className="text-[11px] text-[var(--muted-2)]">
                          Floor {formatINR(b.trailing_drawdown_floor)} · Final{" "}
                          {formatINR(b.final_balance)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-white">
                          Cancelled: {b.cancelled_orders_count || 0} orders
                        </div>
                        <div className="text-[11px] text-[var(--muted-2)]">
                          Closed: {b.closed_positions_count || 0} positions
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => openHistory(b.account_id)}
                          className="btn-ghost rounded-lg px-2.5 py-1 text-xs inline-flex items-center gap-1"
                        >
                          <Eye size={12} /> Inspect
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-[var(--muted)]">
                      No risk breaches recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="card-panel overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[var(--emerald)]" />
                <h2 className="font-display text-xl">
                  Passed 1-Step Challenges &amp; Funded Activations
                </h2>
              </div>
              <span className="text-xs font-mono text-[var(--muted-2)]">
                {passedChallenges.length} passed
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--border)]">
                  <TableHead>Passed Time</TableHead>
                  <TableHead>Challenge Account</TableHead>
                  <TableHead>Equity &amp; Trading Days</TableHead>
                  <TableHead>Funded Eligibility</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {passedChallenges.length ? (
                  passedChallenges.map((a) => (
                    <TableRow key={a.id} className="border-[var(--border)] text-xs tabular-nums">
                      <TableCell className="font-mono text-[var(--muted)]">
                        {String(a.passed_at || a.updated_at || "")
                          .slice(0, 19)
                          .replace("T", " ")}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono font-semibold text-white">
                          {a.account_number || a.id}
                        </div>
                        <div className="text-[11px] text-[var(--muted)]">{a.user_email}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-mono text-[var(--emerald)] font-semibold">
                          {formatINR(a.current_equity ?? a.balance)}
                        </div>
                        <div className="text-[11px] text-[var(--muted-2)]">
                          {a.trading_days_done || 0} trading days
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-white font-medium">
                          {a.linked_funded_account_id
                            ? `Funded Linked: ${a.linked_funded_account_id}`
                            : a.funded_eligible
                              ? "Eligible for Funded Activation"
                              : "Pending"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={() => openHistory(a.id)}
                          className="btn-ghost rounded-lg px-2.5 py-1 text-xs inline-flex items-center gap-1"
                        >
                          <Eye size={12} /> Inspect
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-[var(--muted)]">
                      No passed 1-Step challenges yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Inspect History Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="bg-[var(--bg-2)] border-[var(--border)] text-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl flex items-center gap-2">
              <ShieldCheck size={20} className="text-[var(--emerald)]" />
              Account Audit &amp; Risk History
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted)]">
              Full risk metrics, breach records, order audit, and closed trade history.
            </DialogDescription>
          </DialogHeader>

          {historyLoading || !historyDetail ? (
            <div className="py-10 text-center text-sm text-[var(--muted)]">Loading history…</div>
          ) : (
            <div className="space-y-5 text-xs tabular-nums">
              <div className="p-4 rounded-xl bg-[var(--bg-1)] border border-[var(--border)] flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="font-mono font-semibold text-base text-white">
                    {historyDetail.account.account_number} · {historyDetail.account.plan_name}
                  </div>
                  <div className="text-[var(--muted)] mt-0.5">
                    {historyDetail.account.user_email} · {productBadgeLabel(historyDetail.account)}
                  </div>
                </div>
                <StatusBadge status={historyDetail.account.status} />
              </div>

              {historyDetail.account.breach_reason && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-200">
                  <div className="font-mono uppercase text-[10px] tracking-wider mb-1">
                    Confirmed Breach ({historyDetail.account.breach_code}) ·{" "}
                    {historyDetail.account.breached_at}
                  </div>
                  <div>{historyDetail.account.breach_reason}</div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ["Balance", formatINR(historyDetail.account.balance)],
                  [
                    "Equity",
                    formatINR(
                      historyDetail.account.current_equity ?? historyDetail.account.balance,
                    ),
                  ],
                  ["Daily Floor", formatINR(historyDetail.account.daily_loss_floor || 0)],
                  [
                    "Trailing/Max Floor",
                    formatINR(historyDetail.account.trailing_drawdown_floor || 0),
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="p-3 rounded-xl bg-[var(--bg-1)] border border-[var(--border)]"
                  >
                    <div className="text-[10px] font-mono uppercase text-[var(--muted-2)]">{k}</div>
                    <div className="font-mono text-sm font-semibold text-white mt-1">{v}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2">
                  Risk Events ({historyDetail.events.length})
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {historyDetail.events.length ? (
                    historyDetail.events.map((ev) => (
                      <div
                        key={ev.id}
                        className="p-3 rounded-xl bg-[var(--bg-1)] border border-[var(--border)] flex justify-between gap-3"
                      >
                        <div>
                          <div className="font-semibold text-white">{ev.title}</div>
                          <div className="text-[var(--muted)] mt-0.5">{ev.detail}</div>
                        </div>
                        <span className="font-mono text-[10px] text-[var(--muted-2)] shrink-0">
                          {String(ev.created_at || "")
                            .slice(0, 19)
                            .replace("T", " ")}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[var(--muted)] py-2">No risk events logged yet.</div>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2">
                    Recent Orders ({historyDetail.orders.length})
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {historyDetail.orders.slice(0, 10).map((o) => (
                      <div
                        key={o.id}
                        className="p-2.5 rounded-lg bg-[var(--bg-1)] border border-[var(--border)] flex justify-between"
                      >
                        <span>
                          <strong
                            className={
                              o.side === "BUY" ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                            }
                          >
                            {o.side}
                          </strong>{" "}
                          {o.symbol} × {o.qty}
                        </span>
                        <span className="font-mono text-[var(--muted)]">{o.status}</span>
                      </div>
                    ))}
                    {!historyDetail.orders.length && (
                      <div className="text-[var(--muted)]">No orders yet.</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2">
                    Closed Trades ({historyDetail.trades.length})
                  </div>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {historyDetail.trades.slice(0, 10).map((t) => (
                      <div
                        key={t.id}
                        className="p-2.5 rounded-lg bg-[var(--bg-1)] border border-[var(--border)] flex justify-between"
                      >
                        <span>
                          {t.symbol} × {t.qty}
                        </span>
                        <span
                          className={`font-mono font-semibold ${
                            Number(t.pnl || 0) >= 0 ? "text-[var(--emerald)]" : "text-[var(--rose)]"
                          }`}
                        >
                          {Number(t.pnl || 0) >= 0 ? "+" : "−"}
                          {formatINR(Math.abs(Number(t.pnl || 0)))}
                        </span>
                      </div>
                    ))}
                    {!historyDetail.trades.length && (
                      <div className="text-[var(--muted)]">No closed trades yet.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
