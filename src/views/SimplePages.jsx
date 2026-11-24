import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Link, useParams } from "@/lib/router-compat";
import { api, formatApiError } from "../lib/api";
import { useSEO } from "../lib/useSEO";
import { useSettings } from "../context/SettingsContext";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Scale,
  BookOpen,
  TrendingDown,
  Users,
  Clock,
  CircleDollarSign,
  Zap,
  Star,
  TrendingUp,
} from "lucide-react";
import PayoutRequest from "./PayoutRequest";

const iconLibrary = {
  Scale: <Scale />,
  TrendingDown: <TrendingDown />,
  ShieldCheck: <ShieldCheck />,
  BookOpen: <BookOpen />,
  Users: <Users />,
  CheckCircle2: <CheckCircle2 />,
  Clock: <Clock />,
  CircleDollarSign: <CircleDollarSign />,
  Zap: <Zap />,
  Star: <Star />,
  TrendingUp: <TrendingUp />,
};

export function About() {
  const { settings } = useSettings();
  const a = settings.about;
  useSEO({
    title: "About Us — Built for Indian Traders",
    description: a.intro.slice(0, 155),
    path: "/about",
  });
  return (
    <div className="container-xl pt-16 pb-24">
      <div className="chip mb-4">About</div>
      <h1
        className="font-display text-3xl sm:text-4xl md:text-6xl max-w-3xl"
        data-testid="about-title"
      >
        {a.title}
      </h1>
      <p className="text-[var(--muted)] mt-6 max-w-3xl text-lg leading-relaxed">{a.intro}</p>
      <div className="grid md:grid-cols-3 gap-5 mt-14">
        {(a.cards || []).map((x, i) => (
          <div key={i} className="glass-card p-7">
            <div className="font-display text-2xl">{x.t}</div>
            <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">{x.d}</p>
          </div>
        ))}
      </div>
      <div className="glass-card p-10 md:p-14 mt-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h3 className="font-display text-3xl">{a.footer_title}</h3>
          <p className="text-[var(--muted)] mt-2 max-w-2xl">{a.footer_text}</p>
        </div>
        <Link
          to="/challenges"
          className="btn-amber rounded-full px-6 py-3 inline-flex items-center gap-2"
          data-testid="about-cta"
        >
          Start Challenge <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

const GENERAL_RULES = [
  {
    num: "01",
    title: "No Hidden Rules",
    icon: "ShieldCheck",
    body: [
      "IndiFunded follows a transparent trading policy. There are no hidden rules or undisclosed conditions. All applicable rules are communicated to traders in advance.",
    ],
  },
  {
    num: "02",
    title: "Profit Sharing",
    icon: "Scale",
    body: ["The profit-sharing structure is:"],
    bullets: ["70% – Trader", "30% – IndiFunded (Company)"],
    note: "Traders receive 70% of the profits generated in their funded accounts.",
  },
  {
    num: "03",
    title: "Real Funded Account After Passing",
    icon: "CheckCircle2",
    body: [
      "Once a trader successfully passes the challenge, they receive a real funded trading account, not a virtual trading account.",
    ],
  },
  {
    num: "04",
    title: "Point Calculation",
    icon: "TrendingUp",
    body: ["Points are calculated based on the difference between the buying and selling premium."],
    exampleTitle: "Example",
    bullets: ["Buy an option at 100.", "Sell the option at 150.", "Profit: 50 points."],
    note: "The difference of 50 points will be counted as the trader's earned points.",
  },
  {
    num: "05",
    title: "Supported Trading Platforms",
    icon: "Zap",
    body: [
      "After successfully passing the challenge, traders can receive their real funded account through their preferred supported platform:",
    ],
    tags: ["Zerodha", "Angel One", "Upstox", "Dhan", "ATS"],
  },
  {
    num: "06",
    title: "Payout Policy",
    icon: "CircleDollarSign",
    body: [
      "IndiFunded does not impose any additional profit criteria for payouts on funded accounts. There is:",
    ],
    bullets: [
      "No minimum profit requirement.",
      "No maximum profit limit.",
      "No fixed profit target.",
      "No additional profit threshold to qualify for a payout.",
    ],
    note: "Traders can request payouts based on the profits they generate. Payout Processing Time: Within 24 Hours.",
  },
  {
    num: "07",
    title: "Trading Segments",
    icon: "BookOpen",
    segments: [
      {
        label: "Challenge / Virtual Account",
        text: "Trading is restricted to NIFTY Options, BANK NIFTY Options, and Intraday Option Buying Only.",
      },
      {
        label: "Real Funded Account",
        text: "There are no additional segment restrictions imposed by IndiFunded. Traders can use their funded capital in their preferred eligible trading segments, subject to the supported platform and applicable market regulations.",
      },
    ],
  },
  {
    num: "08",
    title: "Maximum Drawdown – Funded Account",
    icon: "TrendingDown",
    body: [
      "After passing the challenge, traders receive a maximum drawdown limit of 20% on their real funded account.",
    ],
    exampleTitle: "Example",
    bullets: [
      "Funded Capital: ₹1,00,000",
      "Maximum Drawdown: 20%",
      "Maximum Permitted Loss: ₹20,000",
    ],
    note: "If the account reaches the maximum drawdown limit, the funded account will be deactivated.",
  },
  {
    num: "09",
    title: "Trading Days Calculation",
    icon: "Clock",
    body: [
      "Only the days on which a trader actually executes a trade will count towards the challenge duration.",
    ],
    exampleTitle: "Example",
    bullets: [
      "If a trader trades today, today counts as one trading day.",
      "If a trader does not execute any trade today, today will not count as a challenge day.",
    ],
  },
  {
    num: "10",
    title: "Virtual Account Loss Limit",
    icon: "ShieldCheck",
    body: ["There is no loss limit on the virtual account during the challenge evaluation phase."],
  },
  {
    num: "11",
    title: "Challenge Evaluation & Scaling",
    icon: "TrendingUp",
    body: [
      "After completing a challenge, the company's evaluation team reviews the trader's performance. Based on the trader's performance, IndiFunded may upgrade the trader's account and increase the allocated capital.",
    ],
    bullets: [
      "Initial capital increases may be made in increments of ₹1,00,000 per month.",
      "Traders may be evaluated for scaling up to ₹7,00,000.",
    ],
  },
  {
    num: "12",
    title: "Funded Account Duration",
    icon: "Clock",
    body: [
      "There is no fixed time limit on the funded account. The account remains active as long as the trader follows the applicable funded account rules and does not breach the maximum 20% drawdown limit.",
    ],
  },
];

const CHALLENGE_RULE_PLANS = [
  {
    num: "1",
    name: "STARTER CHALLENGE",
    capital: "₹1,00,000",
    fee: "₹4,999",
    specs: [
      { k: "Profit Target", v: "550 Points" },
      { k: "Maximum Duration", v: "10 Days" },
      { k: "Minimum Trading Days", v: "0 Days" },
      { k: "Maximum Trades Per Day", v: "3" },
      { k: "Scaling Evaluation", v: "Up to ₹7,00,000" },
    ],
  },
  {
    num: "2",
    name: "STANDARD CHALLENGE",
    capital: "₹2,00,000",
    fee: "₹7,999",
    specs: [
      { k: "Profit Target", v: "650 Points" },
      { k: "Challenge Duration", v: "12 Days" },
      { k: "Maximum Trades Per Day", v: "3" },
      { k: "Scaling Evaluation", v: "Up to ₹7,00,000" },
    ],
  },
  {
    num: "3",
    name: "PRO CHALLENGE",
    capital: "₹3,00,000",
    fee: "₹12,999",
    popular: true,
    specs: [
      { k: "Profit Target", v: "750 Points" },
      { k: "Challenge Duration", v: "12 Days" },
      { k: "Maximum Trades Per Day", v: "3" },
      { k: "Scaling Evaluation", v: "Up to ₹7,00,000" },
    ],
  },
  {
    num: "4",
    name: "ELITE CHALLENGE",
    capital: "₹5,00,000",
    fee: "₹14,999",
    specs: [
      { k: "Profit Target", v: "900 Points" },
      { k: "Challenge Duration", v: "15 Days" },
      { k: "Maximum Trades Per Day", v: "3" },
      { k: "Scaling Evaluation", v: "Up to ₹7,00,000" },
    ],
  },
  {
    num: "5",
    name: "MASTER CHALLENGE",
    capital: "₹7,00,000",
    fee: "To be confirmed",
    specs: [
      { k: "Profit Target", v: "1,000 Points" },
      { k: "Challenge Duration", v: "15 Days" },
      { k: "Maximum Trades", v: "32" },
    ],
  },
];

const COMPARISON_ROWS = [
  {
    feature: "Account Type",
    challenge: "Virtual",
    funded: "Real",
  },
  {
    feature: "Trading Segments",
    challenge: "NIFTY & BANK NIFTY Options",
    funded: "No additional IndiFunded segment restrictions",
  },
  {
    feature: "Trading Style",
    challenge: "Intraday Option Buying",
    funded: "As permitted by the supported platform",
  },
  {
    feature: "Loss Limit",
    challenge: "No loss limit",
    funded: "20% Maximum Drawdown",
  },
  {
    feature: "Profit Target",
    challenge: "Plan-specific",
    funded: "No fixed profit target",
  },
  {
    feature: "Minimum Profit for Payout",
    challenge: "Not applicable",
    funded: "No minimum requirement",
  },
  {
    feature: "Maximum Profit Limit",
    challenge: "Not applicable",
    funded: "No maximum limit",
  },
  {
    feature: "Payout",
    challenge: "No challenge profit withdrawal",
    funded: "Within 24 hours",
  },
  {
    feature: "Account Duration",
    challenge: "Plan-specific",
    funded: "No fixed time limit",
  },
];

export function Rules() {
  const { settings } = useSettings();
  const r = settings.rules || {};
  const b = settings.benefits || {};
  useSEO({
    title: "General Rules, Challenge Structure & Funded Account Policies — IndiFunded",
    description:
      "Official IndiFunded challenge rules, 70/30 profit sharing, point calculation, supported brokers, 24-hour payouts, scaling up to ₹7,00,000, and funded account policies.",
    path: "/rules",
  });
  return (
    <div className="container-xl pt-12 md:pt-16 pb-16 md:pb-24">
      <div className="chip mb-4">Rules &amp; Policies</div>
      <h1
        className="font-display text-3xl sm:text-4xl md:text-6xl max-w-4xl"
        data-testid="rules-title"
      >
        {r.title || "Challenge Rules & Funded Policies"}
      </h1>
      <p className="text-[var(--muted)] mt-4 max-w-2xl text-sm md:text-base">
        {r.subtitle ||
          "Clear rules across IndiFunded Challenges and Instant / 1-Step funding tracks."}
      </p>

      <div className="flex flex-wrap gap-2 mt-6">
        <a
          href="#part-1-general-rules"
          className="px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider border border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)] transition-colors"
        >
          General Rules
        </a>
        <a
          href="#part-2-individual-challenges"
          className="px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider border border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)] transition-colors"
        >
          IndiFunded Challenges
        </a>
        <a
          href="#part-3-comparison"
          className="px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider border border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)] transition-colors"
        >
          Challenge vs Funded
        </a>
        <a
          href="#part-4-new-products"
          className="px-4 py-2 rounded-full text-xs font-mono uppercase tracking-wider border border-[var(--border-hi)] bg-[var(--bg-1)] hover:border-[var(--accent)] transition-colors"
        >
          Instant / 1-Step
        </a>
      </div>

      {/* PART 1: GENERAL RULES */}
      <section id="part-1-general-rules" className="mt-12 md:mt-16 scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-[var(--accent)]">
              Part 1
            </div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl mt-1">General Rules</h2>
            <p className="text-sm text-[var(--muted)] mt-2">
              These rules apply to all IndiFunded challenges unless a specific challenge has a
              separate condition.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 md:gap-5">
          {GENERAL_RULES.map((item, i) => (
            <div
              key={item.num}
              className="glass-card hover-lift p-5 md:p-7 flex flex-col justify-between"
              data-testid={`rule-${i}`}
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div className="w-10 h-10 rounded-xl grid place-items-center border border-[var(--border-hi)] text-[var(--accent)]">
                    {iconLibrary[item.icon] || <CheckCircle2 />}
                  </div>
                  <span className="font-mono text-xs px-2.5 py-1 rounded-full bg-[var(--bg-1)] border border-[var(--border-hi)] text-[var(--muted-2)]">
                    Rule {item.num}
                  </span>
                </div>

                <h3 className="font-display text-lg md:text-2xl mt-5">{item.title}</h3>

                {item.body &&
                  item.body.map((p, idx) => (
                    <p key={idx} className="text-sm text-[var(--muted)] mt-2.5 leading-relaxed">
                      {p}
                    </p>
                  ))}

                {item.exampleTitle && (
                  <div className="text-xs font-mono uppercase tracking-wider text-[var(--accent)] mt-4">
                    {item.exampleTitle}
                  </div>
                )}

                {item.bullets && (
                  <ul className="mt-2.5 space-y-1.5 text-sm text-[var(--muted)]">
                    {item.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="flex items-start gap-2">
                        <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {item.tags && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-1)] border border-[var(--border-hi)] text-xs font-mono text-white"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {item.segments && (
                  <div className="mt-3 space-y-3">
                    {item.segments.map((seg) => (
                      <div
                        key={seg.label}
                        className="rounded-xl bg-[var(--bg-1)] border border-[var(--border)] p-3.5"
                      >
                        <div className="text-xs font-mono uppercase tracking-wider text-[var(--accent)]">
                          {seg.label}
                        </div>
                        <p className="text-sm text-[var(--muted)] mt-1 leading-relaxed">
                          {seg.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {item.note && (
                <p className="text-xs md:text-sm text-white/90 mt-4 pt-3 border-t border-[var(--border)] leading-relaxed">
                  {item.note}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* PART 2: INDIVIDUAL CHALLENGE RULES */}
      <section id="part-2-individual-challenges" className="mt-16 md:mt-24 scroll-mt-24">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <div className="text-xs font-mono uppercase tracking-widest text-[var(--accent)]">
              Part 2
            </div>
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl mt-1">
              Individual Challenge Rules
            </h2>
            <p className="text-sm text-[var(--muted)] mt-2">
              The following conditions apply separately to their respective challenge plans.
            </p>
          </div>
          <Link
            to="/challenges"
            className="btn-amber rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 self-start md:self-auto"
          >
            Choose a Challenge <ArrowRight size={15} />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {CHALLENGE_RULE_PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`card-panel hover-lift p-6 flex flex-col justify-between ${
                plan.popular ? "glow-border" : ""
              }`}
              data-testid={`challenge-rule-${plan.num}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-[var(--muted-2)]">
                    Plan 0{plan.num}
                  </span>
                  {plan.popular && (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[var(--accent)] text-white">
                      Popular
                    </span>
                  )}
                </div>
                <h3 className="font-display text-xl md:text-2xl mt-2">{plan.name}</h3>
                <div className="mt-4 pb-4 border-b border-[var(--border)] flex items-baseline justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                      Account Capital
                    </div>
                    <div className="font-display text-2xl text-[var(--emerald)] mt-0.5">
                      {plan.capital}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                      Challenge Fee
                    </div>
                    <div className="font-mono text-base text-white mt-0.5">{plan.fee}</div>
                  </div>
                </div>

                <dl className="mt-4 space-y-2.5 text-sm">
                  {plan.specs.map((sp) => (
                    <div key={sp.k} className="flex items-center justify-between gap-3">
                      <dt className="text-[var(--muted)]">{sp.k}</dt>
                      <dd className="font-mono text-white text-right">{sp.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PART 3: IMPORTANT DISTINCTION */}
      <section id="part-3-comparison" className="mt-16 md:mt-24 scroll-mt-24">
        <div className="text-xs font-mono uppercase tracking-widest text-[var(--accent)]">
          Part 3
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-4xl mt-1">
          Important Distinction
        </h2>
        <p className="text-sm text-[var(--muted)] mt-2">
          Challenge Account vs. Real Funded Account
        </p>

        <div className="card-panel mt-6 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="border-b border-[var(--border-hi)] bg-[var(--bg-1)]">
                <th className="py-4 px-5 text-xs font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  Feature
                </th>
                <th className="py-4 px-5 text-xs font-mono uppercase tracking-wider text-[var(--accent)]">
                  Challenge Account
                </th>
                <th className="py-4 px-5 text-xs font-mono uppercase tracking-wider text-[var(--emerald)]">
                  Real Funded Account
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.feature}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-white/[0.02]"
                >
                  <td className="py-3.5 px-5 text-sm font-medium text-white">{row.feature}</td>
                  <td className="py-3.5 px-5 text-sm text-[var(--muted)]">{row.challenge}</td>
                  <td className="py-3.5 px-5 text-sm text-white">{row.funded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="glass-card glow-border p-6 md:p-8 mt-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-[var(--accent)]">
              Important Note
            </div>
            <p className="text-sm md:text-base text-[var(--muted)] mt-2 max-w-3xl leading-relaxed">
              Challenge profits are used for evaluation purposes and do not qualify for withdrawal.
              Profit sharing and payouts apply to the real funded account after successfully passing
              the challenge and completing the required onboarding formalities.
            </p>
          </div>
          <Link
            to="/challenges"
            className="btn-amber rounded-full px-6 py-3 text-sm inline-flex items-center gap-2 shrink-0"
          >
            Start Challenge <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* PART 4: INSTANT / 1-STEP RULES */}
      <section id="part-4-new-products" className="mt-16 md:mt-24 scroll-mt-24">
        <div className="text-xs font-mono uppercase tracking-widest text-[var(--accent)]">
          Track 02
        </div>
        <h2 className="font-display text-2xl sm:text-3xl md:text-4xl mt-1">
          Instant / 1-Step Rules
        </h2>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Automated risk limits independent from IndiFunded Challenges.
        </p>

        <div className="grid md:grid-cols-2 gap-6 mt-8">
          <div className="card-panel p-6 md:p-8 space-y-4">
            <div className="text-xs font-mono uppercase tracking-widest text-[var(--emerald)]">
              Program A · Instant Funding
            </div>
            <h3 className="font-display text-2xl">Immediate Funded Capital</h3>
            <ul className="space-y-2.5 text-sm text-[var(--muted)]">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  No evaluation phase &amp; no profit target — funded immediately upon payment.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>Account sizes: ₹50,000 to ₹10,00,000.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  Daily loss limit: 3% of daily starting balance (automated breach at 3%).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  Overall trailing drawdown: 5% — choose Intraday (live peak) or EOD (settled daily
                  close).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  First 3% closed profit is reserved as a permanent profit buffer before payouts.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>Profit split: 80% on Bi-Weekly payouts or 90% on Monthly payouts.</span>
              </li>
            </ul>
          </div>

          <div className="card-panel p-6 md:p-8 space-y-4">
            <div className="text-xs font-mono uppercase tracking-widest text-[var(--accent)]">
              Program B · 1-Step Challenge
            </div>
            <h3 className="font-display text-2xl">Single-Phase Evaluation</h3>
            <ul className="space-y-2.5 text-sm text-[var(--muted)]">
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>One evaluation phase across ₹1,00,000 to ₹10,00,000 accounts.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>Profit target: 10% net equity growth above starting capital.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  Daily loss limit: 3% &amp; Maximum overall loss: 6% of starting capital.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  Minimum trading days: 3 separate trading days · No maximum time limit (∞).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  Automatic promotion: hitting 10% with ≥ 3 days auto-unlocks your Funded account.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
                <span>
                  Automated breach enforcement immediately blocks orders &amp; settles open
                  positions.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {b.items && b.items.length > 0 && (
        <div className="mt-16 md:mt-24">
          <div className="chip mb-4">Benefits</div>
          <h2 className="font-display text-2xl sm:text-3xl md:text-5xl max-w-3xl">
            {b.title || "Why IndiFunded"}
          </h2>
          {b.subtitle && (
            <p className="text-[var(--muted)] mt-3 max-w-2xl text-sm md:text-base">{b.subtitle}</p>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mt-8 md:mt-12">
            {b.items.map((f, i) => (
              <div
                key={i}
                className="card-panel hover-lift p-5 md:p-7"
                data-testid={`benefit-${i}`}
              >
                <div className="w-10 h-10 rounded-xl grid place-items-center border border-[var(--border-hi)] text-[var(--accent)]">
                  {iconLibrary[f.i] || <CheckCircle2 />}
                </div>
                <div className="font-display text-lg md:text-xl mt-4 md:mt-6">{f.t}</div>
                <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dedicated Payouts page — renders the Payout Request form.
 * (Recent payouts list removed on Payouts page per user specification.)
 */
export function Payouts() {
  const { settings } = useSettings();
  const p = settings.payouts_page || {};
  const showForm = p.show_request_form !== false;
  useSEO({
    title: "Payouts — Request Your Payout",
    description: p.subtitle
      ? p.subtitle.slice(0, 155)
      : "Submit a payout request for your funded IndiFunded account — processed within 24 hours.",
    path: "/payouts",
  });
  return (
    <div data-testid="payouts-page">
      {showForm ? (
        <PayoutRequest embedded />
      ) : (
        <div className="container-xl pt-16 pb-24">
          <div className="chip mb-4">Payouts</div>
          <h1
            className="font-display text-3xl sm:text-4xl md:text-6xl max-w-3xl"
            data-testid="payouts-title"
          >
            {p.heading || "Request Your Payout"}
          </h1>
          {p.subtitle && (
            <p className="text-[var(--muted)] mt-4 max-w-2xl text-sm md:text-base">{p.subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function FAQ() {
  const { settings } = useSettings();
  const groups = settings.faq_groups || [];
  const allQA = groups.flatMap((g) => (g.items || []).map((it) => [it.q, it.a]));
  useSEO({
    title: "FAQ — Trust, Challenge & Payouts",
    description:
      "Answers about IndiFunded — SEBI status, profit targets, payout timelines, segments allowed, broker integrations and challenge rules.",
    path: "/faq",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: allQA.map(([q, ans]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: ans },
      })),
    },
  });
  const first = groups[0]?.title;
  return (
    <div className="container-xl pt-16 pb-24">
      <div className="chip mb-4">FAQ</div>
      <h1
        className="font-display text-3xl sm:text-4xl md:text-6xl max-w-3xl"
        data-testid="faq-title"
      >
        Frequently asked questions
      </h1>
      {first && (
        <Tabs defaultValue={first} className="mt-12">
          <TabsList
            className="glass p-1 h-auto flex flex-wrap gap-1 rounded-2xl"
            data-testid="faq-tabs"
          >
            {groups.map((g) => (
              <TabsTrigger
                key={g.title}
                value={g.title}
                className="data-[state=active]:bg-[var(--accent)] data-[state=active]:text-white px-4 py-2 rounded-xl text-sm"
              >
                {g.title}
              </TabsTrigger>
            ))}
          </TabsList>
          {groups.map((g) => (
            <TabsContent key={g.title} value={g.title} className="mt-8">
              <Accordion type="single" collapsible className="space-y-3">
                {(g.items || []).map((it, i) => (
                  <AccordionItem
                    key={i}
                    value={`${g.title}-${i}`}
                    className="glass-card border-0 px-6"
                    data-testid={`faq-item-${g.title}-${i}`}
                  >
                    <AccordionTrigger className="text-left font-display text-lg hover:text-[var(--accent)]">
                      {it.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-[var(--muted)] leading-relaxed">
                      {it.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}

export function Blog() {
  const { syncVersion } = useSettings();
  const [blogs, setBlogs] = useState([]);
  useSEO({
    title: "Blog — Trading Insights, Strategies & Updates",
    description:
      "Trading insights, prop firm strategies, and updates from IndiFunded. Learn how to maximize profits with funded accounts, manage risk, and pass the challenge.",
    path: "/blog",
  });
  useEffect(() => {
    api
      .get("/blogs")
      .then((r) => setBlogs(r.data))
      .catch(() => {});
  }, [syncVersion]);
  return (
    <div className="container-xl pt-16 pb-24">
      <div className="chip mb-4">Insights</div>
      <h1 className="font-display text-3xl sm:text-4xl md:text-6xl" data-testid="blog-title">
        Latest updates & resources
      </h1>
      <div className="grid md:grid-cols-3 gap-5 mt-12">
        {blogs.map((b, i) => (
          <Link
            to={`/blog/${b.slug}`}
            key={b.id}
            className="glass-card hover-lift overflow-hidden block"
            data-testid={`blog-card-${i}`}
          >
            <div
              className="h-52 bg-cover bg-center"
              style={{ backgroundImage: `url(${b.cover_image})` }}
            />
            <div className="p-6">
              <div className="text-xs font-mono uppercase tracking-wider text-[var(--muted-2)]">
                By {b.author}
              </div>
              <div className="font-display text-xl mt-2 line-clamp-2">{b.title}</div>
              <p className="text-sm text-[var(--muted)] mt-3 line-clamp-3">{b.excerpt}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BlogDetail() {
  const { syncVersion } = useSettings();
  const { slug } = useParams();
  const [b, setB] = useState(null);
  useEffect(() => {
    api
      .get(`/blogs/${slug}`)
      .then((r) => setB(r.data))
      .catch(() => setB(false));
  }, [slug, syncVersion]);
  useSEO({
    title: b && b.title ? b.title : "Article",
    description: b && b.excerpt ? b.excerpt : "Trading insights from IndiFunded.",
    path: `/blog/${slug}`,
    image: b && b.cover_image ? b.cover_image : "/logo.jpg",
    type: "article",
  });
  if (b === null) return <div className="container-xl py-24 text-[var(--muted)]">Loading…</div>;
  if (b === false)
    return (
      <div className="container-xl py-24">
        Post not found.{" "}
        <Link to="/blog" className="text-[var(--accent)]">
          Back to blog
        </Link>
      </div>
    );
  return (
    <div className="container-xl pt-16 pb-24 max-w-3xl">
      <Link to="/blog" className="text-sm text-[var(--muted)] link-underline">
        ← All posts
      </Link>
      <h1 className="font-display text-4xl md:text-5xl mt-6" data-testid="blog-detail-title">
        {b.title}
      </h1>
      <div className="text-xs font-mono uppercase tracking-wider text-[var(--muted-2)] mt-4">
        By {b.author} · {new Date(b.created_at).toLocaleDateString()}
      </div>
      {b.cover_image && (
        <div
          className="h-80 mt-8 rounded-2xl bg-cover bg-center border border-[var(--border)]"
          style={{ backgroundImage: `url(${b.cover_image})` }}
        />
      )}
      <div className="mt-8 text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
        {b.content}
      </div>
    </div>
  );
}

export function Contact() {
  const { settings } = useSettings();
  const c = settings.contact;
  const [mode, setMode] = useState("ticket"); // "ticket" | "callback"
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    city: "",
    challenge_type: "",
    platform: "",
    category: "Account",
    subject: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [createdTicket, setCreatedTicket] = useState(null);

  useSEO({
    title: "Contact & Generate Support Ticket — IndiFunded",
    description: `Generate a support ticket or email ${c.email} for help with challenges, KYC, payouts and trading accounts.`,
    path: "/contact",
  });

  const submitTicket = async (e) => {
    e.preventDefault();
    const fullName = `${form.first_name} ${form.last_name}`.trim();
    if (!fullName || !form.email.trim()) {
      toast.error("Please enter your name and email address.");
      return;
    }
    if (form.subject.trim().length < 3 || form.message.trim().length < 5) {
      toast.error("Please enter a subject and brief description of your query.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post("/tickets", {
        name: fullName,
        email: form.email.trim(),
        phone: form.phone.trim(),
        city: form.city.trim(),
        challenge_type: form.challenge_type.trim(),
        category: form.category || "Account",
        subject: form.subject.trim(),
        message: form.message.trim(),
        source: "contact",
      });
      setCreatedTicket(data);
      toast.success(`Support ticket ${data.id} generated! Our team will respond shortly.`);
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        city: "",
        challenge_type: "",
        platform: "",
        category: "Account",
        subject: "",
        message: "",
      });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Could not generate ticket");
    } finally {
      setBusy(false);
    }
  };

  const submitCallback = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/leads", form);
      toast.success("Thanks! Our team will contact you shortly.");
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        phone: "",
        city: "",
        challenge_type: "",
        platform: "",
        category: "Account",
        subject: "",
        message: "",
      });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-xl pt-16 pb-24">
      <div className="chip mb-4">Contact & Support</div>
      <h1
        className="font-display text-3xl sm:text-4xl md:text-6xl max-w-3xl"
        data-testid="contact-title"
      >
        Generate a ticket or talk to our team
      </h1>
      <p className="text-[var(--muted)] mt-6 max-w-2xl">
        Raise a tracked support ticket anytime — every ticket goes directly to our admin support
        desk with a dedicated reference ID.
      </p>

      <div className="grid md:grid-cols-5 gap-8 mt-14">
        <div className="md:col-span-3 space-y-5">
          <div className="seg">
            <button
              type="button"
              className={mode === "ticket" ? "is-on" : ""}
              onClick={() => setMode("ticket")}
              data-testid="contact-tab-ticket"
            >
              Generate Ticket
            </button>
            <button
              type="button"
              className={mode === "callback" ? "is-on" : ""}
              onClick={() => setMode("callback")}
              data-testid="contact-tab-callback"
            >
              Enrollment Enquiry
            </button>
          </div>

          {createdTicket && mode === "ticket" && (
            <div
              className="glass-card p-5 border-[var(--emerald)]/50 bg-[rgba(41,211,154,0.08)]"
              data-testid="ticket-created-banner"
            >
              <div className="text-xs font-mono uppercase tracking-wider text-[var(--emerald)]">
                Ticket Generated · {createdTicket.id}
              </div>
              <div className="font-display text-xl mt-1 text-white">{createdTicket.subject}</div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Submitted for <span className="text-white">{createdTicket.user_email}</span> ·
                Status: <strong className="text-[var(--emerald)]">{createdTicket.status}</strong>
              </p>
            </div>
          )}

          <form
            onSubmit={mode === "ticket" ? submitTicket : submitCallback}
            className="glass-card p-8 space-y-5"
            data-testid="contact-form"
          >
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input
                  required
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                  data-testid="contact-first-name"
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                  data-testid="contact-last-name"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                  data-testid="contact-email"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                  placeholder="+91"
                  data-testid="contact-phone"
                />
              </div>
            </div>

            {mode === "ticket" ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="input-dark mt-2"
                    data-testid="ticket-category"
                  >
                    {["Account", "Challenges", "Trading Terminal", "Payouts", "KYC", "Other"].map(
                      (cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div>
                  <Label>Ticket Subject</Label>
                  <Input
                    required
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Brief summary of your issue"
                    className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                    data-testid="ticket-subject"
                  />
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>City</Label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                    data-testid="contact-city"
                  />
                </div>
                <div>
                  <Label>Challenge Type</Label>
                  <Input
                    placeholder="Starter / Standard / Pro"
                    value={form.challenge_type}
                    onChange={(e) => setForm({ ...form, challenge_type: e.target.value })}
                    className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                    data-testid="contact-challenge"
                  />
                </div>
                <div>
                  <Label>Platform</Label>
                  <Input
                    placeholder="Zerodha / Dhan / Angel"
                    value={form.platform}
                    onChange={(e) => setForm({ ...form, platform: e.target.value })}
                    className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                    data-testid="contact-platform"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>{mode === "ticket" ? "Describe your issue" : "Message"}</Label>
              <Textarea
                required={mode === "ticket"}
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder={
                  mode === "ticket"
                    ? "Share order/account ID or details so our desk can resolve it quickly…"
                    : ""
                }
                className="bg-[var(--bg-1)] border-[var(--border-hi)] mt-2"
                data-testid="contact-message"
              />
            </div>

            <button
              disabled={busy}
              className="btn-amber rounded-full px-6 py-3 text-sm"
              data-testid="contact-submit"
            >
              {busy
                ? "Submitting…"
                : mode === "ticket"
                  ? "Generate Support Ticket"
                  : "Register Now"}
            </button>
          </form>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="glass-card p-6">
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider">
              Email
            </div>
            <div className="font-display text-xl mt-1 break-all">{c.email}</div>
          </div>

          <div
            className="glass-card p-6 border-[var(--accent)]/35"
            data-testid="contact-generate-ticket-card"
          >
            <div className="text-xs uppercase font-mono text-[var(--accent-hi)] tracking-wider">
              Support Desk
            </div>
            <div className="font-display text-xl mt-1">Generate Support Ticket</div>
            <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
              Need fast assistance on challenges, payouts, or KYC? Create a ticket and track updates
              from our support desk.
            </p>
            <button
              type="button"
              onClick={() => {
                setMode("ticket");
                const el = document.querySelector('[data-testid="ticket-subject"]');
                el?.focus();
              }}
              className="btn-amber rounded-full px-5 py-2 text-xs font-semibold mt-4"
              data-testid="contact-open-ticket-btn"
            >
              Generate Ticket →
            </button>
          </div>

          <div className="glass-card p-6">
            <div className="text-xs uppercase font-mono text-[var(--muted-2)] tracking-wider">
              Office
            </div>
            <div className="text-sm text-[var(--muted)] mt-2">{c.office}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
