import { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Switch } from "../../components/ui/switch";
import {
  Mail,
  Save,
  Send,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Clock,
  UserPlus,
  LogIn,
  Users,
} from "lucide-react";

const inputCls = "bg-[var(--bg-1)] border-[var(--border-hi)] mt-2";

const PROVIDER_PRESETS = [
  {
    id: "gmail",
    name: "Business Gmail",
    sub: "Google Workspace or @gmail.com via App Password",
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    smtp_secure: true,
  },
  {
    id: "titan",
    name: "Titan Email",
    sub: "Titan Business SMTP (smtp.titan.email)",
    smtp_host: "smtp.titan.email",
    smtp_port: 465,
    smtp_secure: true,
  },
  {
    id: "custom",
    name: "Custom SMTP",
    sub: "Zoho, AWS SES, SendGrid, or custom mail server",
    smtp_host: "",
    smtp_port: 465,
    smtp_secure: true,
  },
];

const TEMPLATE_VARS = [
  { token: "{{name}}", label: "First name" },
  { token: "{{full_name}}", label: "Full name" },
  { token: "{{email}}", label: "User email" },
  { token: "{{app_url}}", label: "Site URL" },
  { token: "{{login_time}}", label: "Time (IST)" },
];

function previewTemplate(text, origin) {
  return String(text || "")
    .replace(/\{\{name\}\}/g, "Rahul")
    .replace(/\{\{full_name\}\}/g, "Rahul Sharma")
    .replace(/\{\{email\}\}/g, "rahul@example.com")
    .replace(/\{\{app_url\}\}/g, origin || "https://indifunded.com")
    .replace(/\{\{login_time\}\}/g, "17 Nov 2026, 11:15 am");
}

