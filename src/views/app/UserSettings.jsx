import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { api, formatINR, formatApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, LogOut, LifeBuoy, Sun, Moon, Monitor, KeyRound, Eye, EyeOff } from "lucide-react";

export default function UserSettings() {
  const { user, refresh, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const [profile, setProfile] = useState({ name: user?.name || "", phone: user?.phone || "" });
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState([]);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api
      .get("/me/billing")
      .then((r) => setBilling(r.data || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    setProfile({ name: user?.name || "", phone: user?.phone || "" });
  }, [user]);

  const save = async (e) => {
    e.preventDefault();
    if (!profile.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!profile.phone.trim()) {
      toast.error("Mobile number is required — it's how our team reaches you");
      return;
    }
    setSaving(true);
    try {
      await api.put("/me/profile", profile);
      await refresh();
      toast.success("Profile updated");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSavingPw(true);
    try {
      await api.post("/me/password", { password: newPassword });
      supabase.auth.updateUser({ password: newPassword }).catch(() => {});
      setNewPassword("");
      await refresh();
      toast.success("Website login password updated");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail, "Could not update password"));
    } finally {
      setSavingPw(false);
    }
  };

  const statusBadge = (s) => {
    const map = {
      pending_payment: { bg: "rgba(245,182,56,0.15)", text: "#e8b04a", label: "pending" },
      pending_verification: { bg: "rgba(245,182,56,0.15)", text: "#e8b04a", label: "pending" },
      completed: { bg: "rgba(41,211,154,0.15)", text: "var(--emerald)", label: "paid" },
      rejected: { bg: "rgba(255,85,116,0.15)", text: "var(--rose)", label: "rejected" },
    };
    const m = map[s] || map.pending_payment;
    return (
      <span
        className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full"
        style={{ background: m.bg, color: m.text }}
      >
        {m.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[var(--text)]">
          Settings
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Manage your profile, appearance, and account details.
        </p>
      </div>

      {/* Appearance */}
      <div className="card-panel p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--text)]">Appearance</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Switch between Dark, Light, or System theme across your portal and Web Terminal.
          </p>
        </div>
        <div className="seg">
          {[
            { id: "light", label: "Light", Icon: Sun },
            { id: "dark", label: "Dark", Icon: Moon },
            { id: "system", label: "System", Icon: Monitor },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTheme(id)}
              className={`inline-flex items-center gap-1.5 ${theme === id ? "is-on" : ""}`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div className="card-panel p-6 md:p-7">
        <h2 className="font-display text-lg font-semibold text-[var(--text)]">Profile</h2>
        <p className="text-xs text-[var(--muted)] mt-1">Update your personal details.</p>
        <form onSubmit={save} className="grid md:grid-cols-2 gap-4 mt-5">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
              Full name
            </label>
            <input
              className="input-dark mt-1.5"
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              data-testid="settings-name"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
              Mobile number
            </label>
            <input
              className="input-dark mt-1.5"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              placeholder="+91 9XXXXXXXXX"
              data-testid="settings-phone"
            />
            <p className="text-[10px] text-[var(--muted-2)] mt-1">
              Required — it&apos;s how our team reaches you about your account.
            </p>
          </div>
          <div className="md:col-span-2">
            <button
              disabled={saving}
              className="btn-amber rounded-xl px-5 py-2.5 text-xs font-semibold disabled:opacity-60"
              data-testid="settings-save"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Billing Summary */}
      <div className="card-panel p-6 md:p-7">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--text)]">
              Billing history
            </h2>
            <p className="text-xs text-[var(--muted)] mt-1">Your account purchases.</p>
          </div>
          <Link to="/app/invoices" className="text-xs text-[var(--emerald)] hover:underline">
            View all invoices →
          </Link>
        </div>
        {billing.length ? (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm dash-table tabular-nums">
              <thead>
                <tr>
                  <th className="text-left">Date</th>
                  <th className="text-left">Product</th>
                  <th className="text-left">Amount</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {billing.map((b, i) => (
                  <tr key={b.id || i}>
                    <td className="text-xs text-[var(--muted)]">
                      {new Date(b.created_at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="text-[var(--text)]">{b.product}</td>
                    <td className="font-mono text-[var(--text)]">{formatINR(b.amount)}</td>
                    <td className="text-right">{statusBadge(b.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-[var(--muted)] py-6">No purchases yet.</div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-panel p-6">
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">Account</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Mail size={14} className="mt-0.5 text-[var(--muted-2)]" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                  Email
                </div>
                <div className="text-[var(--text)]">{user?.email}</div>
              </div>
            </div>
            <div className="text-xs text-[var(--muted)]">
              <span className="text-[var(--muted-2)] font-mono">Sign-in:</span>{" "}
              {user?.auth_provider === "google" || user?.firebase_uid
                ? "Google Account"
                : "Email + password"}
            </div>
            {user?.created_at && (
              <div className="text-xs text-[var(--muted)]">
                <span className="text-[var(--muted-2)] font-mono">Member since:</span>{" "}
                {new Date(user.created_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            )}
          </div>
          <form
            onSubmit={updatePassword}
            className="mt-5 pt-4 border-t border-[var(--border)] space-y-2.5"
          >
            <label className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono flex items-center gap-1.5">
              <KeyRound size={11} /> Update website login password
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showNewPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  className="input-dark pr-9 !py-2 text-xs"
                  data-testid="settings-new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-2)] hover:text-[var(--text)]"
                  aria-label={showNewPw ? "Hide password" : "Show password"}
                >
                  {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="submit"
                disabled={savingPw || newPassword.length < 6}
                className="btn-amber rounded-xl px-4 py-2 text-xs font-semibold shrink-0 disabled:opacity-50"
                data-testid="settings-update-password"
              >
                {savingPw ? "Saving…" : "Update"}
              </button>
            </div>
          </form>
        </div>

        <div className="card-panel p-6" data-testid="apk-credentials-card">
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">
            Trading App (APK) credentials
          </h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Use these to log in to the IndiFunded trading app once your account is funded.
          </p>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                Username
              </div>
              <div className="font-mono select-all mt-1 break-all text-[var(--text)]">
                {user?.apk_username || user?.email}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted-2)] font-mono">
                Password
              </div>
              <div className="font-mono select-all mt-1 text-[var(--text)]">
                {user?.apk_password || "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="card-panel p-6 flex flex-col md:col-span-2">
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">Support</h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Questions about your accounts or payouts?
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link
              to="/app/support"
              className="btn-amber rounded-xl px-4 py-2 text-xs font-semibold inline-flex items-center gap-2"
            >
              <LifeBuoy size={14} /> Open support desk
            </Link>
            <Link
              to="/contact"
              className="btn-ghost rounded-xl px-4 py-2 text-xs inline-flex items-center gap-2"
            >
              Contact page
            </Link>
          </div>
        </div>
      </div>

      <div className="card-panel p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="font-display text-lg font-semibold text-[var(--text)]">Session</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">Sign out of this device.</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await logout();
            } finally {
              nav("/login", { replace: true });
            }
          }}
          className="btn-ghost rounded-xl px-4 py-2.5 text-xs inline-flex items-center gap-2"
          data-testid="settings-signout"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
