import { useCallback, useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { useSettings } from "../../context/SettingsContext";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Loader2,
  AlertCircle,
  ArrowRight,
  History,
  Layers,
} from "lucide-react";

const QUICK_PROMPTS = [
  {
    label: "Festive Banner + Coupon",
    prompt:
      "Enable the top announcement bar promoting a limited-time 25% discount linking to /challenges, and create an active coupon code TRADE25 for 25% off.",
  },
  {
    label: "Update Hero & Brand Copy",
    prompt:
      "Rewrite the homepage hero headline, subtitle, and About section to focus on NSE, BSE, NIFTY 50, and BANK NIFTY intraday discipline with transparent 24-hour INR payouts.",
  },
  {
    label: "Adjust Evaluation & Risk Rules",
    prompt:
      "Set global evaluation_risk to 10% profit target, 4% daily loss limit, 15% max drawdown, 8 minimum trading days, 5 trades per day, and 75% funded profit split.",
  },
  {
    label: "Publish NSE/BSE Strategy Blog",
    prompt:
      "Create and publish a new educational blog article titled 'Mastering NIFTY & BANK NIFTY Risk Management in Funded Accounts' with actionable position-sizing tips.",
  },
  {
    label: "Add ₹10L Institutional Plan",
    prompt:
      "Create a new challenge plan named 'Institutional' with ₹10,00,000 account_size, ₹29,999 challenge_fee, 75% profit_share, 20% max_loss_limit, and 6 trades_per_day.",
  },
  {
    label: "Hide Videos & Stories",
    prompt:
      "Hide trader videos and success stories on the public website by disabling video_reviews.enabled, trust.stories_enabled, home_sections.trader_videos, and home_sections.success_stories.",
  },
];