export default function AdminEmail() {
  const [cfg, setCfg] = useState(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testTemplate, setTestTemplate] = useState("welcome");
  const [testResult, setTestResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [traders, setTraders] = useState([]);
  const [composeAudience, setComposeAudience] = useState("single");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeMessage, setComposeMessage] = useState("");
  const [sendingDirect, setSendingDirect] = useState(false);
  const [directResult, setDirectResult] = useState(null);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://indifunded.com";

  const loadAll = async () => {
    try {
      const [emailRes, logsRes, usersRes] = await Promise.all([
        api.get("/admin/email"),
        api.get("/admin/email/logs"),
        api.get("/admin/users").catch(() => ({ data: [] })),
      ]);
      setCfg(emailRes.data);
      if (emailRes.data?.configured) {
        setShowGuide(false);
      }
      setLogs(Array.isArray(logsRes.data?.items) ? logsRes.data.items : []);
      setTraders(
        Array.isArray(usersRes.data)
          ? usersRes.data.filter((u) => u?.role !== "admin" && u?.email)
          : [],
      );
    } catch (e) {
      toast.error(
        formatApiError(
          e.response?.data?.detail,
          "Could not load email settings",
        ),
      );
    }
  };

  useEffect(() => {
    loadAll();
    const timer = setInterval(() => {
      api
        .get("/admin/email/logs")
        .then((res) => {
          if (Array.isArray(res.data?.items)) setLogs(res.data.items);
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const refreshLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data } = await api.get("/admin/email/logs");
      setLogs(Array.isArray(data?.items) ? data.items : []);
    } catch {
      // ignore
    } finally {
      setLoadingLogs(false);
    }
  };

  if (!cfg)
    return (
      <div className="text-[var(--muted)]">
        Loading Business Gmail settings…
      </div>
    );

  const selectPreset = (preset) => {
    setCfg((prev) => ({
      ...prev,
      provider: preset.id,
      smtp_host: preset.id === "custom" ? prev.smtp_host : preset.smtp_host,
      smtp_port: preset.smtp_port,
      smtp_secure: preset.smtp_secure,
    }));
  };

  const save = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const payload = {
        ...cfg,
        ...(passwordInput.trim() ? { smtp_password: passwordInput } : {}),
      };
      const { data } = await api.put("/admin/email", payload);
      setCfg(data);
      setPasswordInput("");
      toast.success("Business Gmail automation saved");
    } catch (err) {
      toast.error(
        formatApiError(
          err.response?.data?.detail,
          "Failed to save email settings",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    const recipient = testTo.trim();
    if (!recipient || !recipient.includes("@")) {
      toast.error("Enter the recipient email address you want to test.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        to: recipient,
        template_type: testTemplate,
        provider: cfg.provider,
        smtp_host: cfg.smtp_host,
        smtp_port: cfg.smtp_port,
        smtp_secure: cfg.smtp_secure,
        smtp_user: cfg.smtp_user,
        from_name: cfg.from_name,
        from_email: cfg.from_email,
        reply_to: cfg.reply_to,
        welcome_subject: cfg.welcome_subject,
        welcome_body: cfg.welcome_body,
        login_welcome_subject: cfg.login_welcome_subject,
        login_welcome_body: cfg.login_welcome_body,
        ...(passwordInput.trim() ? { smtp_password: passwordInput } : {}),
      };
      const { data } = await api.post("/admin/email/test", payload, {
        timeout: 45000,
      });
      setTestResult({
        ok: true,
        to: recipient,
        from: data?.from || cfg.from_email || cfg.smtp_user,
        accepted: data?.accepted || [recipient],
        messageId: data?.messageId || "",
        response: data?.response || "",
        port_used: data?.port_used,
      });
      toast.success(`Email accepted by SMTP for ${recipient}!`);
      refreshLogs();
    } catch (err) {
      const msg = formatApiError(
        err.response?.data?.detail || err.message,
        "SMTP test failed",
      );
      setTestResult({ ok: false, to: recipient, error: msg });
      toast.error(msg);
      refreshLogs();
    } finally {
      setTesting(false);
    }
  };

  const sendDirectMail = async (e) => {
    e?.preventDefault?.();
    if (composeAudience === "single" && !composeTo.trim()) {
      toast.error("Enter a recipient email address (or pick a trader).");
      return;
    }
    if (!composeSubject.trim() || !composeMessage.trim()) {
      toast.error("Enter both Subject and Message before sending.");
      return;
    }
    setSendingDirect(true);
    setDirectResult(null);
    try {
      const payload = {
        audience: composeAudience,
        to: composeAudience === "single" ? composeTo.trim() : "",
        subject: composeSubject.trim(),
        message: composeMessage.trim(),
        provider: cfg.provider,
        smtp_host: cfg.smtp_host,
        smtp_port: Number(cfg.smtp_port) || 465,
        smtp_secure: cfg.smtp_secure,
        smtp_user: cfg.smtp_user,
        from_name: cfg.from_name,
        from_email: cfg.from_email,
        reply_to: cfg.reply_to,
        ...(passwordInput.trim() ? { smtp_password: passwordInput } : {}),
      };
      const { data } = await api.post("/admin/email/send", payload, {
        timeout: composeAudience === "all_traders" ? 90000 : 45000,
      });
      setDirectResult({
        ok: true,
        sent_count: data?.sent_count || 1,
        failed_count: data?.failed_count || 0,
        accepted: data?.accepted || [],
        from: data?.from || cfg.from_email || cfg.smtp_user,
        messageId: data?.messageId || "",
        port_used: data?.port_used,
      });
      toast.success(
        data?.sent_count > 1
          ? `Sent email to ${data.sent_count} traders!`
          : `Email sent to ${data?.accepted?.[0] || composeTo}!`,
      );
      refreshLogs();
    } catch (err) {
      const msg = formatApiError(
        err.response?.data?.detail || err.message,
        "Failed to send email",
      );
      setDirectResult({ ok: false, error: msg });
      toast.error(msg);
      refreshLogs();
    } finally {
      setSendingDirect(false);
    }
  };

  const clearSavedPassword = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/admin/email", {
        ...cfg,
        clear_password: true,
      });
      setCfg(data);
      setPasswordInput("");
      toast.success("Saved App Password cleared");
    } catch (err) {
      toast.error(
        formatApiError(err.response?.data?.detail, "Could not clear password"),
      );
    } finally {
      setSaving(false);
    }
  };

  const applyCleanTemplates = async () => {
    setSaving(true);
    try {
      const nextCfg = {
        ...cfg,
        welcome_subject: "Welcome to IndiFunded, {{name}}",
        welcome_body:
          "Hi {{name}},\n\nThanks for creating your IndiFunded account ({{email}}). Your account is active and ready to use.\n\nIf you ever need help, just reply directly to this email.\n\nBest regards,\nIndiFunded Team",
        login_welcome_subject: "New sign-in to your IndiFunded account",
        login_welcome_body:
          "Hi {{name}},\n\nYou signed in to your IndiFunded account ({{email}}) at {{login_time}}.\n\nIf this was you, no action is needed. If you did not sign in, please reset your password right away.\n\nBest regards,\nIndiFunded Team",
      };
      const { data } = await api.put("/admin/email", nextCfg);
      setCfg(data);
      toast.success("Clean inbox-friendly templates saved!");
    } catch (err) {
      toast.error(
        formatApiError(
          err.response?.data?.detail,
          "Could not update templates",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const isGmail = cfg.provider === "gmail";
  const isFreeGmailSender = /@gmail\.com$/i.test(
    String(cfg.smtp_user || "").trim(),
  );
  const smtpDomain =
    String(cfg.smtp_user || "")
      .split("@")[1]
      ?.toLowerCase() || "";
  const fromDomain =
    String(cfg.from_email || "")
      .split("@")[1]
      ?.toLowerCase() || "";
  const hasDomainMismatch = Boolean(
    smtpDomain && fromDomain && smtpDomain !== fromDomain,
  );
  const isConfigured = Boolean(
    cfg.smtp_user &&
    (cfg.configured || cfg.has_password || passwordInput.trim()),
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start md:items-center flex-wrap gap-4">
        <div>
          <div className="chip mb-3">Email Automation</div>
          <h1 className="font-display text-4xl">Business Gmail Automation</h1>
          <p className="text-sm text-[var(--muted)] mt-1.5 max-w-2xl">
            Automatically send welcome messages from your Business Gmail
            whenever a trader signs up or logs in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-2"
          >
            <ShieldCheck size={14} className="text-[var(--accent)]" />
            {showGuide ? "Hide Setup Guide" : "How to Connect Gmail"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="btn-amber rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-60"
            data-testid="email-save"
          >
            <Save size={14} /> {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Live Status Banner */}
      <div
        className={`card-panel p-5 flex flex-wrap items-center justify-between gap-4 border ${
          cfg.configured
            ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
            : "border-amber-500/30 bg-amber-500/5"
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl grid place-items-center ${
              cfg.configured
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {cfg.configured ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertCircle size={20} />
            )}
          </div>
          <div>
            <div className="font-medium text-white flex items-center gap-2">
              {cfg.configured
                ? "Automated Gmail Sender Active"
                : "Connect Your Business Gmail to Activate"}
              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/10 text-[var(--muted)]">
                {cfg.smtp_host || "smtp.gmail.com"}
              </span>
            </div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              {cfg.configured ? (
                <>
                  Sending from{" "}
                  <span className="text-white font-mono">
                    {cfg.from_email || cfg.smtp_user}
                  </span>{" "}
                  · Sign-up Welcome:{" "}
                  <strong>{cfg.welcome_enabled ? "ON" : "OFF"}</strong> · Login
                  Welcome:{" "}
                  <strong>{cfg.login_welcome_enabled ? "ON" : "OFF"}</strong>
                </>
              ) : (
                "Follow the 4 quick steps below to generate a Google App Password and connect your Business Gmail."
              )}
            </div>
          </div>
        </div>
        <div className="text-xs font-mono text-[var(--muted-2)]">
          {logs.filter((l) => l.status === "sent").length} sent in recent log
        </div>
      </div>

      {/* Inbox Deliverability & Spam Prevention */}
      <div className="card-panel p-5 border border-[var(--border-hi)] space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white flex items-center gap-2">
              <ShieldCheck size={16} className="text-[var(--accent)]" />
              Why Emails Go to Spam &amp; How to Fix It
            </div>
            <p className="text-xs text-[var(--muted)] mt-1 max-w-3xl leading-relaxed">
              {isFreeGmailSender ? (
                <>
                  You are currently sending from a free{" "}
                  <span className="text-white font-mono">{cfg.smtp_user}</span>{" "}
                  address. Free <span className="font-mono">@gmail.com</span>{" "}
                  addresses sending automated site emails (especially with
                  trading/capital words or a mismatched sender name like{" "}
                  <strong>IndiFunded</strong>) are frequently placed in{" "}
                  <strong>Spam</strong> by Gmail&apos;s automated filter.
                </>
              ) : (
                "Ensure your domain has valid SPF, DKIM, and DMARC DNS records matching your sender email."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={applyCleanTemplates}
            disabled={saving}
            className="btn-ghost rounded-full px-4 py-2 text-xs inline-flex items-center gap-1.5 shrink-0"
          >
            <Sparkles size={13} className="text-[var(--accent)]" /> Apply Clean
            Inbox Templates
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs text-[var(--muted)]">
          <div className="rounded-lg bg-[var(--bg-1)] border border-[var(--border)] p-3">
            <strong className="text-white block mb-0.5">
              1. Best Fix: Custom Domain
            </strong>
            Use a domain email (like{" "}
            <span className="font-mono">support@indifunded.com</span>) via{" "}
            <strong>Google Workspace</strong> or <strong>Custom SMTP</strong>{" "}
            (Brevo / Resend / Zoho / SES) with SPF + DKIM + DMARC.
          </div>
          <div className="rounded-lg bg-[var(--bg-1)] border border-[var(--border)] p-3">
            <strong className="text-white block mb-0.5">
              2. Brand-Matched Gmail
            </strong>
            If using free Gmail for testing, prefer{" "}
            <span className="font-mono">indifunded1@gmail.com</span> over a
            personal Gmail so the address matches &quot;IndiFunded&quot;.
          </div>
          <div className="rounded-lg bg-[var(--bg-1)] border border-[var(--border)] p-3">
            <strong className="text-white block mb-0.5">
              3. Avoid Promo Words
            </strong>
            Click <strong>Apply Clean Inbox Templates</strong> to use minimal,
            human-style text instead of promotional copy.
          </div>
        </div>
      </div>

      {/* Step-by-Step Setup Guide */}
      {showGuide && (
        <div className="card-panel p-6 space-y-5 border border-[var(--border-hi)]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="font-display text-xl text-white">
                How to Connect Business Gmail (Takes 2 Minutes)
              </h2>
              <p className="text-xs text-[var(--muted)] mt-1">
                Google requires a 16-character App Password so your server can
                send automated emails 24/7 even when you are offline.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://myaccount.google.com/security"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              >
                1. Google Security <ExternalLink size={12} />
              </a>
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-amber rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
              >
                2. Create App Password <ExternalLink size={12} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              {
                n: "01",
                t: "Enable 2-Step Verification",
                d: "Open Google Account → Security and turn on 2-Step Verification for your business Gmail.",
              },
              {
                n: "02",
                t: "Create App Password",
                d: "Go to Google App Passwords, enter app name 'IndiFunded', and copy the 16-character code.",
              },
              {
                n: "03",
                t: "Paste Email & Code Below",
                d: "Enter your Gmail address and paste the 16-character App Password (spaces are removed automatically).",
              },
              {
                n: "04",
                t: "Save & Send Test Email",
                d: "Click Save Settings, send a test email, and every new signup or login will auto-email!",
              },
            ].map((step) => (
              <div
                key={step.n}
                className="rounded-xl bg-[var(--bg-1)] border border-[var(--border)] p-4"
              >
                <div className="text-xs font-mono text-[var(--accent)] mb-1.5">
                  STEP {step.n}
                </div>
                <div className="font-medium text-sm text-white mb-1">
                  {step.t}
                </div>
                <p className="text-xs text-[var(--muted)] leading-relaxed">
                  {step.d}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider Presets + Connection Form */}
      <form onSubmit={save} className="space-y-6">
        <div className="card-panel p-6 space-y-6">
          <div>
            <h2 className="font-display text-xl mb-1">
              1. Mail Provider & Credentials
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Choose Business Gmail (recommended) or switch to Titan / Custom
              SMTP anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PROVIDER_PRESETS.map((p) => {
              const active = cfg.provider === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => selectPreset(p)}
                  className={`text-left rounded-xl p-4 border transition-colors ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10"
                      : "border-[var(--border)] bg-[var(--bg-1)] hover:border-[var(--border-hi)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-white">
                      {p.name}
                    </span>
                    {active && (
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-[var(--accent)] text-white">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)] mt-1">
                    {p.sub}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-[var(--muted)]">
                {isGmail
                  ? "Business Gmail Address *"
                  : "SMTP Username / Email *"}
              </Label>
              <Input
                type="email"
                value={cfg.smtp_user || ""}
                onChange={(e) => {
                  const nextUser = e.target.value;
                  setCfg((prev) => ({
                    ...prev,
                    smtp_user: nextUser,
                    from_email:
                      !prev.from_email || prev.from_email === prev.smtp_user
                        ? nextUser
                        : prev.from_email,
                    reply_to:
                      !prev.reply_to || prev.reply_to === prev.smtp_user
                        ? nextUser
                        : prev.reply_to,
                  }));
                }}
                placeholder="indifunded1@gmail.com"
                className={inputCls}
                data-testid="email-smtp-user"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-[var(--muted)]">
                  {isGmail
                    ? "Google App Password (16 chars) *"
                    : "SMTP Password *"}
                </Label>
                {cfg.has_password && (
                  <span className="text-[11px] font-mono text-[var(--accent)]">
                    Saved •{" "}
                    <button
                      type="button"
                      onClick={clearSavedPassword}
                      className="underline text-[var(--muted)] hover:text-white"
                    >
                      Clear
                    </button>
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={
                    cfg.has_password
                      ? "Saved (enter new code only to replace)"
                      : isGmail
                        ? "xxxx xxxx xxxx xxxx"
                        : "Enter SMTP password"
                  }
                  className={`${inputCls} pr-10`}
                  data-testid="email-smtp-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 mt-1 text-[var(--muted)] hover:text-white"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <Label className="text-xs text-[var(--muted)]">
                Sender Display Name
              </Label>
              <Input
                value={cfg.from_name || ""}
                onChange={(e) => setCfg({ ...cfg, from_name: e.target.value })}
                placeholder="IndiFunded"
                className={inputCls}
              />
            </div>

            <div>
              <Label className="text-xs text-[var(--muted)]">
                From Email (optional)
              </Label>
              <Input
                type="email"
                value={cfg.from_email || ""}
                onChange={(e) => setCfg({ ...cfg, from_email: e.target.value })}
                placeholder={cfg.smtp_user || "growthloopp@gmail.com"}
                className={inputCls}
              />
              {hasDomainMismatch && (
                <p className="text-[11px] text-amber-300 mt-1">
                  To prevent Spam folder filtering, sender header stays aligned
                  with <span className="font-mono">{cfg.smtp_user}</span> and
                  replies route to{" "}
                  <span className="font-mono">
                    {cfg.reply_to || cfg.from_email}
                  </span>
                  .
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs text-[var(--muted)]">
                Reply-To Email (optional)
              </Label>
              <Input
                type="email"
                value={cfg.reply_to || ""}
                onChange={(e) => setCfg({ ...cfg, reply_to: e.target.value })}
                placeholder={
                  cfg.from_email || cfg.smtp_user || "support@indifunded.com"
                }
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-[var(--muted)]">SMTP Host</Label>
                <Input
                  value={cfg.smtp_host || ""}
                  onChange={(e) =>
                    setCfg({ ...cfg, smtp_host: e.target.value })
                  }
                  placeholder="smtp.gmail.com"
                  className={inputCls}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-[var(--muted)]">Port</Label>
                  <div className="flex gap-1">
                    {[
                      { p: 465, label: "465 SSL", sec: true },
                      { p: 587, label: "587 TLS", sec: false },
                    ].map((opt) => (
                      <button
                        type="button"
                        key={opt.p}
                        onClick={() =>
                          setCfg({
                            ...cfg,
                            smtp_port: opt.p,
                            smtp_secure: opt.sec,
                          })
                        }
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          Number(cfg.smtp_port) === opt.p
                            ? "border-[var(--accent)] text-[var(--accent)]"
                            : "border-[var(--border)] text-[var(--muted)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  type="number"
                  value={cfg.smtp_port ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setCfg({ ...cfg, smtp_port: "" });
                      return;
                    }
                    const portNum = Number(raw);
                    setCfg({
                      ...cfg,
                      smtp_port: portNum,
                      smtp_secure:
                        portNum === 465
                          ? true
                          : portNum === 587
                            ? false
                            : cfg.smtp_secure,
                    });
                  }}
                  onBlur={() => {
                    if (!cfg.smtp_port)
                      setCfg({ ...cfg, smtp_port: 465, smtp_secure: true });
                  }}
                  className={inputCls}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Automation Triggers & Templates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sign-up Welcome */}
          <div className="card-panel p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/15 text-[var(--accent)] grid place-items-center">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h2 className="font-display text-lg text-white">
                    Sign-Up Welcome Email
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Sent automatically when a new user registers (or logs in the
                    first time).
                  </p>
                </div>
              </div>
              <Switch
                checked={Boolean(cfg.welcome_enabled)}
                onCheckedChange={(v) => setCfg({ ...cfg, welcome_enabled: v })}
                aria-label="Enable sign-up welcome email"
                data-testid="toggle-signup-welcome"
              />
            </div>

            <div>
              <Label className="text-xs text-[var(--muted)]">
                Subject Line
              </Label>
              <Input
                value={cfg.welcome_subject || ""}
                onChange={(e) =>
                  setCfg({ ...cfg, welcome_subject: e.target.value })
                }
                className={inputCls}
              />
            </div>

            <div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs text-[var(--muted)]">
                  Message Body
                </Label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARS.slice(0, 3).map((v) => (
                    <button
                      type="button"
                      key={v.token}
                      onClick={() =>
                        setCfg({
                          ...cfg,
                          welcome_body: `${cfg.welcome_body || ""} ${v.token}`,
                        })
                      }
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-1)] border border-[var(--border)] text-[var(--muted)] hover:text-white"
                      title={`Insert ${v.label}`}
                    >
                      {v.token}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                rows={6}
                value={cfg.welcome_body || ""}
                onChange={(e) =>
                  setCfg({ ...cfg, welcome_body: e.target.value })
                }
                className={inputCls}
              />
            </div>

            <div className="rounded-xl bg-[var(--bg-1)] border border-[var(--border)] p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] mb-1 flex items-center gap-1.5">
                <Sparkles size={11} /> Live Preview
              </div>
              <div className="text-xs font-medium text-white mb-1">
                {previewTemplate(cfg.welcome_subject, origin)}
              </div>
              <div className="text-xs text-[var(--muted)] whitespace-pre-line leading-relaxed">
                {previewTemplate(cfg.welcome_body, origin)}
              </div>
            </div>
          </div>

          {/* Login Welcome Back */}
          <div className="card-panel p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 text-white grid place-items-center">
                  <LogIn size={18} />
                </div>
                <div>
                  <h2 className="font-display text-lg text-white">
                    Every-Login Welcome Email
                  </h2>
                  <p className="text-xs text-[var(--muted)]">
                    Optional: also send a welcome / sign-in confirmation each
                    time a trader logs in.
                  </p>
                </div>
              </div>
              <Switch
                checked={Boolean(cfg.login_welcome_enabled)}
                onCheckedChange={(v) =>
                  setCfg({ ...cfg, login_welcome_enabled: v })
                }
                aria-label="Enable login welcome email"
                data-testid="toggle-login-welcome"
              />
            </div>

            <div>
              <Label className="text-xs text-[var(--muted)]">
                Subject Line
              </Label>
              <Input
                value={cfg.login_welcome_subject || ""}
                onChange={(e) =>
                  setCfg({ ...cfg, login_welcome_subject: e.target.value })
                }
                className={inputCls}
              />
            </div>

            <div>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs text-[var(--muted)]">
                  Message Body
                </Label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARS.map((v) => (
                    <button
                      type="button"
                      key={v.token}
                      onClick={() =>
                        setCfg({
                          ...cfg,
                          login_welcome_body: `${cfg.login_welcome_body || ""} ${v.token}`,
                        })
                      }
                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-1)] border border-[var(--border)] text-[var(--muted)] hover:text-white"
                      title={`Insert ${v.label}`}
                    >
                      {v.token}
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                rows={6}
                value={cfg.login_welcome_body || ""}
                onChange={(e) =>
                  setCfg({ ...cfg, login_welcome_body: e.target.value })
                }
                className={inputCls}
              />
            </div>

            <div className="rounded-xl bg-[var(--bg-1)] border border-[var(--border)] p-4">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent)] mb-1 flex items-center gap-1.5">
                <Sparkles size={11} /> Live Preview
              </div>
              <div className="text-xs font-medium text-white mb-1">
                {previewTemplate(cfg.login_welcome_subject, origin)}
              </div>
              <div className="text-xs text-[var(--muted)] whitespace-pre-line leading-relaxed">
                {previewTemplate(cfg.login_welcome_body, origin)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="btn-amber rounded-full px-6 py-3 text-sm inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Save size={15} />{" "}
            {saving ? "Saving…" : "Save Gmail & Automation Rules"}
          </button>
        </div>
      </form>

      {/* Direct Mail Sender */}
      <form onSubmit={sendDirectMail} className="card-panel p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Send size={18} className="text-[var(--accent)]" />
            <div>
              <h2 className="font-display text-xl">
                2. Send Email from Admin Panel
              </h2>
              <p className="text-xs text-[var(--muted)]">
                Send inbox-aligned updates directly to a trader or all
                registered traders.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {[
              { id: "single", label: "Specific Email(s)", icon: Mail },
              {
                id: "all_traders",
                label: `All Traders (${traders.length})`,
                icon: Users,
              },
            ].map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setComposeAudience(opt.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border inline-flex items-center gap-1.5 transition-colors ${
                    composeAudience === opt.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white"
                      : "border-[var(--border)] bg-[var(--bg-1)] text-[var(--muted)] hover:text-white"
                  }`}
                >
                  <Icon size={12} /> {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {composeAudience === "single" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-[var(--muted)]">
                Recipient Email(s) *
              </Label>
              <Input
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="trader@gmail.com (separate multiple with commas)"
                className={inputCls}
                data-testid="email-compose-to"
              />
            </div>
            {traders.length > 0 && (
              <div>
                <Label className="text-xs text-[var(--muted)]">
                  Or Pick Registered Trader
                </Label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setComposeTo(e.target.value);
                  }}
                  className="w-full h-10 rounded-md px-3 text-sm bg-[var(--bg-1)] border border-[var(--border-hi)] text-white mt-2"
                  aria-label="Pick registered trader email"
                >
                  <option value="">Select a trader…</option>
                  {traders.map((t) => (
                    <option key={t.id} value={t.email}>
                      {t.name ? `${t.name} (${t.email})` : t.email}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <Label className="text-xs text-[var(--muted)]">Subject Line *</Label>
          <Input
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
            placeholder="Important update regarding your IndiFunded account"
            className={inputCls}
            data-testid="email-compose-subject"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-[var(--muted)]">Message *</Label>
            <span className="text-[11px] font-mono text-[var(--muted-2)]">
              Supports {"{{name}}"} and {"{{email}}"}
            </span>
          </div>
          <Textarea
            rows={5}
            value={composeMessage}
            onChange={(e) => setComposeMessage(e.target.value)}
            placeholder={
              "Hi {{name}},\n\nYour funded account update is ready.\n\nBest regards,\nIndiFunded Team"
            }
            className={inputCls}
            data-testid="email-compose-message"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sendingDirect || !isConfigured}
            className="btn-amber rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50"
            data-testid="email-compose-send"
          >
            <Send size={14} /> {sendingDirect ? "Sending…" : "Send Email Now"}
          </button>
        </div>

        {directResult && (
          <div
            className={`rounded-xl p-4 text-xs border ${
              directResult.ok
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-white"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200"
            }`}
          >
            {directResult.ok ? (
              <div className="space-y-1">
                <div className="font-medium text-[var(--accent)]">
                  Sent {directResult.sent_count} email
                  {directResult.sent_count > 1 ? "s" : ""} (
                  {directResult.accepted?.slice(0, 3).join(", ")}
                  {directResult.accepted?.length > 3 ? "…" : ""})
                </div>
                <div className="text-[var(--muted)] font-mono">
                  From: {directResult.from} · ID:{" "}
                  {directResult.messageId || "queued"}
                </div>
              </div>
            ) : (
              <div>
                <strong>Failed:</strong> {directResult.error}
              </div>
            )}
          </div>
        )}
      </form>

      {/* Send Test Email */}
      <div className="card-panel p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Mail size={18} className="text-[var(--accent)]" />
          <h2 className="font-display text-xl">3. Test Live Gmail Delivery</h2>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Send a test or real Welcome message to any external Gmail / customer
          inbox to verify delivery from{" "}
          <span className="text-white font-mono">
            {cfg.from_email || cfg.smtp_user}
          </span>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { id: "welcome", label: "Sign-Up Welcome Template" },
            { id: "login", label: "Every-Login Template" },
            { id: "test", label: "SMTP Connection Test" },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTestTemplate(opt.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                testTemplate === opt.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white"
                  : "border-[var(--border)] bg-[var(--bg-1)] text-[var(--muted)] hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="Enter recipient email (e.g. customer@gmail.com)"
            className="bg-[var(--bg-1)] border-[var(--border-hi)] max-w-sm"
            data-testid="email-test-to"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={testing || !isConfigured}
            className="btn-amber rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-50"
            data-testid="email-send-test"
          >
            <Send size={14} /> {testing ? "Sending…" : "Send Test Email"}
          </button>
        </div>

        {testResult && (
          <div
            className={`rounded-xl p-4 text-xs border ${
              testResult.ok
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-white"
                : "border-rose-500/40 bg-rose-500/10 text-rose-200"
            }`}
          >
            {testResult.ok ? (
              <div className="space-y-1">
                <div className="font-medium text-[var(--accent)]">
                  Gmail SMTP Accepted Delivery (
                  {testResult.accepted?.join(", ")})
                </div>
                <div className="text-[var(--muted)] font-mono">
                  From: {testResult.from} · ID:{" "}
                  {testResult.messageId || "queued"}
                </div>
                <div className="text-[var(--muted)] pt-1">
                  Check the recipient&apos;s{" "}
                  <strong>Inbox / Updates / Spam</strong> folders. If the
                  address does not exist or has a typo, Gmail will deliver a
                  bounce notice inside{" "}
                  <span className="text-white font-mono">{cfg.smtp_user}</span>
                  &apos;s inbox.
                </div>
              </div>
            ) : (
              <div>
                <strong>Failed:</strong> {testResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Automated Delivery Activity Log */}
      <div className="card-panel p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5">
            <Clock size={18} className="text-[var(--accent)]" />
            <h2 className="font-display text-xl">Recent Automated Emails</h2>
          </div>
          <button
            type="button"
            onClick={refreshLogs}
            disabled={loadingLogs}
            className="btn-ghost rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw
              size={12}
              className={loadingLogs ? "animate-spin" : ""}
            />{" "}
            Refresh
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="text-sm text-[var(--muted)] py-6 text-center border border-dashed border-[var(--border)] rounded-xl">
            No automated emails logged yet. Send a test email or create a trader
            account to see live delivery records here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-mono uppercase text-[var(--muted-2)]">
                  <th className="py-2.5 pr-4">Trigger</th>
                  <th className="py-2.5 pr-4">Recipient</th>
                  <th className="py-2.5 pr-4">Subject &amp; Sender</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/60">
                {logs.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-4">
                      <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-[var(--bg-1)] border border-[var(--border)] text-[var(--muted)]">
                        {item.trigger}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-white">
                      {item.to}
                    </td>
                    <td className="py-3 pr-4 text-xs text-[var(--muted)] max-w-xs">
                      <div className="truncate">{item.subject}</div>
                      {item.from ? (
                        <div className="text-[11px] font-mono text-[var(--muted-2)] truncate">
                          from {item.from}
                        </div>
                      ) : null}
                      {item.error ? (
                        <div className="text-[11px] text-rose-400 mt-0.5 truncate">
                          {item.error}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          item.status === "sent"
                            ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        {item.status === "sent" ? "Sent" : "Failed"}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-[var(--muted-2)] font-mono whitespace-nowrap">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
