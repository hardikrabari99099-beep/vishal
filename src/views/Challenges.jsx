import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "@/lib/router-compat";
import { api, formatINR, formatApiError } from "../lib/api";
import { useSEO } from "../lib/useSEO";
import { useReveal } from "../lib/useReveal";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import {
  DEFAULT_FUNDING_PRODUCTS,
  PRODUCT_TYPES,
  normalizeFundingProductsConfig,
} from "../lib/funding-products";
import { DEFAULT_PLANS } from "../lib/default-plans";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { openUpiCheckout } from "../lib/razorpay";
import { buildUpiAppOptions } from "../lib/upi";
import { toast } from "sonner";
import {
  CheckCircle2,
  Rocket,
  Loader2,
  ShieldCheck,
  Sparkles,
  Tag,
  Gift,
  BookOpen,
  ArrowRight,
  Zap,
  Award,
  Clock,
  Copy,
  ChevronDown,
  Smartphone,
} from "lucide-react";

export default function Challenges() {
  const [plans, setPlans] = useState(DEFAULT_PLANS);
  const [fundingCfg, setFundingCfg] = useState(() =>
    normalizeFundingProductsConfig(DEFAULT_FUNDING_PRODUCTS),
  );
  const [programFilter, setProgramFilter] = useState("all"); // all | classic | instant_one_step | instant | one_step
  const [subType, setSubType] = useState("both"); // both | instant | one_step

  // Instant Funding configurator state
  const [instSize, setInstSize] = useState(100000);
  const [instMode, setInstMode] = useState("intraday");
  const [instCycle, setInstCycle] = useState("biweekly");

  const [buying, setBuying] = useState(null);
  const [step, setStep] = useState(1); // 1: details, 2: razorpay QR, 3: success
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    coupon_code: "",
    referral_code: "",
  });
  const [couponInfo, setCouponInfo] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qr, setQr] = useState(null);
  const [qrImgFailed, setQrImgFailed] = useState(false);
  const [qrImgProxyTried, setQrImgProxyTried] = useState(false);
  const [showUpiApps, setShowUpiApps] = useState(false);
  const [utr, setUtr] = useState("");
  const [submittingUtr, setSubmittingUtr] = useState(false);
  const pollRef = useRef(null);
  const [searchParams] = useSearchParams();
  useReveal([plans, fundingCfg, programFilter, subType]);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) setForm((prev) => ({ ...prev, referral_code: ref.toUpperCase() }));
    const prog = searchParams.get("program");
    if (prog === "classic" || prog === "all" || prog === "instant_one_step") {
      setProgramFilter(prog);
      setSubType("both");
    } else if (prog === "instant" || prog === "one_step") {
      setProgramFilter("instant_one_step");
      setSubType(prog);
    }
  }, [searchParams]);

  useSEO({
    title: "Challenge Plans, Instant Funding & 1-Step Challenge — IndiFunded",
    description:
      "Choose Classic IndiFunded challenges, Instant Funding (zero evaluation, Intraday/EOD trailing drawdown), or the 1-Step Challenge (10% target, no time limit). Pay via UPI.",
    path: "/challenges",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "IndiFunded Funding Programs",
      itemListElement: plans.map((p, i) => ({
        "@type": "Product",
        position: i + 1,
        name: `${p.name} Challenge — ${p.account_size} INR funded account`,
        description: p.description,
        offers: {
          "@type": "Offer",
          price: p.challenge_fee,
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
      })),
    },
  });

  const { syncVersion } = useSettings();

  useEffect(() => {
    api
      .get("/plans")
      .then((r) => {
        if (Array.isArray(r.data) && r.data.length > 0) setPlans(r.data);
      })
      .catch(() => {});
    api
      .get("/funding-products")
      .then((r) => {
        const normalized = normalizeFundingProductsConfig(r.data);
        setFundingCfg(normalized);
        setInstMode(
          normalized.instant_funding.default_drawdown_mode || "intraday",
        );
        const firstVisible = normalized.instant_funding.tiers.find(
          (t) => t.enabled && t.public_visible,
        );
        if (firstVisible) {
          setInstSize((prev) => {
            const exists = normalized.instant_funding.tiers.some(
              (t) => t.enabled && t.public_visible && t.size === prev,
            );
            return exists ? prev : firstVisible.size;
          });
        }
      })
      .catch(() => {});
  }, [syncVersion]);

  const { user } = useAuth();
  const nav = useNavigate();

  const instProd = fundingCfg.instant_funding;
  const oneProd = fundingCfg.one_step;

  const instTiers = useMemo(
    () => (instProd.tiers || []).filter((t) => t.enabled && t.public_visible),
    [instProd.tiers],
  );
  const oneTiers = useMemo(
    () => (oneProd.tiers || []).filter((t) => t.enabled && t.public_visible),
    [oneProd.tiers],
  );

  const selectedInstTier = useMemo(
    () => instTiers.find((t) => t.size === instSize) || instTiers[0] || null,
    [instTiers, instSize],
  );

  const instPrice = selectedInstTier
    ? instMode === "eod"
      ? selectedInstTier.eod_price
      : selectedInstTier.intraday_price
    : 0;
  const instSplit =
    instCycle === "monthly"
      ? instProd.payout_cycles.monthly.profit_split
      : instProd.payout_cycles.biweekly.profit_split;

  const showInstant =
    instProd.enabled && instProd.public_visible && instTiers.length > 0;
  const showOneStep =
    oneProd.enabled && oneProd.public_visible && oneTiers.length > 0;

  const openBuy = (p) => {
    if (!user) {
      toast.error("Please sign in to buy a challenge account", {
        position: "bottom-center",
        duration: 4500,
      });
      nav("/login?next=/challenges");
      return;
    }
    setBuying(p);
    setStep(1);
    setCouponInfo(null);
    setQr(null);
    setQrImgFailed(false);
    setQrImgProxyTried(false);
    setUtr("");
    setForm((prev) => ({
      customer_name: user.name || "",
      customer_email: user.email || "",
      customer_phone: user.phone || "",
      coupon_code: "",
      referral_code: prev.referral_code || "",
    }));
  };

  const openInstantBuy = () => {
    if (!selectedInstTier) return;
    openBuy({
      id: `instant-${selectedInstTier.size}-${instMode}-${instCycle}`,
      name: `Instant Funding ${formatINR(selectedInstTier.size)} (${instMode === "eod" ? "EOD" : "Intraday"})`,
      account_size: selectedInstTier.size,
      challenge_fee: instPrice,
      product_type: PRODUCT_TYPES.INSTANT,
      drawdown_mode: instMode,
      payout_cycle: instCycle,
    });
  };

  const openOneStepBuy = (tier) => {
    openBuy({
      id: `one-step-${tier.size}`,
      name: `1-Step Challenge ${formatINR(tier.size)}`,
      account_size: tier.size,
      challenge_fee: tier.price,
      product_type: PRODUCT_TYPES.ONE_STEP,
    });
  };

  const buildOrderPayload = () => {
    if (!buying) return {};
    const productPart =
      buying.product_type && buying.product_type !== PRODUCT_TYPES.CLASSIC
        ? {
            product_type: buying.product_type,
            account_size: buying.account_size,
            drawdown_mode: buying.drawdown_mode,
            payout_cycle: buying.payout_cycle,
          }
        : { plan_id: buying.id };
    return {
      ...productPart,
      customer_name: form.customer_name,
      customer_email: form.customer_email,
      customer_phone: form.customer_phone,
      coupon_code: couponInfo ? form.coupon_code.trim() : null,
      referral_code: form.referral_code.trim() || null,
    };
  };

  const applyCoupon = async () => {
    if (!form.coupon_code.trim()) {
      toast.error("Enter a coupon code");
      return;
    }
    try {
      setCouponBusy(true);
      const { data } = await api.post("/coupons/validate", {
        code: form.coupon_code.trim(),
        amount: buying.challenge_fee,
      });
      setCouponInfo(data);
      toast.success(`Coupon applied — ${data.discount_percent}% off`);
    } catch (e) {
      setCouponInfo(null);
      toast.error(formatApiError(e.response?.data?.detail) || "Invalid coupon");
    } finally {
      setCouponBusy(false);
    }
  };
  const removeCoupon = () => {
    setCouponInfo(null);
    setForm({ ...form, coupon_code: "" });
  };

  const proceedToPayment = async () => {
    if (!form.customer_name || !form.customer_email || !form.customer_phone) {
      toast.error("Please fill name, email, and phone");
      return;
    }
    try {
      setLoading(true);
      setUtr("");
      setQrImgFailed(false);
      setQrImgProxyTried(false);
      setShowUpiApps(false);
      const { data } = await api.post(
        "/orders/razorpay/create",
        buildOrderPayload(),
      );
      setQr(data);
      setStep(2);
    } catch (e) {
      toast.error(
        formatApiError(e.response?.data?.detail) ||
          "Could not start payment. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const submitUtrPayment = async (e) => {
    e?.preventDefault?.();
    const cleanUtr = utr.trim();
    if (cleanUtr.length < 6) {
      toast.error("Please enter a valid UPI UTR / transaction reference");
      return;
    }
    try {
      setSubmittingUtr(true);
      await api.post("/orders/upi", {
        ...buildOrderPayload(),
        order_id: qr?.order_id,
        utr: cleanUtr,
      });
      clearInterval(pollRef.current);
      setQr((prev) => ({
        ...(prev || {}),
        utr: cleanUtr,
        utr_submitted: true,
      }));
      setStep(3);
      toast.success("UTR submitted for verification!");
    } catch (e) {
      toast.error(
        formatApiError(e.response?.data?.detail) ||
          "Could not submit UTR. Please try again.",
      );
    } finally {
      setSubmittingUtr(false);
    }
  };

  useEffect(() => {
    if (step !== 2 || !qr?.order_id) return undefined;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(
          `/orders/razorpay/status/${qr.order_id}`,
        );
        if (data.paid) {
          clearInterval(pollRef.current);
          setStep(3);
        } else if (data.upi_link && data.upi_link !== qr.upi_link) {
          setQr((prev) =>
            prev
              ? {
                  ...prev,
                  upi_link: data.upi_link,
                  upi_link_is_razorpay: Boolean(data.upi_link_is_razorpay),
                }
              : prev,
          );
        }
      } catch (_e) {
        /* keep polling */
      }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [step, qr]);

  useEffect(() => {
    if (!buying && pollRef.current) clearInterval(pollRef.current);
  }, [buying]);

  return (
    <div className="container-xl pt-16 pb-24">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="chip mb-3">Challenges</div>
          <h1
            className="font-display text-3xl sm:text-4xl md:text-6xl max-w-3xl"
            data-testid="challenges-title"
          >
            Pick your challenge.
          </h1>
          <p className="text-[var(--muted)] mt-3 max-w-xl">
            Two funding tracks: IndiFunded Challenges or Instant / 1-Step. Pay
            in INR via UPI.
          </p>
        </div>
        <Link
          to="/rules"
          className="btn-ghost rounded-full px-5 py-3 text-sm inline-flex items-center gap-2 shrink-0 self-start md:self-auto border border-[var(--border-hi)] hover:border-[var(--accent)]"
          data-testid="challenges-view-rules-btn"
        >
          <BookOpen size={15} className="text-[var(--accent)]" /> View Rules{" "}
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Two Main Challenge Type Switcher */}
      {(showInstant || showOneStep) && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-8">
          <div className="flex flex-wrap gap-2" data-testid="program-switcher">
            {[
              ["classic", "IndiFunded Challenges"],
              ["all", "All Programs"],
              ["instant_one_step", "Instant / 1-Step"],
            ].map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setProgramFilter(k);
                  if (k !== "instant_one_step") setSubType("both");
                }}
                data-testid={`program-tab-${k}`}
                className={`px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider border transition ${
                  programFilter === k
                    ? "bg-[var(--accent)] border-[var(--accent)] text-white"
                    : "bg-[var(--bg-1)] border-[var(--border-hi)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {programFilter === "instant_one_step" &&
            showInstant &&
            showOneStep && (
              <div
                className="seg"
                role="tablist"
                aria-label="Instant or 1-Step filter"
              >
                {[
                  ["both", "Both"],
                  ["instant", "Instant"],
                  ["one_step", "1-Step"],
                ].map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSubType(k)}
                    className={`!px-3 !py-1.5 !text-xs ${subType === k ? "is-on" : ""}`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}
        </div>
      )}

      {/* SECTION 1 (PRIMARY): INDIFUNDED CHALLENGES */}
      {(programFilter === "all" || programFilter === "classic") && (
        <section className="mt-10" data-testid="classic-plans-section">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-[var(--emerald)]">
                <Sparkles size={13} /> Track 01 · Flagship Program
              </div>
              <h2 className="font-display text-2xl sm:text-3xl mt-1">
                IndiFunded Challenges
              </h2>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5 pt-2">
            {plans.map((p, i) => (
              <div
                key={p.id}
                className={`card-panel hover-lift p-8 pt-10 relative ${p.popular ? "glow-border" : ""}`}
                data-testid={`plan-card-${i}`}
              >
                {p.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 md:left-7 md:translate-x-0 text-[10px] tracking-widest font-mono uppercase px-3 py-1 rounded-full bg-[var(--accent)] text-white inline-flex items-center gap-1 shadow-lg whitespace-nowrap z-10">
                    <Sparkles size={10} /> Best Value
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[var(--muted-2)] font-mono">
                      {p.name}
                    </div>
                    <div className="font-display text-4xl mt-2">
                      {formatINR(p.account_size)}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-1">
                      Funded Account
                    </div>
                  </div>
                  <Rocket className="text-[var(--accent)]" size={20} />
                </div>
                <p className="text-sm text-[var(--muted)] mt-4 leading-relaxed">
                  {p.description}
                </p>
                <div className="mt-6 pt-6 border-t border-[var(--border)] space-y-2.5">
                  {p.features?.map((f, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-sm text-[var(--text)]/90"
                    >
                      <CheckCircle2
                        size={14}
                        className="mt-1 text-[var(--emerald)] shrink-0"
                      />
                      {f}
                    </div>
                  ))}
                  <div className="grid grid-cols-2 gap-3 pt-3 text-xs">
                    <div>
                      <div className="text-[var(--muted-2)]">Profit Target</div>
                      <div className="text-[var(--text)] font-mono">
                        {p.profit_target_points} pts
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--muted-2)]">Max Loss</div>
                      <div className="text-[var(--text)] font-mono">
                        {p.max_loss_limit}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--muted-2)]">Min Days</div>
                      <div className="text-[var(--text)] font-mono">
                        {p.min_trading_days}
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--muted-2)]">Total Days</div>
                      <div className="text-[var(--text)] font-mono">
                        {p.total_trading_days}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-end justify-between mt-8">
                  <div>
                    <div className="text-xs text-[var(--muted-2)]">
                      Challenge Fee
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <div className="font-display text-3xl text-[var(--text)]">
                        {formatINR(p.challenge_fee)}
                      </div>
                      {p.original_price &&
                        p.original_price > p.challenge_fee && (
                          <>
                            <div className="text-sm text-[var(--muted-2)] line-through">
                              {formatINR(p.original_price)}
                            </div>
                            <div className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(41,211,154,0.15)] text-[var(--accent)]">
                              -
                              {Math.round(
                                ((p.original_price - p.challenge_fee) /
                                  p.original_price) *
                                  100,
                              )}
                              %
                            </div>
                          </>
                        )}
                    </div>
                  </div>
                  <button
                    onClick={() => openBuy(p)}
                    className="btn-amber rounded-full px-6 py-3 text-sm"
                    data-testid={`plan-buy-${i}`}
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 2: INSTANT FUNDING */}
      {showInstant &&
        (programFilter === "all" ||
          (programFilter === "instant_one_step" &&
            (subType === "both" || subType === "instant"))) && (
          <section className="mt-12" data-testid="instant-funding-section">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-[var(--muted-2)]">
                  <Zap size={13} className="text-[var(--emerald)]" /> Track 02 ·
                  Instant / 1-Step · Immediate Funded
                </div>
                <h2 className="font-display text-2xl sm:text-3xl mt-1">
                  {instProd.name}
                </h2>
              </div>
            </div>

            <div className="card-panel glow-border p-6 md:p-8 space-y-6">
              {/* Step 1: Capital Size */}
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2.5">
                  1. Choose Funded Account Capital
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {instTiers.map((t) => {
                    const selected = selectedInstTier?.size === t.size;
                    const p =
                      instMode === "eod" ? t.eod_price : t.intraday_price;
                    return (
                      <button
                        key={t.size}
                        type="button"
                        onClick={() => setInstSize(t.size)}
                        data-testid={`instant-size-${t.size}`}
                        className={`p-3.5 rounded-xl border text-left transition tabular-nums ${
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)]/50"
                        }`}
                      >
                        <div className="font-display text-lg text-[var(--text)]">
                          {formatINR(t.size)}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--emerald)] mt-1">
                          Fee {formatINR(p)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2 & 3: Drawdown Mode + Payout Cycle */}
              <div className="grid md:grid-cols-2 gap-5">
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2.5">
                    2. Choose Trailing Drawdown Option (
                    {instProd.trailing_drawdown_pct}% Trailing)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        id: "intraday",
                        title: "Intraday Trailing",
                        desc: "Trails live intraday peak equity continuously.",
                        price: selectedInstTier?.intraday_price,
                      },
                      {
                        id: "eod",
                        title: "EOD Trailing",
                        desc: "Floor updates strictly at end-of-day settled close.",
                        price: selectedInstTier?.eod_price,
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setInstMode(m.id)}
                        data-testid={`instant-mode-${m.id}`}
                        className={`p-4 rounded-xl border text-left transition tabular-nums ${
                          instMode === m.id
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)]/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-[var(--text)]">
                            {m.title}
                          </span>
                          <span className="font-mono text-xs text-[var(--emerald)]">
                            {formatINR(m.price || 0)}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-1.5 leading-relaxed">
                          {m.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)] mb-2.5">
                    3. Choose Payout Schedule &amp; Profit Split
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      {
                        id: "biweekly",
                        title: "Bi-Weekly Payout",
                        split: instProd.payout_cycles.biweekly.profit_split,
                        desc: `Every ${instProd.payout_cycles.biweekly.interval_days} days`,
                      },
                      {
                        id: "monthly",
                        title: "Monthly Payout",
                        split: instProd.payout_cycles.monthly.profit_split,
                        desc: `Every ${instProd.payout_cycles.monthly.interval_days} days`,
                      },
                    ].map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setInstCycle(c.id)}
                        data-testid={`instant-cycle-${c.id}`}
                        className={`p-4 rounded-xl border text-left transition tabular-nums ${
                          instCycle === c.id
                            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)]/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-[var(--text)]">
                            {c.title}
                          </span>
                          <span className="font-mono text-xs text-[var(--emerald)]">
                            {c.split}%
                          </span>
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-1.5">
                          {c.desc}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Instant Rules Summary + Buy CTA */}
              <div className="pt-5 border-t border-[var(--border)] flex flex-col lg:flex-row lg:items-center justify-between gap-6 tabular-nums">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 text-xs">
                  <div>
                    <div className="text-[var(--muted-2)]">
                      Daily Loss Limit
                    </div>
                    <div className="font-mono text-[var(--text)] font-semibold mt-0.5">
                      {instProd.daily_loss_limit_pct}% Max Daily
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--muted-2)]">
                      Trailing Drawdown
                    </div>
                    <div className="font-mono text-[var(--text)] font-semibold mt-0.5">
                      {instProd.trailing_drawdown_pct}% (
                      {instMode.toUpperCase()})
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--muted-2)]">Profit Buffer</div>
                    <div className="font-mono text-[var(--text)] font-semibold mt-0.5">
                      First {instProd.buffer_pct}% Reserved
                    </div>
                  </div>
                  <div>
                    <div className="text-[var(--muted-2)]">
                      Evaluation Target
                    </div>
                    <div className="font-mono text-[var(--emerald)] font-semibold mt-0.5">
                      None · Live Immediately
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between lg:justify-end gap-5 shrink-0">
                  <div>
                    <div className="text-[11px] font-mono uppercase text-[var(--muted-2)]">
                      Instant Activation · {instSplit}% Split
                    </div>
                    <div
                      className="font-display text-3xl text-[var(--text)]"
                      data-testid="instant-selected-price"
                    >
                      {formatINR(instPrice)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openInstantBuy}
                    className="btn-amber rounded-full px-6 py-3 text-sm font-semibold"
                    data-testid="instant-buy-btn"
                  >
                    Get Funded Now
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

      {/* SECTION 3: 1-STEP CHALLENGE */}
      {showOneStep &&
        (programFilter === "all" ||
          (programFilter === "instant_one_step" &&
            (subType === "both" || subType === "one_step"))) && (
          <section className="mt-12" data-testid="one-step-section">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-[var(--accent)]">
                  <Award size={13} /> Track 02 · Instant / 1-Step ·{" "}
                  {oneProd.profit_target_pct}% Target · No Time Limit
                </div>
                <h2 className="font-display text-2xl sm:text-3xl mt-1">
                  {oneProd.name}
                </h2>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {oneTiers.map((tier) => (
                <div
                  key={tier.size}
                  className="card-panel hover-lift p-7 flex flex-col justify-between tabular-nums"
                  data-testid={`one-step-card-${tier.size}`}
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs uppercase tracking-wider text-[var(--muted-2)] font-mono">
                          1-Step Challenge
                        </div>
                        <div className="font-display text-3xl mt-1.5">
                          {formatINR(tier.size)}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-mono uppercase bg-[var(--accent-soft)] text-[var(--emerald)]">
                        {oneProd.profit_split}% Split
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-5 mt-5 border-t border-[var(--border)] text-xs">
                      <div>
                        <div className="text-[var(--muted-2)]">
                          Profit Target
                        </div>
                        <div className="text-[var(--text)] font-mono">
                          {oneProd.profit_target_pct}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--muted-2)]">
                          Daily Loss Limit
                        </div>
                        <div className="text-[var(--text)] font-mono">
                          {oneProd.daily_loss_limit_pct}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--muted-2)]">
                          Max Overall Loss
                        </div>
                        <div className="text-[var(--text)] font-mono">
                          {oneProd.overall_loss_limit_pct}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[var(--muted-2)]">
                          Min Trading Days
                        </div>
                        <div className="text-[var(--text)] font-mono">
                          {oneProd.min_trading_days} Days
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--emerald)]">
                      <Clock size={12} /> No maximum time limit · Auto-funded
                      upon pass
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-7 pt-4 border-t border-[var(--border)]">
                    <div>
                      <div className="text-xs text-[var(--muted-2)]">
                        1-Step Fee
                      </div>
                      <div className="font-display text-2xl text-[var(--text)] mt-0.5">
                        {formatINR(tier.price)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openOneStepBuy(tier)}
                      className="btn-amber rounded-full px-5 py-2.5 text-xs font-semibold"
                      data-testid={`one-step-buy-${tier.size}`}
                    >
                      Buy Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      {/* CHECKOUT DIALOG */}
      <Dialog open={!!buying} onOpenChange={(o) => !o && setBuying(null)}>
        <DialogContent
          className="bg-[var(--bg-2)] border-[var(--border)] text-white max-w-xl max-h-[90vh] overflow-y-auto"
          data-testid="checkout-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {step === 1 && `Checkout — ${buying?.name}`}
              {step === 2 && "Scan & Pay"}
              {step === 3 && "Payment successful"}
            </DialogTitle>
          </DialogHeader>

          {step === 1 && (
            <div className="space-y-4">
              <div className="card-panel p-4 flex justify-between">
                <div>
                  <div className="text-xs text-[var(--muted-2)]">
                    Account Size
                  </div>
                  <div className="font-display text-xl">
                    {buying && formatINR(buying.account_size)}
                  </div>
                  {buying?.product_type === PRODUCT_TYPES.INSTANT && (
                    <div className="text-[11px] font-mono text-[var(--emerald)] mt-0.5">
                      {buying.drawdown_mode?.toUpperCase()} DD ·{" "}
                      {buying.payout_cycle} payout
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--muted-2)]">Fee</div>
                  <div className="font-display text-xl text-[var(--accent)]">
                    {couponInfo
                      ? formatINR(couponInfo.final_amount)
                      : buying && formatINR(buying.challenge_fee)}
                  </div>
                  {couponInfo && (
                    <div className="text-[10px] text-[var(--muted-2)] line-through mt-0.5">
                      {buying && formatINR(buying.challenge_fee)}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Full Name</Label>
                <Input
                  data-testid="checkout-name"
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm({ ...form, customer_name: e.target.value })
                  }
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  data-testid="checkout-email"
                  type="email"
                  value={form.customer_email}
                  onChange={(e) =>
                    setForm({ ...form, customer_email: e.target.value })
                  }
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                />
              </div>
              <div>
                <Label>Phone (WhatsApp)</Label>
                <Input
                  data-testid="checkout-phone"
                  value={form.customer_phone}
                  onChange={(e) =>
                    setForm({ ...form, customer_phone: e.target.value })
                  }
                  placeholder="+91 "
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                />
              </div>

              {/* COUPON */}
              <div>
                <Label className="flex items-center gap-1.5">
                  <Tag size={12} /> Coupon Code{" "}
                  <span className="text-[var(--muted-2)] text-xs">
                    (optional)
                  </span>
                </Label>
                {couponInfo ? (
                  <div
                    className="mt-2 flex items-center gap-2 p-3 rounded-lg border border-[var(--emerald)]/40 bg-[rgba(41,211,154,0.08)]"
                    data-testid="coupon-applied"
                  >
                    <CheckCircle2
                      size={16}
                      className="text-[var(--emerald)] shrink-0"
                    />
                    <div className="flex-1 text-sm">
                      <div className="text-white font-mono">
                        {form.coupon_code.toUpperCase()}
                      </div>
                      <div className="text-xs text-[var(--muted-2)]">
                        -{couponInfo.discount_percent}% · You save{" "}
                        {formatINR(couponInfo.discount_amount)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="text-xs text-[var(--muted-2)] hover:text-white"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <Input
                      data-testid="coupon-input"
                      value={form.coupon_code}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          coupon_code: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="e.g. LAUNCH20"
                      className="bg-[var(--bg-1)] border-[var(--border-hi)] font-mono tracking-wider flex-1"
                    />
                    <button
                      type="button"
                      onClick={applyCoupon}
                      disabled={couponBusy}
                      className="btn-ghost rounded-full px-4 text-xs whitespace-nowrap"
                      data-testid="coupon-apply-btn"
                    >
                      {couponBusy ? "…" : "Apply"}
                    </button>
                  </div>
                )}
              </div>

              {/* REFERRAL */}
              <div>
                <Label className="flex items-center gap-1.5">
                  <Gift size={12} /> Referral Code{" "}
                  <span className="text-[var(--muted-2)] text-xs">
                    (optional)
                  </span>
                </Label>
                <Input
                  data-testid="referral-input"
                  value={form.referral_code}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      referral_code: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="Friend's referral code"
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2 font-mono tracking-wider"
                />
              </div>

              <button
                onClick={proceedToPayment}
                disabled={loading}
                className="btn-amber rounded-full px-6 py-3 text-sm w-full inline-flex items-center justify-center gap-2"
                data-testid="checkout-continue-btn"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={16} /> Generating
                    QR…
                  </>
                ) : (
                  "Continue to Payment"
                )}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div
                className="rounded-2xl overflow-hidden border border-[var(--border-hi)] bg-[var(--bg-1)] p-6"
                data-testid="razorpay-qr-box"
              >
                <div className="text-center text-xs uppercase tracking-widest font-mono text-[var(--muted-2)] mb-4">
                  Scan &amp; pay with any UPI app
                </div>

                <div className="bg-white rounded-xl p-4 w-fit mx-auto">
                  {(() => {
                    const proxySrc =
                      qr?.qr_proxy_url ||
                      (qr?.order_id
                        ? `/api/orders/razorpay/qr-image/${qr.order_id}`
                        : "");
                    const activeQrSrc = qrImgProxyTried
                      ? proxySrc
                      : qr?.qr_data_url || qr?.qr_image || "";
                    const externalQrUrl =
                      qr?.qr_external_url ||
                      (typeof qr?.qr_image === "string" &&
                      qr.qr_image.startsWith("https://")
                        ? qr.qr_image
                        : "");
                    if (activeQrSrc && !qrImgFailed) {
                      return (
                        <img
                          src={activeQrSrc}
                          alt="Razorpay UPI QR"
                          onError={() => {
                            if (
                              !qrImgProxyTried &&
                              proxySrc &&
                              activeQrSrc !== proxySrc
                            ) {
                              setQrImgProxyTried(true);
                            } else {
                              setQrImgFailed(true);
                            }
                          }}
                          className="w-80 h-80 sm:w-[26rem] sm:h-[26rem] object-contain"
                          data-testid="razorpay-qr-img"
                        />
                      );
                    }
                    return (
                      <div className="w-80 h-80 sm:w-[26rem] sm:h-[26rem] grid place-items-center text-center px-6 text-slate-700">
                        {qrImgFailed ? (
                          <div className="space-y-3 text-xs">
                            <div className="font-semibold text-slate-900">
                              QR image could not be loaded
                            </div>
                            <div>
                              Use &ldquo;Pay with your UPI app&rdquo; below to
                              complete payment securely.
                            </div>
                            {externalQrUrl && (
                              <a
                                href={externalQrUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block rounded-full bg-slate-900 text-white px-4 py-2 font-semibold hover:bg-slate-800"
                              >
                                Open Razorpay QR Page
                              </a>
                            )}
                          </div>
                        ) : (
                          <Loader2
                            className="animate-spin text-black"
                            size={32}
                          />
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="bg-[var(--bg-2)] rounded-xl px-5 py-5 text-center mt-4">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono mb-1">
                    Amount to Pay
                  </div>
                  <div className="font-display text-3xl text-[var(--accent)]">
                    {formatINR(
                      qr?.amount ??
                        (couponInfo
                          ? couponInfo.final_amount
                          : buying?.challenge_fee),
                    )}
                  </div>
                  {couponInfo && (
                    <div className="text-[10px] text-[var(--muted-2)] mt-1">
                      Coupon {form.coupon_code} applied · saved{" "}
                      {formatINR(couponInfo.discount_amount)}
                    </div>
                  )}
                  {qr?.upi_id && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs font-mono text-[var(--muted)]">
                      <span>UPI ID:</span>
                      <span className="text-white">{qr.upi_id}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            ?.writeText(qr.upi_id)
                            .catch(() => {});
                          toast.success("UPI ID copied");
                        }}
                        className="text-[var(--accent)] hover:opacity-80 inline-flex items-center gap-1"
                        aria-label="Copy UPI ID"
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                  )}
                </div>

                {(qr?.payment_mode !== "upi_qr" || qr?.razorpay_order_id) && (
                  <div
                    className="mt-4 flex items-center justify-center gap-2 text-[12px] text-[var(--muted)]"
                    data-testid="razorpay-waiting"
                  >
                    <Loader2
                      className="animate-spin text-[var(--accent)]"
                      size={14}
                    />
                    <span>Waiting for payment… confirms automatically.</span>
                  </div>
                )}

                {qr?.qr_image &&
                  (() => {
                    const payableAmount =
                      qr?.amount ??
                      (couponInfo
                        ? couponInfo.final_amount
                        : buying?.challenge_fee);
                    const upiOptions = buildUpiAppOptions({
                      upiLink: qr?.upi_link || "",
                      upiId: qr?.upi_id || "",
                      brandName: "IndiFunded",
                      amount: payableAmount,
                      note: buying?.name
                        ? `IndiFunded ${buying.name}`
                        : "IndiFunded Challenge",
                    });
                    const hasDirectUpi = upiOptions.upiUrl !== "#";
                    return (
                      <div
                        className="mt-4 space-y-3"
                        data-testid="upi-app-buttons"
                      >
                        <button
                          type="button"
                          onClick={() => setShowUpiApps((v) => !v)}
                          aria-expanded={showUpiApps}
                          className="btn-amber w-full rounded-full px-6 py-3.5 text-sm font-semibold inline-flex items-center justify-center gap-2"
                          data-testid="pay-with-upi"
                        >
                          <Smartphone size={16} />
                          <span>Continue with UPI</span>
                          <ChevronDown
                            size={16}
                            className={`transition-transform ${showUpiApps ? "rotate-180" : ""}`}
                          />
                        </button>

                        {showUpiApps && (
                          <div
                            className="rounded-xl border border-[var(--border-hi)] bg-[var(--bg-2)] p-3.5 space-y-3"
                            data-testid="upi-app-chooser"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-white">
                                Select UPI app to pay directly
                              </span>
                              <span className="font-mono font-semibold text-[var(--accent)]">
                                {formatINR(payableAmount)}
                              </span>
                            </div>

                            {hasDirectUpi && (
                              <div className="grid grid-cols-2 gap-2">
                                {upiOptions.apps.map((app) => (
                                  <a
                                    key={app.id}
                                    href={app.href}
                                    data-testid={`upi-app-${app.id}`}
                                    className="flex items-center gap-2.5 rounded-xl border border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)] px-3 py-2.5 transition-colors"
                                  >
                                    <span
                                      className="w-8 h-8 rounded-lg grid place-items-center text-[10px] font-bold text-white shrink-0"
                                      style={{ backgroundColor: app.color }}
                                    >
                                      {app.badge}
                                    </span>
                                    <div className="min-w-0 leading-tight">
                                      <div className="text-xs font-semibold text-white truncate">
                                        {app.name}
                                      </div>
                                      <div className="text-[10px] font-mono text-[var(--muted-2)]">
                                        Pay {formatINR(payableAmount)}
                                      </div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            )}

                            {(qr?.razorpay_configured ||
                              qr?.payment_mode !== "upi_qr") && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const co =
                                      qr?.razorpay_order_id && qr?.key_id
                                        ? {
                                            order_id: qr.order_id,
                                            razorpay_order_id:
                                              qr.razorpay_order_id,
                                            key_id: qr.key_id,
                                            amount_paise: qr.amount_paise,
                                            customer: qr.customer,
                                            description: qr.description,
                                          }
                                        : (
                                            await api.post(
                                              "/orders/razorpay/checkout-order",
                                              {
                                                ...buildOrderPayload(),
                                                order_id: qr?.order_id,
                                              },
                                            )
                                          ).data;
                                    await openUpiCheckout(co, async (rsp) => {
                                      try {
                                        await api.post(
                                          "/orders/razorpay/verify",
                                          {
                                            razorpay_order_id:
                                              rsp.razorpay_order_id,
                                            razorpay_payment_id:
                                              rsp.razorpay_payment_id,
                                            razorpay_signature:
                                              rsp.razorpay_signature,
                                          },
                                        );
                                        clearInterval(pollRef.current);
                                        setStep(3);
                                        toast.success("Payment successful!");
                                      } catch (e) {
                                        toast.error(
                                          formatApiError(
                                            e.response?.data?.detail,
                                          ) ||
                                            "Payment could not be verified. Contact support.",
                                        );
                                      }
                                    });
                                  } catch (e) {
                                    toast.error(
                                      formatApiError(
                                        e.response?.data?.detail,
                                      ) ||
                                        "Could not start UPI payment. Please try again.",
                                    );
                                  }
                                }}
                                className="btn-ghost w-full rounded-xl px-4 py-2.5 text-xs font-medium inline-flex items-center justify-center gap-2 border border-[var(--border-hi)] hover:border-[var(--accent)]"
                                data-testid="pay-with-razorpay-upi"
                              >
                                <ShieldCheck size={14} /> Open Razorpay UPI
                                Checkout
                              </button>
                            )}

                            <div className="text-[11px] text-[var(--muted-2)] text-center">
                              Tap any UPI app on mobile to open direct payment
                              for {formatINR(payableAmount)}. On desktop, scan
                              the Razorpay QR above.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {(qr?.payment_mode === "upi_qr" ||
                  (showUpiApps && qr?.upi_link_is_razorpay === false)) && (
                  <form
                    onSubmit={submitUtrPayment}
                    className="mt-5 pt-4 border-t border-[var(--border)] space-y-3"
                  >
                    <Label className="text-xs text-[var(--muted)]">
                      After paying via UPI app or QR, enter your 12-digit UPI
                      UTR / Reference Number
                    </Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        value={utr}
                        onChange={(e) => setUtr(e.target.value)}
                        placeholder="e.g. 412345678901"
                        className="bg-[var(--bg-2)] border-[var(--border-hi)] font-mono flex-1"
                        data-testid="upi-utr-input"
                      />
                      <button
                        type="submit"
                        disabled={submittingUtr}
                        className="btn-amber rounded-full px-5 py-2.5 text-xs font-semibold whitespace-nowrap disabled:opacity-60"
                        data-testid="upi-utr-submit"
                      >
                        {submittingUtr ? "Submitting…" : "I Have Paid"}
                      </button>
                    </div>
                  </form>
                )}

                <div className="mt-3 text-[11px] text-[var(--muted-2)] leading-relaxed flex gap-2">
                  <ShieldCheck
                    size={14}
                    className="text-[var(--emerald)] mt-0.5 shrink-0"
                  />
                  <span>
                    {qr?.payment_mode === "upi_qr"
                      ? "Scan the UPI QR above using GPay / PhonePe / Paytm, then submit your UTR reference to verify and activate your account."
                      : "Open GPay / PhonePe / Paytm, scan this QR and pay securely via Razorpay. Keep this window open — your account activates automatically on success."}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    clearInterval(pollRef.current);
                    setStep(1);
                  }}
                  className="btn-ghost rounded-full px-5 py-3 text-sm flex-1"
                  data-testid="checkout-back-btn"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-6" data-testid="checkout-received">
              <CheckCircle2
                className="mx-auto text-[var(--emerald)]"
                size={48}
              />
              <div className="font-display text-2xl mt-5">
                {qr?.utr_submitted
                  ? "Payment submitted!"
                  : "Payment successful!"}
              </div>
              <p className="text-sm text-[var(--muted)] mt-3">
                {qr?.utr_submitted
                  ? `We received your UTR reference (${qr.utr}). Your order is under quick verification and your account will activate shortly.`
                  : buying?.product_type === PRODUCT_TYPES.INSTANT
                    ? "Your Instant Funding account is now active with immediate Funded status. Head to your dashboard or terminal to start trading."
                    : "Your payment is confirmed and your challenge account is active. Head to your dashboard or terminal to begin."}
              </p>
              <div className="card-panel p-4 text-left mt-6 font-mono text-xs">
                <div>
                  <span className="text-[var(--muted-2)]">Plan:</span>{" "}
                  {buying?.name}
                </div>
                <div>
                  <span className="text-[var(--muted-2)]">Amount:</span>{" "}
                  {formatINR(qr?.amount ?? buying?.challenge_fee)}
                </div>
                {qr?.utr && (
                  <div>
                    <span className="text-[var(--muted-2)]">UTR:</span> {qr.utr}
                  </div>
                )}
                <div>
                  <span className="text-[var(--muted-2)]">Status:</span>{" "}
                  {qr?.utr_submitted ? "Pending Verification" : "Paid"}
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-6">
                <Link
                  to="/app/accounts"
                  onClick={() => setBuying(null)}
                  className="btn-amber rounded-full px-6 py-3 text-sm"
                >
                  Open My Accounts
                </Link>
                <button
                  onClick={() => setBuying(null)}
                  className="btn-ghost rounded-full px-5 py-3 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