export default function AdminAiEditor() {
  const { reload } = useSettings();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Describe any edit across the IndiFunded site — hero copy, contact/UPI details, section visibility, evaluation & risk rules, challenge plans, coupons, FAQ, or blog articles. Every proposed change shows a live diff before going live.",
    },
  ]);
  const [pending, setPending] = useState(null);
  const [autoApply, setAutoApply] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [revisions, setRevisions] = useState([]);
  const [restoringId, setRestoringId] = useState("");

  const loadRevisions = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/ai-revisions");
      setRevisions(Array.isArray(data) ? data : []);
    } catch {
      setRevisions([]);
    }
  }, []);

  useEffect(() => {
    loadRevisions();
  }, [loadRevisions]);

  const applyPlan = async (plan, labelText) => {
    setApplying(true);
    try {
      const { data } = await api.post("/admin/ai-apply", {
        label: labelText || plan.reply || "AI Site Update",
        settings_patch: plan.settings_patch || {},
        plan_actions: plan.plan_actions || [],
        blog_actions: plan.blog_actions || [],
        coupon_actions: plan.coupon_actions || [],
      });
      await reload(true);
      await loadRevisions();
      setPending(null);
      const parts = [];
      if (data.applied?.settings) parts.push("site settings");
      if (data.applied?.plans) parts.push(`${data.applied.plans} plan(s)`);
      if (data.applied?.blogs) parts.push(`${data.applied.blogs} blog(s)`);
      if (data.applied?.coupons) parts.push(`${data.applied.coupons} coupon(s)`);
      toast.success(`Live update applied (${parts.join(", ") || "saved"})`);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Applied live across the site (${parts.join(", ") || "updated"}). Snapshot ${data.revision_id} saved for one-click rollback.`,
        },
      ]);
    } catch (err) {
      const msg = formatApiError(err?.response?.data?.detail, "Failed to apply AI changes");
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setApplying(false);
    }
  };

  const submitPrompt = async (customText) => {
    const text = (customText ?? prompt).trim();
    if (!text || generating) return;
    setErrorMsg("");
    if (!customText) setPrompt("");

    const nextHistory = [...messages, { role: "user", text }];
    setMessages(nextHistory);
    setGenerating(true);

    try {
      const { data } = await api.post("/admin/ai-edit", {
        prompt: text,
        history: nextHistory.slice(-6),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          bullets: data.summary_bullets || [],
        },
      ]);
      if (autoApply) {
        await applyPlan(data, text);
      } else {
        setPending({ ...data, label: text });
      }
    } catch (err) {
      const msg = formatApiError(
        err?.response?.data?.detail,
        "Unable to generate site edits right now.",
      );
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const restoreRevision = async (revId) => {
    setRestoringId(revId);
    try {
      await api.post(`/admin/ai-rollback/${revId}`);
      await reload(true);
      toast.success("Site restored to selected snapshot");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Restored site settings, plans, blogs & coupons to snapshot ${revId}.`,
        },
      ]);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Rollback failed"));
    } finally {
      setRestoringId("");
    }
  };

  const pendingActionCount =
    (pending?.diffs?.length || 0) +
    (pending?.plan_actions?.length || 0) +
    (pending?.blog_actions?.length || 0) +
    (pending?.coupon_actions?.length || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl md:text-4xl text-white flex items-center gap-3">
            <Sparkles size={26} className="text-[var(--accent)]" />
            AI Site Studio
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Edit any part of IndiFunded A-to-Z with natural language — hero copy, navigation
            visibility, evaluation &amp; risk rules, challenge plans, coupons, FAQs, and blogs.
          </p>
        </div>

        <label className="flex items-center gap-2.5 text-xs text-[var(--muted)] border border-[var(--border-hi)] bg-[var(--bg-1)] px-3.5 py-2 rounded-xl cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoApply}
            onChange={(e) => setAutoApply(e.target.checked)}
            data-testid="ai-auto-apply-toggle"
          />
          <span>Auto-apply changes immediately</span>
        </label>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-[var(--rose)]/40 bg-[var(--rose)]/10 px-4 py-3 text-sm text-[var(--rose)] flex items-start gap-2.5"
          data-testid="ai-editor-error"
        >
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Quick Recipes */}
      <div className="card-panel p-4">
        <div className="text-xs font-mono text-[var(--muted-2)] mb-3">
          Quick A-to-Z edit recipes
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={generating}
              onClick={() => submitPrompt(q.prompt)}
              className="btn-ghost rounded-lg px-3 py-1.5 text-xs whitespace-nowrap hover:border-[var(--accent)] disabled:opacity-50"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
        {/* Left: Conversational Command Desk */}
        <section className="card-panel p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h2 className="font-display text-lg text-white">Instruction Console</h2>
            <span className="text-xs font-mono text-[var(--muted-2)]">
              Settings · Plans · Blogs · Coupons
            </span>
          </div>

          <div
            className="space-y-3 max-h-[420px] overflow-y-auto pr-1"
            data-testid="ai-chat-history"
          >
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`rounded-xl p-3.5 text-sm leading-relaxed border ${
                  m.role === "user"
                    ? "bg-[var(--accent)]/12 border-[var(--accent)]/30 text-white ml-6"
                    : "bg-[var(--bg-1)] border-[var(--border)] text-[var(--muted)] mr-4"
                }`}
              >
                <div className="text-[11px] font-mono text-[var(--muted-2)] mb-1">
                  {m.role === "user" ? "Admin" : "Site Editor AI"}
                </div>
                <div className="text-white/90">{m.text}</div>
                {Array.isArray(m.bullets) && m.bullets.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-[var(--muted)] list-disc pl-4">
                    {m.bullets.map((b, bi) => (
                      <li key={bi}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {generating && (
              <div className="rounded-xl p-3.5 text-sm bg-[var(--bg-1)] border border-[var(--border)] text-[var(--muted)] flex items-center gap-2.5">
                <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
                Drafting exact site updates…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitPrompt();
            }}
            className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-[var(--border)]"
          >
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitPrompt();
                }
              }}
              placeholder="e.g. Change brand tagline, update profit split to 75%, create FEST20 coupon, and turn on announcement bar…"
              className="input-dark flex-1 text-sm resize-none"
              data-testid="ai-prompt-input"
            />
            <button
              type="submit"
              disabled={generating || !prompt.trim()}
              className="btn-amber rounded-xl px-5 py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
              data-testid="ai-prompt-submit"
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Generate Edit
            </button>
          </form>
        </section>

        {/* Right: Change Preview & Snapshot Rollback */}
        <div className="space-y-6">
          <section className="card-panel p-5" data-testid="ai-diff-preview">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-[var(--accent)]" />
                <h2 className="font-display text-lg text-white">Change Inspector</h2>
              </div>
              {pending && (
                <span className="text-xs font-mono text-[var(--emerald)]">
                  {pendingActionCount} pending
                </span>
              )}
            </div>

            {!pending ? (
              <div className="text-sm text-[var(--muted)] py-8 text-center">
                Submit an instruction on the left to inspect exact Before → After changes across
                settings, plans, blogs, and coupons before publishing live.
              </div>
            ) : (
              <div className="space-y-4">
                {pending.diffs?.length > 0 && (
                  <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                    <table className="w-full text-xs dash-table tabular-nums">
                      <thead>
                        <tr>
                          <th className="text-left">Setting Path</th>
                          <th className="text-left">Current</th>
                          <th className="text-left">Proposed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pending.diffs.map((d) => (
                          <tr key={d.path}>
                            <td className="font-mono text-white">{d.path}</td>
                            <td className="text-[var(--muted-2)] max-w-[140px] truncate">
                              {d.before}
                            </td>
                            <td className="text-[var(--emerald)] max-w-[160px] truncate">
                              {d.after}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {[
                  ["Plans", pending.plan_actions],
                  ["Blogs", pending.blog_actions],
                  ["Coupons", pending.coupon_actions],
                ]
                  .filter(([, arr]) => Array.isArray(arr) && arr.length > 0)
                  .map(([title, arr]) => (
                    <div
                      key={title}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-1)] p-3"
                    >
                      <div className="text-xs font-mono text-white mb-2">
                        {title} Operations ({arr.length})
                      </div>
                      <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                        {arr.map((act, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <ArrowRight
                              size={12}
                              className="text-[var(--accent)] mt-0.5 shrink-0"
                            />
                            <span>
                              <strong className="text-white uppercase">{act.action}</strong>{" "}
                              {act.id ? `(${act.id}) ` : ""}
                              {act.data?.name || act.data?.title || act.data?.code || ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                <div className="flex flex-wrap gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={applying}
                    onClick={() => applyPlan(pending, pending.label)}
                    className="flex-1 btn-amber rounded-xl py-2.5 px-4 text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    data-testid="ai-apply-btn"
                  >
                    {applying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                    Apply Changes Live
                  </button>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={() => setPending(null)}
                    className="btn-ghost rounded-xl py-2.5 px-4 text-xs inline-flex items-center gap-1.5"
                  >
                    <Trash2 size={13} /> Discard
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="card-panel p-5">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3">
              <div className="flex items-center gap-2">
                <History size={16} className="text-[var(--accent)]" />
                <h2 className="font-display text-lg text-white">Saved Snapshots</h2>
              </div>
              <span className="text-xs font-mono text-[var(--muted-2)]">
                {revisions.length} backups
              </span>
            </div>
            {revisions.length === 0 ? (
              <p className="text-xs text-[var(--muted)] py-3">
                Snapshots are created automatically before every AI update so you can roll back any
                time.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {revisions.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-1)] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="text-white truncate">{r.label}</div>
                      <div className="text-[11px] font-mono text-[var(--muted-2)]">
                        {String(r.created_at || "")
                          .slice(0, 16)
                          .replace("T", " ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={restoringId === r.id}
                      onClick={() => restoreRevision(r.id)}
                      className="btn-ghost rounded-lg px-2.5 py-1 text-xs inline-flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw size={12} />
                      {restoringId === r.id ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
