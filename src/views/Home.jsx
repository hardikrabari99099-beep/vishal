import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { api } from "../lib/api";
import { DEFAULT_PLANS } from "../lib/default-plans";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import ChallengePicker from "../components/ChallengePicker";
import ClientReviews from "../components/ClientReviews";
import WeeklyHighestPayout from "../components/WeeklyHighestPayout";
import {
  TrustStats,
  PayoutProofs,
  SuccessStories,
  CompanyDetails,
} from "../components/TrustSection";
import {
  ProductCards,
  PlatformPreview,
  MonthlyLeaderboard,
  WhyChoose,
} from "../components/HomeSections";
import { HeroFX, Ticker } from "../components/HeroFX";
import { useReveal } from "../lib/useReveal";
import {
  ArrowRight,
  ShieldCheck,
  Trophy,
  Wallet,
  Target,
  Headphones,
  ChevronDown,
  BookOpen,
} from "lucide-react";

export default function Home() {
  const { settings, syncVersion } = useSettings();
  const { user } = useAuth();
  const [plans, setPlans] = useState(DEFAULT_PLANS);
  useEffect(() => {
    api
      .get("/plans")
      .then((r) => {
        if (Array.isArray(r.data) && r.data.length > 0) setPlans(r.data);
      })
      .catch(() => {});
  }, [syncVersion]);
  const h = settings.hero || {};
  const hc = settings.home_copy || {};
  const trustLabels = settings.trust?.labels || {};
  const sections = settings.home_sections || {};
  const href = user ? "/challenges" : "/login?next=/challenges";
  const show = (name) => sections[name] !== false;
  const faqs = (settings.faq_groups || []).flatMap((group) => group.items || []).slice(0, 6);
  const assurances =
    Array.isArray(h.assurances) && h.assurances.length >= 3
      ? h.assurances
      : ["Clear challenge rules", "One-time fee", "Trader support"];
  useReveal([]);
  return (
    <div className="funded-home">
      <section className="home-hero">
        <HeroFX />
        <div className="container-xl home-hero-inner">
          <div className="home-eyebrow">
            <span className="home-status-dot" /> {h.chip}
          </div>
          <div className="home-brand-name">
            {h.brand_name || settings.brand?.name || "IndiFunded"}
          </div>
          <h1 className="font-display">
            {h.title_before}
            <br />
            <span>{h.title_highlight}</span> {h.title_after}
          </h1>
          <p className="home-hero-subtitle">{h.subtitle}</p>
          <div className="flex flex-wrap justify-center gap-3 mt-7">
            <Button asChild size="lg" className="home-primary-cta">
              <Link to="/challenges" data-testid="hero-cta-primary">
                {h.cta_primary || "Explore Challenges"} <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/how-it-works" data-testid="hero-cta-secondary">
                {h.cta_secondary || "How It Works"} <BookOpen />
              </Link>
            </Button>
          </div>
          <div className="home-assurances">
            <span>
              <ShieldCheck /> {assurances[0]}
            </span>
            <span>
              <Wallet /> {assurances[1]}
            </span>
            <span>
              <Headphones /> {assurances[2]}
            </span>
          </div>
          <div className="home-hero-stats">
            {(h.stats || []).map((stat, i) => (
              <div key={i} data-testid={`hero-stat-${i}`}>
                <strong className="font-display">{stat.k}</strong>
                <span>{stat.v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Ticker />
      {show("trust") && (
        <section data-reveal="scale" className="home-band home-stats-band">
          <div className="container-xl">
            <TrustStats stats={settings.trust?.stats} />
          </div>
        </section>
      )}
      {show("plans") && (
        <>
          <ProductCards plans={plans} href={href} />
          <ChallengePicker plans={plans} href={href} />
        </>
      )}
      {show("steps") && (
        <section data-reveal className="home-band">
          <div className="container-xl">
            <div className="home-section-heading">
              <div>
                <div className="home-eyebrow">{settings.steps?.eyebrow || "How it works"}</div>
                <h2 className="font-display">
                  {settings.steps.title_prefix}
                  <br />
                  {settings.steps.title_suffix}
                </h2>
                <p>
                  {settings.steps?.subtitle ||
                    "Choose your account. Read the rules. Make your next move."}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/how-it-works">
                  {settings.steps?.cta_label || "The full journey"} <ArrowRight />
                </Link>
              </Button>
            </div>
            <div className="home-steps">
              {(settings.steps.items || []).map((step, i) => {
                const Icon = [Target, ShieldCheck, Trophy][i] || Target;
                return (
                  <div
                    data-reveal="flip"
                    data-reveal-delay={String(Math.min(4, i + 1))}
                    className="home-step tx-morph"
                    key={i}
                  >
                    <div className="home-step-top">
                      <span>STEP {step.n}</span>
                      <Icon />
                    </div>
                    <h3 className="font-display">{step.t}</h3>
                    <p>{step.d}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
      <PlatformPreview />
      {show("payouts") && (
        <section data-reveal="wipe" className="home-band">
          <div className="container-xl">
            <div className="home-section-heading">
              <div>
                <div className="home-eyebrow">{hc.latest_payouts_eyebrow || "Latest payouts"}</div>
                <h2 className="font-display">
                  {hc.latest_payouts_heading || "Paid, and verifiable"}
                </h2>
                <p>
                  {hc.latest_payouts_subtitle ||
                    "Each published payout can be checked with its Payout ID."}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/verify-payout">
                  {hc.latest_payouts_cta || "Verify a payout"} <ArrowRight />
                </Link>
              </Button>
            </div>
            <PayoutProofs
              proofs={settings.trust?.payout_proofs}
              limit={3}
              labels={trustLabels}
            />
          </div>
        </section>
      )}
      {show("payouts") && (
        <div data-reveal="zoom" className="home-proof-band">
          <WeeklyHighestPayout />
        </div>
      )}
      <MonthlyLeaderboard />
      {show("success_stories") &&
        show("trust") &&
        settings.trust?.stories_enabled !== false &&
        (settings.trust?.stories || []).some((x) => x?.enabled !== false && x?.name) && (
          <section data-reveal="slide-left" className="home-band">
            <div className="container-xl">
              <div className="home-section-heading">
                <div>
                  <div className="home-eyebrow">
                    {trustLabels.home_eyebrow || "Verified & registered"}
                  </div>
                  <h2 className="font-display">
                    {trustLabels.stories_heading || "Trader success stories"}
                  </h2>
                </div>
              </div>
              <SuccessStories stories={settings.trust?.stories} labels={trustLabels} />
            </div>
          </section>
        )}
      {show("reviews") && <ClientReviews />}
      {show("benefits") && <WhyChoose />}
      {show("faq") && (
        <section data-reveal className="home-band">
          <div className="container-xl home-faq-layout">
            <div>
              <div className="home-eyebrow">{hc.faq_eyebrow || "The details matter"}</div>
              <h2 className="font-display">
                {hc.faq_heading_line1 || "Questions?"}
                <br />
                {hc.faq_heading_line2 || "Let's clear them up."}
              </h2>
              <Button asChild variant="link" className="px-0 mt-4">
                <Link to="/faq">
                  {hc.faq_cta || "All questions"} <ArrowRight />
                </Link>
              </Button>
            </div>
            <div>
              {faqs.map((faq, i) => (
                <details className="home-faq" key={i}>
                  <summary>
                    {faq.q}
                    <ChevronDown size={18} />
                  </summary>
                  <p>{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}
      <section data-reveal="3d" className="home-closing">
        <div className="container-xl parallax-layer" data-parallax="0.06">
          <div className="home-eyebrow">{hc.closing_eyebrow || "Your next move"}</div>
          <h2 className="font-display">
            {hc.closing_title_prefix || "Start your"}
            <br />
            <span>{hc.closing_title_highlight || "IndiFunded"}</span>{" "}
            {hc.closing_title_suffix || "challenge."}
          </h2>
          <Button asChild size="lg" className="home-primary-cta mt-7 tx-morph">
            <Link to={href}>
              {hc.closing_cta || "Choose your challenge"} <ArrowRight />
            </Link>
          </Button>
          <p>{hc.closing_subtitle || "Read the rules. Find your plan. Trade with purpose."}</p>
        </div>
      </section>
      {show("trust") && (
        <section data-reveal="fade" className="home-band home-company-band" aria-labelledby="company-heading">
          <div className="container-xl">
            <div className="home-section-heading">
              <div>
                <div className="home-eyebrow">
                  {trustLabels.company_band_eyebrow || "Company & transparency"}
                </div>
                <h2 id="company-heading" className="font-display">
                  {trustLabels.company_band_heading || "Who you are trading with"}
                </h2>
              </div>
              <Button asChild variant="outline">
                <Link to="/trust">
                  {trustLabels.trust_center_cta || "Trust center"} <ArrowRight />
                </Link>
              </Button>
            </div>
            <CompanyDetails
              company={settings.trust?.company}
              team={settings.trust?.support_team}
              labels={trustLabels}
            />
          </div>
        </section>
      )}
    </div>
  );
}
