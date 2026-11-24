import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { useSettings } from "../context/SettingsContext";
import { maskUtr, safeHttps, formatAmount } from "../lib/trust";
import { useOffscreenPause } from "../lib/useOffscreenPause";
import {
  ShieldCheck,
  Building2,
  Phone,
  Mail,
  MapPin,
  Instagram,
  Send,
  Headphones,
  BadgeCheck,
  Wallet,
  Users,
  UserCheck,
  TrendingUp,
  ArrowRight,
  Quote,
} from "lucide-react";

const STAT_ICONS = [Wallet, BadgeCheck, UserCheck, Users];

/** Counts up the numeric part of a value like "₹12,50,000" or "1,240+" once visible. */
function CountUp({ value }) {
  const text = String(value ?? "");
  const m = text.match(/[\d,]+(\.\d+)?/);
  const target = m ? Number(m[0].replace(/,/g, "")) : NaN;
  const [shown, setShown] = useState(isNaN(target) ? text : text.replace(m[0], "0"));
  const ref = useRef(null);
  useEffect(() => {
    if (isNaN(target)) {
      setShown(text);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let raf, start;
    const run = () => {
      const step = (t) => {
        start ??= t;
        const p = Math.min(1, (t - start) / 1200);
        const cur = Math.round(target * (1 - Math.pow(1 - p, 3)));
        setShown(text.replace(m[0], cur.toLocaleString("en-IN")));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    if (typeof IntersectionObserver === "undefined") {
      setShown(text);
      return undefined;
    }
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting) {
        run();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line
  }, [text]);
  return <span ref={ref}>{shown}</span>;
}

export function TrustStats({ stats }) {
  const list = (stats || []).filter((s) => s && s.label);
  if (!list.length) return null;
  return (
    <div className="trust-stats">
      {list.map((s, i) => {
        const Icon = STAT_ICONS[i % STAT_ICONS.length];
        return (
          <div key={i} className="trust-stat">
            <Icon className="trust-stat-icon" size={20} />
            <div className="font-display trust-stat-value">
              <CountUp value={s.value} />
            </div>
            <div className="trust-stat-label">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export function CompanyDetails({ company = {}, team = [], labels = {} }) {
  const ig = safeHttps(company.instagram),
    tg = safeHttps(company.telegram);
  const ids = [
    ["GST", company.gst],
    ["CIN", company.cin],
    ["PAN", company.pan],
  ].filter(([, v]) => v);
  const people = (team || []).filter((p) => p && p.name);
  return (
    <div className="trust-company">
      <div className="glass-card p-5 md:p-8">
        <div className="flex items-center gap-2 font-display text-xl mb-5">
          <Building2 size={18} className="text-[var(--accent)]" />{" "}
          {company.legal_name || labels.company_fallback_heading || "Company details"}
        </div>
        <div className="trust-id-grid">
          {ids.map(([k, v]) => (
            <div key={k} className="trust-id">
              <span>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <div className="trust-contact-list">
          {company.address && (
            <div>
              <MapPin size={15} /> {company.address}
            </div>
          )}
          {company.phone && (
            <a href={`tel:${company.phone.replace(/\s/g, "")}`}>
              <Phone size={15} /> {company.phone}
            </a>
          )}
          {company.email && (
            <a href={`mailto:${company.email}`}>
              <Mail size={15} /> {company.email}
            </a>
          )}
          {ig && (
            <a href={ig} target="_blank" rel="noopener noreferrer">
              <Instagram size={15} /> {labels.instagram_label || "Instagram"}
            </a>
          )}
          {tg && (
            <a href={tg} target="_blank" rel="noopener noreferrer">
              <Send size={15} /> {labels.telegram_label || "Telegram"}
            </a>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <div className="glass-card p-5 md:p-6 h-full">
          <div className="flex items-center gap-2 font-display text-lg mb-4">
            <Headphones size={17} className="text-[var(--accent)]" />{" "}
            {labels.support_team_heading || "Support team"}
          </div>
          {people.length ? (
            <ul className="trust-team">
              {people.map((p, i) => (
                <li key={i}>
                  <span className="trust-avatar" aria-hidden="true">
                    {p.name.trim()[0]}
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{[p.role, p.contact].filter(Boolean).join(" · ")}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {labels.support_team_empty_prefix || "Reach us any time at"}{" "}
              {company.email || labels.support_team_empty_fallback || "our support email"}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function PayoutProofs({ proofs, limit = undefined, labels = {} }) {
  const list = (proofs || []).filter((p) => p && p.enabled !== false && p.payout_id);
  if (!list.length) return null;
  return (
    <div className="trust-proofs">
      {(limit ? list.slice(0, limit) : list).map((p, i) => (
        <article key={i} className="trust-proof">
          <div className="trust-proof-top">
            <span className="trust-verified">
              <ShieldCheck size={14} /> {labels.verified_badge || "Verified payout"}
            </span>
            <span className="font-mono text-xs text-[var(--muted-2)]">{p.payout_id}</span>
          </div>
          <div className="font-display trust-proof-amount">{formatAmount(p.amount)}</div>
          <dl className="trust-proof-meta">
            <div>
              <dt>{labels.trader_id_label || "Trader ID"}</dt>
              <dd>{p.trader_id || "—"}</dd>
            </div>
            <div>
              <dt>{labels.account_id_label || "Account ID"}</dt>
              <dd>{p.account_id || "—"}</dd>
            </div>
            <div>
              <dt>{labels.requested_label || "Requested"}</dt>
              <dd>{p.request_date || "—"}</dd>
            </div>
            <div>
              <dt>{labels.paid_label || "Paid"}</dt>
              <dd>{p.payment_date || "—"}</dd>
            </div>
            <div>
              <dt>{labels.method_label || "Method"}</dt>
              <dd>{p.method || "—"}</dd>
            </div>
            <div>
              <dt>{labels.utr_label || "UTR"}</dt>
              <dd className="font-mono">{maskUtr(p.utr_last4)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export function SuccessStories({ stories, limit = undefined, labels = {} }) {
  const [marqueeRef, marqueePaused] = useOffscreenPause();
  const raw = (stories || []).filter((s) => s && s.enabled !== false && s.name && s.story);
  const list = limit ? raw.slice(0, limit) : raw;
  if (!list.length) return null;

  const baseTrack =
    list.length >= 4
      ? list
      : list.length === 1
        ? [list[0], list[0], list[0], list[0]]
        : [...list, ...list];

  return (
    <div
      ref={marqueeRef}
      className={`trust-stories-marquee-wrap ${marqueePaused ? "is-marquee-paused" : ""}`}
      data-testid="success-stories-marquee"
    >
      <div className="trust-stories-marquee-track">
        {[0, 1].map((loopIdx) =>
          baseTrack.map((s, i) => (
            <figure
              key={`${loopIdx}-${i}`}
              aria-hidden={loopIdx > 0}
              className="glass-card p-5 md:p-6 trust-story trust-story-card"
            >
              <Quote size={20} className="text-[var(--accent)]" />
              <blockquote>{s.story}</blockquote>
              <figcaption>
                <strong>{s.name}</strong>
                <span>{[s.city, s.plan].filter(Boolean).join(" · ")}</span>
                {s.payout && (
                  <em>
                    <TrendingUp size={13} /> {formatAmount(s.payout)}{" "}
                    {labels.withdrawn_label || "withdrawn"}
                  </em>
                )}
              </figcaption>
            </figure>
          )),
        )}
      </div>
    </div>
  );
}

/** Home page block: stats, latest payout proofs, success stories and company summary. */
export default function TrustSection() {
  const { settings } = useSettings();
  const t = settings.trust || {};
  const labels = t.labels || {};
  if (t.enabled === false) return null;
  return (
    <section className="home-band trust-band" aria-labelledby="trust-heading">
      <div className="container-xl">
        <div className="home-section-heading">
          <div>
            <div className="home-eyebrow">{labels.home_eyebrow || "Verified & registered"}</div>
            <h2 id="trust-heading" className="font-display">
              {t.heading}
            </h2>
            <p>{t.subtitle}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link
              to="/verify-payout"
              className="btn-amber rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2"
            >
              <ShieldCheck size={16} /> {labels.verify_cta || "Verify a payout"}
            </Link>
            <Link
              to="/trust"
              className="rounded-full px-5 py-2.5 text-sm border border-[var(--border-hi)] inline-flex items-center gap-2"
            >
              {labels.trust_center_cta || "Trust center"} <ArrowRight size={15} />
            </Link>
          </div>
        </div>
        <TrustStats stats={t.stats} />
        {(t.payout_proofs || []).some((p) => p?.enabled !== false && p?.payout_id) && (
          <>
            <h3 className="font-display text-2xl mt-12 mb-5">
              {labels.home_proofs_heading || "Genuine payout proofs"}
            </h3>
            <PayoutProofs proofs={t.payout_proofs} limit={6} labels={labels} />
          </>
        )}
        {t.stories_enabled !== false &&
          settings.home_sections?.success_stories !== false &&
          (t.stories || []).some((s) => s?.enabled !== false && s?.name) && (
            <>
              <h3 className="font-display text-2xl mt-12 mb-5">
                {labels.stories_heading || "Trader success stories"}
              </h3>
              <SuccessStories stories={t.stories} labels={labels} />
            </>
          )}
        <div className="mt-12">
          <CompanyDetails company={t.company} team={t.support_team} labels={labels} />
        </div>
      </div>
    </section>
  );
}
