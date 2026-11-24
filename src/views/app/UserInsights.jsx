import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Sparkles,
  Upload,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ListChecks,
  Trash2,
  FileText,
} from "lucide-react";
import { api, formatApiError } from "../../lib/api";
import { Textarea } from "../../components/ui/textarea";

const SAMPLE = `date,symbol,side,qty,entry,exit,pnl
2026-10-27,NIFTY 24500 CE,BUY,50,112.5,128.0,775
2026-10-27,BANKNIFTY 52000 PE,BUY,15,240,205,-525
2026-10-28,RELIANCE,BUY,20,2910,2932,440
2026-10-28,NIFTY 24600 CE,BUY,50,98,91,-350
2026-10-29,HDFCBANK,SELL,30,1688,1671,510`;

function ScoreRing({ score }) {
  const r = 34,
    c = 2 * Math.PI * r,
    off = c - (score / 100) * c;
  return (
    <div className="insight-score" aria-label={`Performance score ${score} out of 100`}>
      <svg viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} className="insight-score-track" />
        <circle
          cx="40"
          cy="40"
          r={r}
          className="insight-score-fill"
          strokeDasharray={c}
          strokeDashoffset={off}
        />
      </svg>
      <strong className="font-display">{score}</strong>
    </div>
  );
}

function InsightReport({ data, onDelete }) {
  return (
    <div className="card-panel p-6 md:p-8 mt-6" data-testid="insight-report">
      <div className="flex items-start gap-5 flex-wrap">
        <ScoreRing score={data.score} />
        <div className="flex-1 min-w-[220px]">
          <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
            {new Date(data.created_at).toLocaleString("en-IN")}
            {data.plan_name ? ` · ${data.plan_name} rules` : ""}
          </div>
          <h2 className="font-display text-2xl mt-1">{data.headline}</h2>
          <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{data.summary}</p>
        </div>
        {onDelete && (
          <button
            onClick={onDelete}
            className="btn-ghost rounded-lg p-2"
            aria-label="Delete this report"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {data.metrics?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {data.metrics.map((m, i) => (
            <div key={i} className="insight-metric">
              <span>{m.label}</span>
              <strong className="font-display">{m.value}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="insight-list insight-good">
          <h3>
            <TrendingUp size={16} /> Strengths
          </h3>
          <ul>
            {data.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div className="insight-list insight-warn">
          <h3>
            <TrendingDown size={16} /> Weak spots
          </h3>
          <ul>
            {data.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>
      {data.risk_flags?.length > 0 && (
        <div className="insight-list insight-risk mt-4">
          <h3>
            <AlertTriangle size={16} /> Risk & rule flags
          </h3>
          <ul>
            {data.risk_flags.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6">
        <h3 className="font-display text-lg flex items-center gap-2">
          <ListChecks size={18} className="text-[var(--accent)]" /> Your next steps
        </h3>
        <ol className="insight-steps mt-3">
          {data.next_steps.map((s, i) => (
            <li key={i}>
              <span>{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <p>{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-[11px] text-[var(--muted-2)] mt-6">
        AI-generated coaching for a simulated trading environment. Not investment advice.
      </p>
    </div>
  );
}

export default function UserInsights() {
  const [history, setHistory] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null);
  const [past, setPast] = useState([]);
  const fileRef = useRef(null);

  const load = () =>
    api
      .get("/me/insights")
      .then((r) => setPast(r.data))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 200_000) {
      toast.error("File is too large. Upload a CSV under 200 KB.");
      return;
    }
    setHistory(await f.text());
    toast.success(`Loaded ${f.name}`);
  };

  const analyze = async (e) => {
    e.preventDefault();
    if (history.trim().length < 20) {
      toast.error("Paste or upload your trading history first.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/me/insights", { history, notes });
      setCurrent(r.data);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "AI analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/me/insights/${id}`);
      if (current?.id === id) setCurrent(null);
      load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    }
  };

  return (
    <div>
      <div className="chip mb-3">
        <Sparkles size={12} /> AI coach
      </div>
      <h1 className="font-display text-3xl md:text-4xl">Performance insights</h1>
      <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
        Share your trading history and get a personal review: what's working, where you're leaking
        money, rule risks, and the next steps to pass your challenge.
      </p>

      <form onSubmit={analyze} className="card-panel p-6 mt-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <label htmlFor="history" className="text-sm font-medium">
            Trading history
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-2"
              onClick={() => setHistory(SAMPLE)}
            >
              <FileText size={14} /> Use sample
            </button>
            <button
              type="button"
              className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={14} /> Upload CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={onFile}
              data-testid="insights-file"
            />
          </div>
        </div>
        <Textarea
          id="history"
          value={history}
          onChange={(e) => setHistory(e.target.value)}
          rows={9}
          className="mt-3 font-mono text-xs"
          placeholder="Paste your tradebook export (CSV) or list trades: date, instrument, buy/sell, qty, entry, exit, P&L…"
          data-testid="insights-history"
        />
        <label htmlFor="notes" className="text-sm font-medium block mt-4">
          Anything we should know? <span className="text-[var(--muted-2)]">(optional)</span>
        </label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-2"
          placeholder="e.g. I mostly trade the first hour, struggling with revenge trades"
        />
        <div className="flex items-center justify-between flex-wrap gap-3 mt-5">
          <span className="text-[11px] text-[var(--muted-2)]">
            {history.length.toLocaleString("en-IN")} / 30,000 characters
          </span>
          <button
            type="submit"
            disabled={busy}
            className="btn-amber rounded-full px-6 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-60"
            data-testid="insights-submit"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Analysing…
              </>
            ) : (
              <>
                <Sparkles size={14} /> Get my insights
              </>
            )}
          </button>
        </div>
      </form>

      {current && <InsightReport data={current} onDelete={() => remove(current.id)} />}

      {past.filter((p) => p.id !== current?.id).length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-xl">Past reports</h2>
          <div className="grid gap-3 mt-4">
            {past
              .filter((p) => p.id !== current?.id)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCurrent(p)}
                  className="card-panel p-4 text-left flex items-center gap-4 hover:border-[var(--accent)]"
                >
                  <span className="font-display text-2xl text-[var(--accent)] w-12">{p.score}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{p.headline}</span>
                    <span className="block text-[11px] text-[var(--muted-2)]">
                      {new Date(p.created_at).toLocaleString("en-IN")}
                    </span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
