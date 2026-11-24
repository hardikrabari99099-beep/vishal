import { useEffect, useState } from "react";
import { api, formatINR, formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { toast } from "sonner";
import { Copy, Check, Share2, Users, Wallet, Gift, CheckCircle2 } from "lucide-react";

export default function UserReferral() {
  const { user } = useAuth();
  const [referral, setReferral] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    api
      .get("/me/referrals")
      .then((r) => {
        setReferral(r.data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const generateCode = async () => {
    if (!user?.email) return;
    setCreating(true);
    try {
      const { data } = await api.post("/referrals", {
        name: user.name || user.email.split("@")[0],
        email: user.email,
        phone: user.phone || "",
      });
      setReferral(data);
      toast.success("Referral code activated");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Could not generate referral code"));
    } finally {
      setCreating(false);
    }
  };

  const shareUrl =
    referral && typeof window !== "undefined"
      ? `${window.location.origin}/challenges?ref=${referral.code}`
      : "";

  const copyVal = (text, key) => {
    try {
      navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copied");
      setTimeout(() => setCopied(""), 1800);
    } catch {
      // ignore
    }
  };

  const shareNow = async () => {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Trade funded capital with IndiFunded",
          text: `Use my referral code ${referral.code} for 5% off your evaluation challenge fee!`,
          url: shareUrl,
        });
        return;
      } catch {
        // fallback copy
      }
    }
    copyVal(shareUrl, "link");
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--emerald)]">
          Partner Program
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)] mt-1">
          Refer a friend
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Share your unique referral link. Friends save 5% on challenge plans and you earn rewards
          per purchase.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid sm:grid-cols-3 gap-4 tabular-nums">
        <div className="card-panel p-5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            <span>Total referrals</span>
            <Users size={15} className="text-[var(--emerald)]" />
          </div>
          <div className="font-display text-3xl font-semibold text-[var(--text)] mt-2.5">
            {referral?.referrals_count || 0}
          </div>
        </div>
        <div className="card-panel p-5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            <span>Earnings accrued</span>
            <Wallet size={15} className="text-[var(--emerald)]" />
          </div>
          <div className="font-display text-3xl font-semibold text-[var(--emerald)] mt-2.5">
            {formatINR(referral?.earnings || 0)}
          </div>
        </div>
        <div className="card-panel p-5">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
            <span>Friend discount</span>
            <Gift size={15} className="text-amber-400" />
          </div>
          <div className="font-display text-3xl font-semibold text-[var(--text)] mt-2.5">5% OFF</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        <div className="card-panel p-6">
          {!loaded ? (
            <div className="py-10 text-center text-sm text-[var(--muted)]">Loading partner details…</div>
          ) : referral ? (
            <div className="space-y-5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  Your unique referral code
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 p-4 rounded-xl border border-[var(--border-hi)] bg-[var(--bg-2)]">
                  <span className="font-mono text-2xl font-semibold text-[var(--emerald)] tracking-wider">
                    {referral.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyVal(referral.code, "code")}
                    className="btn-ghost rounded-xl px-3.5 py-2 text-xs inline-flex items-center gap-1.5"
                  >
                    {copied === "code" ? <Check size={13} /> : <Copy size={13} />}
                    {copied === "code" ? "Copied" : "Copy code"}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--muted-2)]">
                  Shareable invite link
                </div>
                <div className="mt-2 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] font-mono text-xs text-[var(--text)] break-all">
                  {shareUrl}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => copyVal(shareUrl, "link")}
                    className="btn-ghost rounded-xl px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    {copied === "link" ? <Check size={13} /> : <Copy size={13} />} Copy link
                  </button>
                  <button
                    type="button"
                    onClick={shareNow}
                    className="btn-amber rounded-xl px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Share2 size={13} /> Share link
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-4">
              <div className="font-display text-xl font-semibold text-[var(--text)]">
                Activate your referral code
              </div>
              <p className="text-sm text-[var(--muted)]">
                Generate your personal partner code linked to <strong className="text-[var(--text)]">{user?.email}</strong> in one click.
              </p>
              <button
                type="button"
                disabled={creating}
                onClick={generateCode}
                className="btn-amber rounded-xl px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                <Gift size={14} /> {creating ? "Activating…" : "Generate my referral code"}
              </button>
            </div>
          )}
        </div>

        <div className="card-panel p-6 space-y-4">
          <h2 className="font-display text-lg font-semibold text-[var(--text)]">How it works</h2>
          {[
            ["Share your link", "Send your referral code or link to fellow NSE & BSE traders."],
            ["They get 5% off", "Your referral code automatically discounts any challenge purchase."],
            ["Earn 5% commission", "Commission credits accrue to your partner wallet on each signup."],
            ["Fast monthly settlement", "Withdraw partner earnings alongside funded account payouts."],
          ].map(([t, d]) => (
            <div key={t} className="flex items-start gap-3">
              <CheckCircle2 size={15} className="text-[var(--emerald)] shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-[var(--text)]">{t}</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
