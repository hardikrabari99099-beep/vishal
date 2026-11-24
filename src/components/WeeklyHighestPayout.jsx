import { useEffect, useState } from "react";
import { api, formatINR } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { useOffscreenPause } from "../lib/useOffscreenPause";
import { Trophy, Award } from "lucide-react";

let cachedWeeklyPayouts = null;

export default function WeeklyHighestPayout() {
  const { settings, syncVersion } = useSettings();
  const hc = settings.home_copy || {};
  const [rows, setRows] = useState(() => cachedWeeklyPayouts || []);
  const [marqueeRef, marqueePaused] = useOffscreenPause();
  useEffect(() => {
    let alive = true;
    api
      .get("/weekly-highest-payouts")
      .then((r) => {
        const list = r.data || [];
        cachedWeeklyPayouts = list;
        if (alive) setRows(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [syncVersion]);

  if (!rows.length) return null;

  const baseTrack =
    rows.length >= 4
      ? rows
      : rows.length === 1
        ? [rows[0], rows[0], rows[0], rows[0]]
        : [...rows, ...rows];

  return (
    <section className="container-xl py-12 md:py-24" data-testid="weekly-highest-payout">
      <div className="mb-8 md:mb-12">
        <div className="chip mb-4">
          <Trophy size={12} /> {hc.weekly_chip || "Weekly Highest Payout"}
        </div>
        <h2 className="font-display text-3xl md:text-5xl max-w-3xl">
          {hc.weekly_heading || "This week's top winners, by plan"}
        </h2>
        <p className="text-[var(--muted)] mt-3 max-w-2xl text-sm md:text-base">
          {hc.weekly_subtitle ||
            "Highest payouts from IndiFunded traders in the last 7 days — the leaderboard resets every Monday."}
        </p>
      </div>
      <div
        ref={marqueeRef}
        className={`whp-marquee-wrap ${marqueePaused ? "is-marquee-paused" : ""}`}
        data-testid="weekly-highest-payout-scroll"
      >
        <div className="whp-marquee-track">
          {[0, 1].map((loopIdx) =>
            baseTrack.map((r, i) => (
              <div
                key={`${loopIdx}-${i}`}
                aria-hidden={loopIdx > 0}
                className="glass-card hover-lift overflow-hidden whp-card"
                data-testid={loopIdx === 0 && i < rows.length ? `whp-${i}` : undefined}
              >
                {r.image_url ? (
                  <div className="relative aspect-[4/3] bg-[var(--bg-1)] overflow-hidden">
                    <img
                      src={r.image_url}
                      alt={`${r.trader_name || "Trader"} payout certificate`}
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent pointer-events-none" />
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1 bg-[rgba(6,7,9,0.65)] border border-[var(--border-hi)] backdrop-blur">
                      <Award size={12} className="text-[var(--accent)]" />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-white/90">
                        {hc.weekly_badge || "Top of the Week"}
                      </span>
                    </div>
                  </div>
                ) : null}
                <div className="p-5 md:p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
                        Plan
                      </div>
                      <div className="font-display text-lg mt-1 text-white">{r.plan || "—"}</div>
                      {r.account_size ? (
                        <div className="text-xs text-[var(--muted)] mt-1">
                          Account {formatINR(r.account_size)}
                        </div>
                      ) : null}
                    </div>
                    {!r.image_url && (
                      <div className="w-10 h-10 rounded-xl grid place-items-center border border-[var(--border-hi)] text-[var(--accent)]">
                        <Award size={18} />
                      </div>
                    )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
                      Highest payout
                    </div>
                    <div className="font-display text-2xl md:text-4xl text-[var(--accent)] pulse-accent mt-1 tabular-nums">
                      {formatINR(r.amount || 0)}
                    </div>
                    <div className="text-xs text-[var(--muted)] mt-2">
                      by <span className="text-white/90">{r.trader_name || "Anonymous"}</span>
                      {r.payout_date ? <span> · {r.payout_date}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            )),
          )}
        </div>
      </div>
    </section>
  );
}
