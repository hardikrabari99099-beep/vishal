import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { api, formatINR } from "../lib/api";
import {
  useLiveCandles,
  useLiveMarketQuotes,
  formatPrice,
} from "../lib/useLiveMarket";
import { hasLimitedMotion } from "../lib/limited-motion";
import { useOffscreenPause } from "../lib/useOffscreenPause";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import {
  ArrowRight,
  Check,
  Target,
  Zap,
  Rocket,
  Trophy,
  Crown,
  Medal,
  LineChart,
  ShieldCheck,
  Wallet,
  Headphones,
  Scale,
  Clock3,
  Sparkles,
} from "lucide-react";

const CandleChart = lazy(() =>
  import("./CandleChart").then((module) => ({ default: module.CandleChart })),
);

/* ---------- Funding products: 2 Main Challenge Types ---------- */
export function ProductCards({ plans, href }) {
  const std = plans || [];
  const from = std.length
    ? Math.min(...std.map((p) => Number(p.challenge_fee) || Infinity))
    : null;
  const sizes = std.map((p) => Number(p.account_size)).filter(Boolean);
  const products = [
    {
      key: "indifunded-challenges",
      icon: Target,
      name: "IndiFunded Challenges",
      tag: "Flagship · Track 01",
      live: true,
      line: "Point-based evaluation with one-time fee and 70% profit split.",
      to: "/challenges?program=classic",
      facts: std.length
        ? [
            `Accounts ${formatINR(Math.min(...sizes))} – ${formatINR(Math.max(...sizes))}`,
            `${std[0].profit_share}% profit split`,
            `From ${formatINR(from)} one-time fee`,
          ]
        : [
            "Structured NIFTY / equity challenge rules",
            "70% trader profit split",
            "One-time challenge fee",
          ],
    },
    {
      key: "instant-one-step",
      icon: Zap,
      name: "Instant / 1-Step",
      tag: "Track 02",
      live: true,
      line: "Skip evaluation with Instant Funding or pass a single 10% 1-Step target.",
      to: "/challenges?program=instant_one_step",
      facts: [
        "Instant Funding: Zero evaluation · 80–90% split",
        "1-Step Challenge: 10% target · No time limit",
        "Accounts ₹50,000 – ₹10,00,000",
      ],
    },
  ];
  return (
    <section
      data-reveal="3d"
      className="home-band"
      aria-labelledby="products-heading"
    >
      <div className="container-xl">
        <div className="home-section-heading">
          <div>
            <div className="home-eyebrow">Funding tracks</div>
            <h2 id="products-heading" className="font-display">
              Two ways to get funded
            </h2>
            <p>IndiFunded Challenges or Instant / 1-Step.</p>
          </div>
        </div>
        <div className="product-grid">
          {products.map(
            ({ key, icon: Icon, name, tag, live, line, facts, to }, i) => (
              <article
                key={key}
                data-reveal="zoom"
                data-reveal-delay={String(i + 1)}
                className={`product-card tx-morph ${live ? "is-live" : ""}`}
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div className="flex items-center justify-between">
                  <span className="product-icon">
                    <Icon size={22} />
                  </span>
                  <span className={`product-tag ${live ? "is-live" : ""}`}>
                    {tag}
                  </span>
                </div>
                <h3 className="font-display">{name}</h3>
                <p>{line}</p>
                {facts.length > 0 && (
                  <ul>
                    {facts.map((f) => (
                      <li key={f}>
                        <Check size={15} />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto pt-5">
                  <Button asChild className="w-full">
                    <Link to={to || href}>
                      Explore plans <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </article>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

const PREVIEW_SYMBOLS = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"];

function PlatformLiveQuoteBadge({ symbol, initialQuote, marketStatus }) {
  const liveQ = initialQuote;
  const [tickDir, setTickDir] = useState("");
  const prevLtpRef = useRef(null);
  const timerRef = useRef(null);
  const isLive = marketStatus === "LIVE";

  useEffect(() => {
    prevLtpRef.current = null;
    setTickDir("");
  }, [symbol, isLive]);

  useEffect(() => {
    const nextLtp = Number(initialQuote?.ltp);
    if (!Number.isFinite(nextLtp) || nextLtp <= 0) return;
    if (isLive && prevLtpRef.current !== null && prevLtpRef.current !== nextLtp) {
      setTickDir(nextLtp > prevLtpRef.current ? "up" : "down");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setTickDir(""), 200);
    }
    prevLtpRef.current = nextLtp;
  }, [symbol, initialQuote?.ltp, isLive]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!liveQ?.ltp) return null;
  const up = (liveQ.changePct ?? 0) >= 0;
  return (
    <>
      <strong
        className={`!text-sm !tracking-normal rounded px-1 transition-colors ${
          tickDir === "up"
            ? "price-tick-up !text-[#089981]"
            : tickDir === "down"
              ? "price-tick-down !text-[#F23645]"
              : "!text-[var(--text)]"
        }`}
      >
        {formatPrice(liveQ.ltp)}
      </strong>
      <span className={up ? "text-[var(--emerald)]" : "text-[var(--rose)]"}>
        {up ? "+" : ""}
        {Number(liveQ.changePct ?? 0).toFixed(2)}%
      </span>
    </>
  );
}

/* ---------- Trading platform preview (live NSE/BSE candlestick feed) ---------- */
export function PlatformPreview() {
  const [sym, setSym] = useState("NIFTY");
  const [previewRef, paused] = useOffscreenPause("240px 0px", true);
  const microTick = useMemo(() => !paused && !hasLimitedMotion(), [paused]);
  const { settings } = useSettings();
  const { user } = useAuth();
  const er = settings.evaluation_risk || {};
  const hc = settings.home_copy || {};
  const {
    candles: liveCandles,
    quote,
    marketStatus,
    loading,
    refreshing,
  } = useLiveCandles(sym, "5m", {
    enabled: !paused,
    pollMs: 10000,
    inPlace: true,
  });
  const { quoteMap } = useLiveMarketQuotes([sym], {
    enabled: !paused,
    pollMs: 5000,
    microTick,
  });
  const previewQuote =
    quoteMap[sym]?.source === "Cache"
      ? quote || quoteMap[sym]
      : quoteMap[sym] || quote;
  const chartPlaceholder = (
    <div className="grid h-[270px] place-items-center rounded-xl border border-[var(--border)] text-xs text-[var(--muted)]">
      Loading chart preview…
    </div>
  );

  const terminalHref = user ? "/app/terminal" : "/login?next=/app/terminal";

  return (
    <section
      data-reveal="slide-right"
      className="home-band"
      aria-labelledby="platform-heading"
    >
      <div className="container-xl platform-preview">
        <div>
          <div className="home-eyebrow">
            {hc.platform_eyebrow || "Trading platform"}
          </div>
          <h2
            id="platform-heading"
            className="font-display text-3xl md:text-5xl leading-tight mt-3"
          >
            {hc.platform_heading || "Live NSE & BSE execution desk"}
          </h2>
          <p className="text-[var(--muted)] mt-4 max-w-md">
            {hc.platform_subtitle ||
              "NIFTY, BANK NIFTY, SENSEX, and top stocks with TradingView charts and live risk guardrails."}
          </p>
          <ul className="platform-points">
            <li>
              <LineChart size={17} /> Live NSE & BSE TradingView charts (1m–1D)
            </li>
            <li>
              <ShieldCheck size={17} /> {er.daily_loss_limit_pct ?? 5}% daily &{" "}
              {er.max_loss_limit ?? 20}% max loss tracked live
            </li>
            <li>
              <Clock3 size={17} /> {er.profit_target_pct ?? 8}% target ·{" "}
              {er.min_trading_days ?? 10}+ trading days
            </li>
          </ul>
          <Button asChild variant="outline" className="mt-6">
            <Link to={terminalHref} data-testid="home-platform-cta">
              {hc.platform_cta || "Open Trader Terminal"} <ArrowRight />
            </Link>
          </Button>
        </div>
        <div
          ref={previewRef}
          data-parallax="0.06"
          className="platform-mock platform-mock--glass parallax-layer"
          aria-label="Live NSE and BSE TradingView platform preview"
        >
          <div className="platform-mock-top items-center flex-wrap gap-2">
            <div className="flex items-center gap-2.5 tabular-nums flex-wrap">
              <div className="seg">
                {PREVIEW_SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={sym === s ? "is-on" : ""}
                    onClick={() => setSym(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <PlatformLiveQuoteBadge
                symbol={sym}
                initialQuote={previewQuote}
                marketStatus={marketStatus}
              />
            </div>
            <strong>
              {marketStatus === "LIVE" ? "Live NSE/BSE" : "Last Close"}
            </strong>
          </div>
          <div className="my-2">
            {marketStatus === "LIVE" && previewQuote?.tickLive && (
              <p className="text-xs text-[var(--muted)]" role="status">
                Simulated fallback — waiting for a provider quote.
              </p>
            )}
            {paused ? (
              chartPlaceholder
            ) : (
              <Suspense fallback={chartPlaceholder}>
                <CandleChart
                  candles={liveCandles}
                  timeframe="5m"
                  quote={previewQuote}
                  height={270}
                  prevClose={previewQuote?.prevClose ?? null}
                  loading={loading}
                  refreshing={refreshing}
                  showEma
                  symbol={sym}
                />
              </Suspense>
            )}
          </div>
          <div className="platform-mock-panel">
            <div className="text-right font-mono tabular-nums">
              <small>
                Daily cap {er.daily_loss_limit_pct ?? 5}% · Max DD{" "}
                {er.max_loss_limit ?? 20}%
              </small>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Monthly top 10 leaderboard ---------- */
const SAMPLE_BOARD = Array.from({ length: 10 }, (_, i) => ({
  id: `s${i}`,
  name: `Sample trader ${i + 1}`,
  trader_id: `IF-SAMPLE-${101 + i}`,
  total_payout: 0,
  profit_pct: null,
  sample: true,
}));
export function MonthlyLeaderboard() {
  const { settings, syncVersion } = useSettings();
  const hc = settings.home_copy || {};
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api
      .get("/leaderboard", { params: { limit: 10 } })
      .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRows([]));
  }, [syncVersion]);
  const [monthLabel, setMonthLabel] = useState("");
  useEffect(() => {
    setMonthLabel(
      new Date().toLocaleString("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }),
    );
  }, []);
  const sample = rows !== null && rows.length === 0;
  const list = sample ? SAMPLE_BOARD : Array.isArray(rows) ? rows : [];
  const icons = [Crown, Trophy, Medal];
  return (
    <section
      data-reveal="fade"
      className="home-band"
      aria-labelledby="board-heading"
    >
      <div className="container-xl">
        <div className="home-section-heading">
          <div>
            <div className="home-eyebrow">
              {hc.leaderboard_eyebrow_prefix || "Monthly leaderboard"}
              {monthLabel ? ` · ${monthLabel}` : ""}
            </div>
            <h2 id="board-heading" className="font-display">
              {hc.leaderboard_heading || "Top 10 traders this month"}
            </h2>
            <p>
              {hc.leaderboard_subtitle ||
                "Ranked by verified performance and payouts."}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/leaderboard">
              {hc.leaderboard_cta || "Full leaderboard"} <ArrowRight />
            </Link>
          </Button>
        </div>
        {sample && (
          <div className="sample-note">
            Sample data — the live ranking appears here once this month's
            results are published.
          </div>
        )}
        <ol className="board-list">
          {list.slice(0, 10).map((r, i) => {
            const Icon = icons[i];
            return (
              <li
                key={r.id || i}
                className={`board-row ${i < 3 ? `is-top is-top-${i + 1}` : ""} ${r.sample ? "is-sample" : ""}`}
              >
                <span className="board-rank">
                  {Icon ? <Icon size={18} /> : i + 1}
                </span>
                <div className="board-name">
                  <strong>{r.name || r.trader_name}</strong>
                  <small>{r.trader_id || r.plan || ""}</small>
                </div>
                <div className="board-stat">
                  <small>{r.profit_pct != null ? "Return" : ""}</small>
                  {r.profit_pct != null ? `${r.profit_pct}%` : ""}
                </div>
                <div className="board-payout font-display">
                  {r.sample ? "—" : formatINR(Number(r.total_payout) || 0)}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

const WHY_ICONS = {
  Scale,
  Wallet,
  Sparkles,
  ShieldCheck,
  LineChart,
  Headphones,
  Target,
  Trophy,
  Zap,
  Clock3,
};

const DEFAULT_WHY_ITEMS = [
  {
    icon: "Scale",
    t: "Clear, published rules",
    d: "Every target, loss limit and trading-day rule is visible before you pay.",
  },
  {
    icon: "Wallet",
    t: "One-time challenge fee",
    d: "No monthly subscriptions. Pay once for your evaluation.",
  },
  {
    icon: "Sparkles",
    t: "Built for Indian markets",
    d: "NIFTY, BANK NIFTY and INR accounts — no currency conversions.",
  },
  {
    icon: "ShieldCheck",
    t: "Verifiable payouts",
    d: "Every published payout can be checked with its Payout ID.",
  },
  {
    icon: "LineChart",
    t: "Your progress, live",
    d: "Dashboard tracking for P&L, drawdown and evaluation targets.",
  },
  {
    icon: "Headphones",
    t: "Real support team",
    d: "Talk to us on WhatsApp, email or phone when you need help.",
  },
];

/* ---------- Why choose IndiFunded ---------- */
export function WhyChoose() {
  const { settings } = useSettings();
  const wc = settings.why_choose || {};
  const items = wc.items && wc.items.length ? wc.items : DEFAULT_WHY_ITEMS;
  return (
    <section
      data-reveal="scale"
      className="home-band"
      aria-labelledby="why-heading"
    >
      <div className="container-xl">
        <div className="home-section-heading">
          <div>
            <div className="home-eyebrow">{wc.eyebrow || "Why IndiFunded"}</div>
            <h2 id="why-heading" className="font-display">
              {wc.heading || "Built for traders who take it seriously"}
            </h2>
          </div>
        </div>
        <div className="why-grid" data-testid="why-choose-grid">
          {items.map((item, idx) => {
            const Icon =
              WHY_ICONS[item.icon] ||
              WHY_ICONS[DEFAULT_WHY_ITEMS[idx % 6]?.icon] ||
              ShieldCheck;
            return (
              <div
                key={`${item.t}-${idx}`}
                data-reveal="scale"
                data-reveal-delay={String((idx % 4) + 1)}
                className="why-item tx-morph"
              >
                <span className="why-icon">
                  <Icon size={18} />
                </span>
                <h3 className="font-display">{item.t}</h3>
                <p>{item.d}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
