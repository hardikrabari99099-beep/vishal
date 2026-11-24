import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Wallet,
  Trophy,
  Zap,
  BadgeIndianRupee,
} from "lucide-react";
import { useLiveMarketQuotes, formatPrice } from "../lib/useLiveMarket";
import { useOffscreenPause } from "../lib/useOffscreenPause";

const candles = Array.from({ length: 22 }, (_, i) => {
  const base = Number((120 - i * 3.6 + Math.sin(i * 1.3) * 14).toFixed(2));
  const up = i % 3 !== 1;
  return { x: 20 + i * 27, y: base, h: 18 + ((i * 7) % 26), up };
});

export function HeroFX() {
  return (
    <div className="hero-fx" aria-hidden="true">
      <div className="hero-grid parallax-layer" data-parallax="0.06" />
      <span className="hero-orb hero-orb-a parallax-layer" data-parallax="-0.14" />
      <span className="hero-orb hero-orb-b parallax-layer" data-parallax="0.16" />
      <svg
        className="hero-chart parallax-layer"
        data-parallax="0.08"
        viewBox="0 0 620 200"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="hfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".35" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {candles.map((c, i) => (
          <g key={i} className="hero-candle" style={{ animationDelay: `${i * 70}ms` }}>
            <line x1={c.x + 5} x2={c.x + 5} y1={c.y - 10} y2={c.y + c.h + 10} />
            <rect x={c.x} y={c.y} width="10" height={c.h} rx="2" className={c.up ? "up" : "down"} />
          </g>
        ))}
        <path
          className="hero-line-fill"
          d={`M20 ${candles[0].y} ${candles.map((c) => `L${c.x + 5} ${c.y}`).join(" ")} L620 200 L20 200Z`}
          fill="url(#hfill)"
        />
        <path
          className="hero-line"
          d={`M20 ${candles[0].y} ${candles.map((c) => `L${c.x + 5} ${c.y}`).join(" ")}`}
        />
      </svg>
      <div className="hero-float hero-float-1 parallax-layer" data-parallax="-0.12">
        <TrendingUp />{" "}
        <div>
          <strong>+8.4%</strong>
          <span>Phase target hit</span>
        </div>
      </div>
      <div className="hero-float hero-float-2 parallax-layer" data-parallax="0.15">
        <BadgeIndianRupee />{" "}
        <div>
          <strong>Payout sent</strong>
          <span>Funded trader</span>
        </div>
      </div>
      <div className="hero-float hero-float-3 parallax-layer" data-parallax="-0.18">
        <ShieldCheck />{" "}
        <div>
          <strong>Risk capped</strong>
          <span>One-time fee</span>
        </div>
      </div>
    </div>
  );
}

const staticTicks = [
  [Zap, "NSE & BSE market prices may be delayed"],
  [Wallet, "Up to 70% profit split"],
  [Trophy, "Funded up to ₹5,00,000"],
  [ShieldCheck, "Clear, published rules"],
  [BadgeIndianRupee, "Payouts within 24 hours"],
];

const TICKER_SYMBOLS = [
  "NIFTY",
  "BANKNIFTY",
  "SENSEX",
  "RELIANCE",
  "TCS",
  "HDFCBANK",
  "INFY",
  "SBIN",
];

export function Ticker() {
  const { quotes, flashMap, marketStatus } = useLiveMarketQuotes(TICKER_SYMBOLS, {
    pollMs: 6000,
    microTick: true,
  });
  const [tickerRef, tickerPaused] = useOffscreenPause();
  const hasQuotes = quotes.length > 0;
  const isLive = marketStatus === "LIVE";

  return (
    <div
      ref={tickerRef}
      className={`home-ticker ${tickerPaused ? "is-marquee-paused" : ""}`}
      aria-label="Live NSE and BSE market prices"
    >
      <div className="home-ticker-track">
        {[0, 1].map((k) => (
          <div className="home-ticker-group" key={k}>
            {hasQuotes
              ? quotes.map((q) => {
                  const up = q.changePct >= 0;
                  const Icon = up ? TrendingUp : TrendingDown;
                  const flash = isLive ? flashMap?.[q.symbol] : "";
                  const flashCls =
                    flash === "up" ? "price-tick-up" : flash === "down" ? "price-tick-down" : "";
                  return (
                    <span key={`${k}-${q.symbol}`} className="tabular-nums">
                      <Icon size={15} className={up ? "ticker-ico-up" : "ticker-ico-down"} />
                      <strong className="ticker-sym">{q.symbol}</strong>
                      <em className="ticker-ex">{q.exchange}</em>
                      <strong className={`ticker-px ${flashCls}`}>
                        {q.kind === "EQUITY" ? `₹${formatPrice(q.ltp)}` : formatPrice(q.ltp)}
                      </strong>
                      {isLive && q.tickLive && <em>Simulated</em>}
                      <em className={up ? "ticker-chg is-up" : "ticker-chg is-down"}>
                        {up ? "+" : ""}
                        {q.changePct.toFixed(2)}%
                      </em>
                    </span>
                  );
                })
              : null}
            {staticTicks.map(([Icon, t], i) => (
              <span key={`${k}-s-${i}`}>
                <Icon size={15} />
                {t}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
