import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { api, formatINR } from "../../lib/api";
import { Receipt, Plus, FileText } from "lucide-react";

export default function UserInvoices() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    api
      .get("/me/billing")
      .then((r) => {
        setRows(Array.isArray(r.data) ? r.data : []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const filtered = rows.filter((r) => {
    if (filter === "paid") return r.status === "completed";
    if (filter === "pending")
      return r.status === "pending_payment" || r.status === "pending_verification";
    return true;
  });

  const totalSpent = rows
    .filter((r) => r.status === "completed")
    .reduce((s, r) => s + Number(r.amount || 0), 0);

  const badge = (s) => {
    if (s === "completed") return <span className="status-pill is-ok">Paid</span>;
    if (s === "rejected") return <span className="status-pill is-bad">Rejected</span>;
    return <span className="status-pill is-wait">Pending</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)]">
            Invoices
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Billing records and payment receipts for your challenge purchases.
          </p>
        </div>
        <Link
          to="/challenges"
          className="btn-amber rounded-xl px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <Plus size={14} /> Buy new account
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="seg">
          {[
            ["all", `All (${rows.length})`],
            ["paid", "Paid"],
            ["pending", "Pending"],
          ].map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={filter === k ? "is-on" : ""}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="text-xs font-mono text-[var(--muted)] tabular-nums">
          Total paid: <strong className="text-[var(--text)]">{formatINR(totalSpent)}</strong>
        </div>
      </div>

      {!loaded ? (
        <div className="card-panel p-8 text-center text-[var(--muted)]">Loading invoices…</div>
      ) : filtered.length ? (
        <div className="card-panel overflow-x-auto">
          <table className="w-full text-sm dash-table tabular-nums">
            <thead>
              <tr>
                <th className="text-left">Invoice ID</th>
                <th className="text-left">Date</th>
                <th className="text-left">Item</th>
                <th className="text-left">Type</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={b.id || i}>
                  <td className="font-mono text-xs text-[var(--muted-2)]">
                    <span className="inline-flex items-center gap-1.5">
                      <FileText size={13} className="text-[var(--emerald)]" />
                      {String(b.id || `INV-${i + 1}`).slice(0, 14)}
                    </span>
                  </td>
                  <td className="text-xs text-[var(--muted)]">
                    {b.created_at
                      ? new Date(b.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="font-medium text-[var(--text)]">{b.product}</td>
                  <td className="text-xs font-mono uppercase text-[var(--muted-2)]">
                    {b.kind || "challenge"}
                  </td>
                  <td className="text-right font-mono font-semibold text-[var(--text)]">
                    {formatINR(b.amount)}
                  </td>
                  <td className="text-right">{badge(b.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-panel p-12 text-center">
          <Receipt size={36} className="mx-auto text-[var(--muted-2)]" />
          <div className="font-display text-xl font-semibold text-[var(--text)] mt-4">
            No invoices yet
          </div>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-md mx-auto">
            Your challenge purchases and receipts will appear here once you enroll in an evaluation.
          </p>
        </div>
      )}
    </div>
  );
}
