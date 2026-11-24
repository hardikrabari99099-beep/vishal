import { useEffect, useState } from "react";
import { api, formatINR, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { CheckCircle2, Wallet, ShieldCheck } from "lucide-react";

export default function UserPayouts() {
  const { user, refresh } = useAuth();
  const [data, setData] = useState(null);
  const [kyc, setKyc] = useState({
    full_name: user?.name || "",
    pan: "",
    aadhaar: "",
    upi_id: "",
    bank_account_number: "",
    ifsc: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/me/payouts")
      .then((r) => setData(r.data))
      .catch(() => {});
    if (user?.kyc) setKyc((k) => ({ ...k, ...user.kyc }));
  }, [user]);

  const saveKyc = async (e) => {
    e.preventDefault();
    if (!kyc.full_name || !kyc.pan) {
      toast.error("Full name and PAN are required");
      return;
    }
    setSaving(true);
    try {
      await api.put("/me/kyc", kyc);
      await refresh();
      toast.success("KYC submitted for review");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s) => {
    const map = {
      pending: { bg: "rgba(245,182,56,0.15)", text: "#e8b04a", label: "Pending" },
      approved: { bg: "rgba(41,211,154,0.15)", text: "var(--emerald)", label: "Approved" },
      paid: { bg: "rgba(41,211,154,0.15)", text: "var(--emerald)", label: "Paid" },
      rejected: { bg: "rgba(255,85,116,0.15)", text: "var(--rose)", label: "Rejected" },
    };
    const m = map[s] || map.pending;
    return (
      <span
        className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full"
        style={{ background: m.bg, color: m.text }}
      >
        {m.label}
      </span>
    );
  };

  const alreadySubmitted = !!user?.kyc?.submitted_at;
  const kycVerified = user?.kyc?.status === "verified";
  const hasPayoutMethod = Boolean(kyc.upi_id?.trim() || (kyc.bank_account_number?.trim() && kyc.ifsc?.trim()));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)]">
          Payouts
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Withdraw your funded profit share via UPI or IMPS/NEFT bank transfer.
        </p>
      </div>

      {/* 3 KPI Strip */}
      <div className="grid md:grid-cols-3 gap-4 tabular-nums">
        <div className="card-panel p-5">
          <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
            Eligible now
          </div>
          <div className="font-display text-3xl font-semibold text-[var(--emerald)] mt-2.5">
            {formatINR(data?.eligible || 0)}
          </div>
        </div>
        <div className="card-panel p-5">
          <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
            In flight
          </div>
          <div className="font-display text-3xl font-semibold text-[var(--text)] mt-2.5">
            {formatINR(data?.pending_amount || 0)}
          </div>
        </div>
        <div className="card-panel p-5">
          <div className="text-[10px] uppercase tracking-widest font-mono text-[var(--muted-2)]">
            Total payouts paid
          </div>
          <div className="font-display text-3xl font-semibold text-[var(--text)] mt-2.5">
            {formatINR(data?.total_paid || 0)}
          </div>
        </div>
      </div>

      {/* 2-Column Lower Section: KYC Checklist + Payout History */}
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        <div className="card-panel p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={18} className="text-[var(--emerald)]" />
              <div>
                <h2 className="font-display text-lg font-semibold text-[var(--text)]">
                  KYC verification
                </h2>
                <p className="text-xs text-[var(--muted)]">Required before your first payout.</p>
              </div>
            </div>
            {alreadySubmitted && (
              <span className="status-pill is-ok">{kycVerified ? "Verified" : "Submitted"}</span>
            )}
          </div>

          <form onSubmit={saveKyc} className="space-y-6 mt-5">
            {/* Step 1: Verify identity */}
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-6 h-6 rounded-full text-xs font-mono grid place-items-center ${
                    alreadySubmitted
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-2)] border border-[var(--border-hi)] text-[var(--text)]"
                  }`}
                >
                  {alreadySubmitted ? <CheckCircle2 size={13} /> : "1"}
                </span>
                <div>
                  <div className="text-xs font-semibold text-[var(--text)]">
                    Verify your identity
                  </div>
                  <div className="text-[11px] text-[var(--muted-2)]">
                    PAN &amp; legal name matching your payout bank account
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pl-8">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                    Full legal name
                  </label>
                  <input
                    className="input-dark mt-1.5"
                    value={kyc.full_name}
                    onChange={(e) => setKyc({ ...kyc, full_name: e.target.value })}
                    data-testid="kyc-name"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                    PAN
                  </label>
                  <input
                    className="input-dark mt-1.5 uppercase"
                    value={kyc.pan}
                    onChange={(e) => setKyc({ ...kyc, pan: e.target.value.toUpperCase() })}
                    placeholder="ABCDE1234F"
                    data-testid="kyc-pan"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                    Aadhaar number (optional)
                  </label>
                  <input
                    className="input-dark mt-1.5"
                    value={kyc.aadhaar || ""}
                    onChange={(e) => setKyc({ ...kyc, aadhaar: e.target.value })}
                    placeholder="12-digit Aadhaar"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Payout account */}
            <div className="space-y-3 pt-4 border-t border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-6 h-6 rounded-full text-xs font-mono grid place-items-center ${
                    alreadySubmitted && hasPayoutMethod
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--bg-2)] border border-[var(--border-hi)] text-[var(--text)]"
                  }`}
                >
                  {alreadySubmitted && hasPayoutMethod ? <CheckCircle2 size={13} /> : "2"}
                </span>
                <div>
                  <div className="text-xs font-semibold text-[var(--text)]">
                    Add your payout account
                  </div>
                  <div className="text-[11px] text-[var(--muted-2)]">
                    UPI ID and/or Indian bank account for IMPS settlement
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 pl-8">
                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                    UPI ID (optional)
                  </label>
                  <input
                    className="input-dark mt-1.5"
                    value={kyc.upi_id}
                    onChange={(e) => setKyc({ ...kyc, upi_id: e.target.value })}
                    placeholder="yourname@upi"
                    data-testid="kyc-upi"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                    Bank account no.
                  </label>
                  <input
                    className="input-dark mt-1.5"
                    value={kyc.bank_account_number}
                    onChange={(e) => setKyc({ ...kyc, bank_account_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                    IFSC
                  </label>
                  <input
                    className="input-dark mt-1.5 uppercase"
                    value={kyc.ifsc}
                    onChange={(e) => setKyc({ ...kyc, ifsc: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--border)]">
              <p className="text-[11px] text-[var(--muted-2)]">
                Stored securely and used strictly for payout verification.
              </p>
              <button
                disabled={saving}
                className="btn-amber rounded-xl px-5 py-2.5 text-xs font-semibold disabled:opacity-60 shrink-0"
                data-testid="kyc-submit"
              >
                {saving ? "Submitting…" : "Submit KYC"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Payout History */}
        <div className="card-panel p-6">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
            <h2 className="font-display text-lg font-semibold text-[var(--text)]">
              Payout history
            </h2>
            <Wallet size={16} className="text-[var(--emerald)]" />
          </div>

          {data?.history?.length ? (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm dash-table tabular-nums">
                <thead>
                  <tr>
                    <th className="text-left !px-2">Date</th>
                    <th className="text-left !px-2">Amount</th>
                    <th className="text-left !px-2">Method</th>
                    <th className="text-right !px-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((p, i) => (
                    <tr key={p.id || i}>
                      <td className="text-xs text-[var(--muted)] !px-2">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="font-mono text-[var(--emerald)] font-medium !px-2">
                        {formatINR(p.amount)}
                      </td>
                      <td className="text-xs uppercase !px-2">{p.method || "—"}</td>
                      <td className="text-right !px-2">{statusBadge(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center">
              <div className="font-display text-base font-medium text-[var(--text)]">
                No payouts yet
              </div>
              <p className="text-xs text-[var(--muted)] mt-1.5 max-w-xs mx-auto">
                Once you complete evaluation and request a payout, live settlement updates appear
                here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
