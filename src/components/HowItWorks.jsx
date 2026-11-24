import { ShoppingCart, Target, Wallet, TrendingUp, CheckCircle2 } from "lucide-react";
import { useSettings } from "../context/SettingsContext";

const iconMap = {
  ShoppingCart: <ShoppingCart size={20} />,
  Target: <Target size={20} />,
  Wallet: <Wallet size={20} />,
  TrendingUp: <TrendingUp size={20} />,
};
const iconList = [
  <ShoppingCart size={20} />,
  <Target size={20} />,
  <TrendingUp size={20} />,
  <Wallet size={20} />,
];

const defaultItems = [
  {
    t: "Purchase Challenge",
    d: "Pick a plan and pay via UPI. Virtual funds are credited immediately to your dashboard.",
    i: "ShoppingCart",
  },
  {
    t: "Rules & Onboarding Call",
    d: "Our representative contacts you by phone to walk through all rules and guidelines.",
    i: "Target",
  },
  {
    t: "Pass the Challenge",
    d: "Follow all specified rules and hit your profit target on the virtual evaluation account.",
    i: "TrendingUp",
  },
  {
    t: "Same-Day Funded & 24h Payouts",
    d: "Receive your real funded account on the same day you pass and request payouts within 24 hours.",
    i: "Wallet",
  },
];

const defaultProcessParagraphs = [
  "As soon as you purchase a challenge, virtual funds will be credited to your dashboard to begin your challenge.",
  "After the purchase, a representative from our company will contact you by phone to explain the rules and guidelines. All rules will remain available on our official website for your reference.",
  "You must follow all the specified rules and successfully complete the challenge.",
  "Once you pass the challenge, you will receive your real funded account on the same day. After receiving your funded account, you can start requesting payouts within 24 hours, subject to the applicable payout terms.",
  "Our goal is to make your journey simple, transparent, and smooth.",
];

export default function HowItWorks({ hideHeader = false } = {}) {
  const { settings } = useSettings();
  const cfg = settings.how_it_works || {};
  if (cfg.enabled === false) return null;
  const items = cfg.items && cfg.items.length ? cfg.items : defaultItems;
  const processParagraphs =
    cfg.process_paragraphs && cfg.process_paragraphs.length
      ? cfg.process_paragraphs
      : defaultProcessParagraphs;

  return (
    <section className={hideHeader ? "py-2 md:py-3" : "py-4 md:py-8"} data-testid="how-it-works">
      {!hideHeader && (
        <div className="mb-6 md:mb-8">
          <div className="chip mb-3">{cfg.section_chip || "How It Works"}</div>
          <h2 className="font-display text-3xl md:text-5xl max-w-3xl">
            {cfg.section_title || cfg.title || "Four simple steps to funded trading"}
          </h2>
          <p className="text-[var(--muted)] mt-2.5 md:mt-3 max-w-2xl">
            {cfg.section_subtitle || "No hidden hoops. Just discipline, strategy, and payouts."}
          </p>
        </div>
      )}
      <div className="relative">
        <div
          className="hidden md:block absolute top-8 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-[var(--border-hi)] to-transparent"
          aria-hidden="true"
        />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 md:gap-4 relative">
          {items.slice(0, 4).map((s, i) => (
            <div key={i} data-reveal data-reveal-delay={String((i % 4) + 1)} className="relative">
              <div className="flex md:flex-col items-start gap-4">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl grid place-items-center border border-[var(--border-hi)] bg-[var(--bg-2)] relative shrink-0 text-[var(--accent)]">
                  {iconMap[s.i] || iconList[i] || <ShoppingCart size={20} />}
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-[10px] font-mono grid place-items-center font-bold">
                    0{i + 1}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base md:text-lg md:mt-2">{s.t}</div>
                  <p className="text-sm text-[var(--muted)] mt-1.5 md:mt-2 leading-relaxed">
                    {s.d}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="glass-card glow-border p-5 md:p-7 mt-5 md:mt-6"
        data-testid="how-it-works-process"
      >
        <h3 className="font-display text-xl md:text-2xl text-white">
          {cfg.process_heading || "Challenge to Funded Account Process"}
        </h3>
        <div className="mt-5 space-y-3.5 text-sm md:text-base text-[var(--muted)] leading-relaxed">
          {processParagraphs.map((para, idx) => {
            const highlightText =
              "Once you pass the challenge, you will receive your real funded account on the same day.";
            const hasHighlight = para.includes(highlightText);
            if (!hasHighlight) {
              return (
                <div key={idx} className="flex items-start gap-3">
                  <CheckCircle2 size={16} className="text-[var(--emerald)] shrink-0 mt-1" />
                  <p>{para}</p>
                </div>
              );
            }
            const [before, after] = para.split(highlightText);
            return (
              <div key={idx} className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-[var(--emerald)] shrink-0 mt-1" />
                <p>
                  {before}
                  <strong className="text-white font-semibold">{highlightText}</strong>
                  {after}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
