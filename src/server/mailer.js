import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

export const EMAIL_PROVIDERS = {
  gmail: {
    id: "gmail",
    label: "Business Gmail / Google Workspace",
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    smtp_secure: true,
  },
  titan: {
    id: "titan",
    label: "Titan Business Email",
    smtp_host: "smtp.titan.email",
    smtp_port: 465,
    smtp_secure: true,
  },
  custom: {
    id: "custom",
    label: "Custom SMTP",
    smtp_host: "",
    smtp_port: 465,
    smtp_secure: true,
  },
};

export const DEFAULT_EMAIL_CONFIG = {
  id: "email_config",
  provider: "gmail",
  smtp_host: "smtp.gmail.com",
  smtp_port: 465,
  smtp_secure: true,
  smtp_user: "",
  smtp_password: "",
  from_name: "IndiFunded",
  from_email: "",
  reply_to: "",
  welcome_enabled: true,
  welcome_subject: "Welcome to IndiFunded, {{name}}",
  welcome_body:
    "Hi {{name}},\n\nThanks for creating your IndiFunded account ({{email}}). Your account is active and ready to use.\n\nIf you ever need help, just reply directly to this email.\n\nBest regards,\nIndiFunded Team",
  login_welcome_enabled: true,
  login_welcome_subject: "New sign-in to your IndiFunded account",
  login_welcome_body:
    "Hi {{name}},\n\nYou signed in to your IndiFunded account ({{email}}) at {{login_time}}.\n\nIf this was you, no action is needed. If you did not sign in, please reset your password right away.\n\nBest regards,\nIndiFunded Team",
  updated_at: "",
};

function readLocalEnvFile() {
  const out = {};
  for (const filename of [".env", ".env.local"]) {
    try {
      const fullPath = path.resolve(process.cwd(), filename);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, "utf8");
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        out[key] = val;
      }
    } catch {
      // ignore unreadable local env files
    }
  }
  return out;
}

export function normalizeSmtpPassword(provider, password) {
  const raw = String(password || "");
  if (!raw) return "";
  // Google App Passwords are displayed as 4 groups of 4 chars separated by spaces.
  if (provider === "gmail") {
    return raw.replace(/\s+/g, "");
  }
  return raw;
}

export function resolveEmailConfig(stored) {
  const localEnv = readLocalEnvFile();
  const envUser = String(
    process.env["GMAIL_USER"] ||
      process.env["SMTP_USER"] ||
      localEnv["GMAIL_USER"] ||
      localEnv["SMTP_USER"] ||
      "",
  ).trim();
  const envPass = String(
    process.env["GMAIL_APP_PASSWORD"] ||
      process.env["SMTP_PASSWORD"] ||
      localEnv["GMAIL_APP_PASSWORD"] ||
      localEnv["SMTP_PASSWORD"] ||
      "",
  ).trim();
  const envHost = String(
    process.env["SMTP_HOST"] || localEnv["SMTP_HOST"] || "",
  ).trim();
  const envPort = Number(
    process.env["SMTP_PORT"] || localEnv["SMTP_PORT"] || 0,
  );

  const envFallback =
    envUser || envPass || envHost
      ? {
          provider:
            envHost && envHost !== "smtp.gmail.com" ? "custom" : "gmail",
          smtp_host: envHost || "smtp.gmail.com",
          smtp_port: envPort || 465,
          smtp_secure: envPort ? envPort === 465 : true,
          smtp_user: envUser,
          smtp_password: normalizeSmtpPassword(
            envHost && envHost !== "smtp.gmail.com" ? "custom" : "gmail",
            envPass,
          ),
          from_email: envUser,
          reply_to: envUser,
        }
      : {};

  const cleanStored = {};
  if (stored && typeof stored === "object") {
    for (const [k, v] of Object.entries(stored)) {
      if (v !== undefined && v !== null && v !== "") cleanStored[k] = v;
      // Preserve explicit false booleans and explicit empty credential overrides
      if (typeof v === "boolean") cleanStored[k] = v;
      if ((k === "smtp_user" || k === "smtp_password") && v === "")
        cleanStored[k] = "";
    }
  }

  const merged = {
    ...DEFAULT_EMAIL_CONFIG,
    ...envFallback,
    ...cleanStored,
  };
  merged.provider = EMAIL_PROVIDERS[merged.provider]
    ? merged.provider
    : "gmail";
  merged.smtp_password = normalizeSmtpPassword(
    merged.provider,
    merged.smtp_password,
  );
  if (!merged.from_email && merged.smtp_user)
    merged.from_email = merged.smtp_user;
  if (!merged.reply_to && merged.from_email)
    merged.reply_to = merged.from_email;
  return merged;
}

export function sanitizeEmailConfigForAdmin(cfg) {
  const merged = resolveEmailConfig(cfg);
  const hasPassword = Boolean(merged.smtp_password);
  const { smtp_password: _hidden, ...safe } = merged;
  return {
    ...safe,
    has_password: hasPassword,
    configured: Boolean(
      merged.smtp_host && merged.smtp_user && merged.smtp_password,
    ),
  };
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtmlEmail({
  title,
  preheader,
  bodyLines,
  ctaLabel,
  ctaUrl,
  footerNote,
}) {
  const paragraphs = bodyLines
    .filter((l) => l.trim().length > 0)
    .map(
      (l) =>
        `<p style="margin:0 0 14px 0;color:#1f2937;font-size:15px;line-height:1.6;">${escapeHtml(l)}</p>`,
    )
    .join("");
  const safeCtaUrl = /^https:\/\//i.test(String(ctaUrl || ""))
    ? String(ctaUrl)
    : "";
  const ctaBlock =
    ctaLabel && safeCtaUrl
      ? `<p style="margin:22px 0 18px 0;"><a href="${escapeHtml(safeCtaUrl)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(ctaLabel)}</a></p>`
      : "";
  const previewText = escapeHtml(preheader || title || "IndiFunded update");
  const note = escapeHtml(
    footerNote ||
      "IndiFunded · BRVS Education Pvt Ltd · Unique Square, Causeway, Katargam, Surat, Gujarat",
  );
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px 16px;background:#f9fafb;color:#1f2937;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${previewText}</span>
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px 24px;">
    ${paragraphs}
    ${ctaBlock}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 14px 0;">
    <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">${note}</p>
  </div>
</body>
</html>`;
}

function resolveSmtpSettings(cfg) {
  const provider = EMAIL_PROVIDERS[cfg.provider] ? cfg.provider : "gmail";
  const preset = EMAIL_PROVIDERS[provider];
  const host = String(
    cfg.smtp_host || preset.smtp_host || "smtp.gmail.com",
  ).trim();
  const port = Number(cfg.smtp_port) || preset.smtp_port || 465;
  const secure =
    port === 465
      ? true
      : port === 587
        ? false
        : cfg.smtp_secure !== undefined
          ? Boolean(cfg.smtp_secure)
          : true;
  const user = String(cfg.smtp_user || "").trim();
  const pass = normalizeSmtpPassword(provider, cfg.smtp_password);
  if (!host || !user || !pass) {
    throw new Error(
      "Business Gmail / SMTP email and App Password must be saved before sending.",
    );
  }
  return { provider, host, port, secure, user, pass };
}

function buildTransportAttempts(cfg) {
  const base = resolveSmtpSettings(cfg);
  const isKnownHost =
    base.provider === "gmail" ||
    base.provider === "titan" ||
    /^(?:smtp\.gmail\.com|smtp\.titan\.email)$/i.test(base.host);
  const attempts = [];
  const seen = new Set();
  const addAttempt = (port, secure, family) => {
    const key = `${base.host}:${port}:${secure ? 1 : 0}:${family || 0}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({
      ...base,
      port,
      secure,
      family,
    });
  };

  // Primary configured endpoint (prefer IPv4 on Gmail/Titan to avoid stalled IPv6 container egress)
  addAttempt(base.port, base.secure, isKnownHost ? 4 : undefined);
  if (!isKnownHost) {
    addAttempt(base.port, base.secure, 4);
  }

  // Automatic port failover between 587 (STARTTLS) and 465 (SSL) on network/timeout errors
  if (base.port === 587) {
    addAttempt(465, true, 4);
  } else if (base.port === 465) {
    addAttempt(587, false, 4);
  } else if (isKnownHost) {
    addAttempt(465, true, 4);
    addAttempt(587, false, 4);
  }
  return attempts;
}

function createTransporter(attempt, hasFallback = false) {
  const connTimeout = hasFallback ? 7500 : 10000;
  const greetTimeout = hasFallback ? 6500 : 9000;
  const sockTimeout = hasFallback ? 10000 : 14000;
  return nodemailer.createTransport({
    host: attempt.host,
    port: attempt.port,
    secure: attempt.secure,
    ...(attempt.port === 587 ? { requireTLS: true } : {}),
    ...(attempt.family ? { family: attempt.family } : {}),
    auth: { user: attempt.user, pass: attempt.pass },
    tls: {
      minVersion: "TLSv1.2",
      servername: attempt.host,
    },
    connectionTimeout: connTimeout,
    greetingTimeout: greetTimeout,
    socketTimeout: sockTimeout,
  });
}

function isRetryableSmtpError(err) {
  const code = String(err?.code || "").toUpperCase();
  const msg = String(err?.message || err || "");
  if (
    /535|534|Username and Password not accepted|Invalid login|Application-specific password|Authentication failed|EAUTH/i.test(
      msg,
    ) ||
    code === "EAUTH"
  ) {
    return false;
  }
  if (/Mail server rejected recipient|550|551|552|553|554/i.test(msg)) {
    return false;
  }
  return (
    [
      "ETIMEDOUT",
      "ESOCKET",
      "ECONNREFUSED",
      "ECONNRESET",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "EPIPE",
    ].includes(code) ||
    /ETIMEDOUT|Greeting never received|timeout|ECONNREFUSED|ECONNRESET|socket|TLS|handshake|Connection closed/i.test(
      msg,
    )
  );
}

async function sendMailWithFallback(cfg, mailOptions) {
  const attempts = buildTransportAttempts(cfg);
  const triedPorts = [];
  let lastErr = null;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const hasMore = i < attempts.length - 1;
    if (!triedPorts.includes(attempt.port)) triedPorts.push(attempt.port);
    const transporter = createTransporter(attempt, hasMore);
    try {
      const info = await transporter.sendMail(mailOptions);
      return {
        info,
        portUsed: attempt.port,
        fallbackUsed: i > 0,
      };
    } catch (err) {
      lastErr = err;
      if (!hasMore || !isRetryableSmtpError(err)) {
        break;
      }
      console.warn(
        `[mailer] SMTP attempt ${attempt.host}:${attempt.port} failed (${err?.message || err}), retrying fallback...`,
      );
    } finally {
      try {
        transporter.close?.();
      } catch {
        // ignore close errors
      }
    }
  }
  if (lastErr && typeof lastErr === "object") {
    lastErr.triedPorts = triedPorts;
  }
  throw lastErr || new Error("SMTP delivery failed");
}

function emailDomain(addr) {
  const clean = String(addr || "")
    .trim()
    .toLowerCase();
  const at = clean.lastIndexOf("@");
  return at > 0 ? clean.slice(at + 1) : "";
}

export function resolveAlignedSender(cfg) {
  const displayName = String(cfg.from_name || "IndiFunded")
    .replace(/[\r\n"]/g, " ")
    .trim();
  const smtpUser = String(cfg.smtp_user || "")
    .trim()
    .toLowerCase();
  const requestedFrom = String(cfg.from_email || smtpUser || "")
    .trim()
    .toLowerCase();
  const requestedReplyTo = String(cfg.reply_to || "")
    .trim()
    .toLowerCase();

  const userDomain = emailDomain(smtpUser);
  const fromDomain = emailDomain(requestedFrom);
  const strictAuthProvider =
    cfg.provider === "gmail" ||
    cfg.provider === "titan" ||
    /^(?:gmail\.com|googlemail\.com)$/i.test(userDomain);

  // When authenticated via Gmail/Titan, sending From a mismatched unverified domain fails DMARC/SPF
  // and lands in Spam. Keep From aligned with smtp_user and forward replies to reply_to/from_email.
  const alignedFrom =
    smtpUser &&
    strictAuthProvider &&
    fromDomain &&
    userDomain &&
    fromDomain !== userDomain
      ? smtpUser
      : requestedFrom || smtpUser;

  const fallbackReplyTo =
    requestedReplyTo ||
    (requestedFrom && requestedFrom !== alignedFrom ? requestedFrom : "");
  const replyTo =
    fallbackReplyTo && fallbackReplyTo !== alignedFrom
      ? fallbackReplyTo
      : undefined;

  return {
    displayName: displayName || "IndiFunded",
    senderAddr: alignedFrom,
    header: displayName ? `"${displayName}" <${alignedFrom}>` : alignedFrom,
    replyTo,
    wasAligned: alignedFrom !== requestedFrom,
  };
}

function buildMessageId(senderAddr) {
  const domain = emailDomain(senderAddr) || "indifunded.com";
  const token =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Date.now()}${Math.random().toString(16).slice(2, 10)}`;
  return `<${token}.${Date.now()}@${domain}>`;
}

function buildMailOptions({ cfg, to, subject, text, html }) {
  const recipient = String(to || "")
    .trim()
    .toLowerCase();
  const sender = resolveAlignedSender(cfg);
  const cleanSubject = String(subject || "")
    .replace(/[\r\n]+/g, " ")
    .trim();
  return {
    sender,
    mailOptions: {
      from: sender.header,
      ...(sender.replyTo ? { replyTo: sender.replyTo } : {}),
      to: recipient,
      envelope: {
        from: sender.senderAddr,
        to: recipient,
      },
      messageId: buildMessageId(sender.senderAddr),
      subject: cleanSubject,
      text,
      html,
      headers: {
        "X-Auto-Response-Suppress": "OOF, AutoReply",
      },
    },
  };
}

export function formatSmtpError(err, cfg) {
  const raw = String(err?.message || err || "SMTP connection failed");
  const tried =
    Array.isArray(err?.triedPorts) && err.triedPorts.length > 0
      ? err.triedPorts.join(" & ")
      : String(cfg?.smtp_port || 465);
  if (
    cfg?.provider === "gmail" &&
    /535|534|Username and Password not accepted|Invalid login|Application-specific password/i.test(
      raw,
    )
  ) {
    return "Gmail rejected the credentials. Enable 2-Step Verification on your Google Account and use a 16-character Google App Password (not your regular Gmail password).";
  }
  if (/535|Invalid login|Authentication failed|EAUTH/i.test(raw)) {
    return "SMTP authentication failed. Double-check your email username and SMTP password / App Password.";
  }
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return `Could not reach SMTP host (${cfg?.smtp_host || "unknown"}:${tried}). Check your SMTP host and port.`;
  }
  if (/ETIMEDOUT|Greeting never received|timeout/i.test(raw)) {
    return `SMTP server timed out (${cfg?.smtp_host || "smtp"}:${tried}). Ensure outbound SMTP (ports 465/587) is reachable from your host or switch to a custom SMTP provider.`;
  }
  return raw;
}

export function renderEmailTemplate(template, vars) {
  return String(template || "")
    .replace(/\{\{name\}\}/g, vars.firstName || "Trader")
    .replace(/\{\{full_name\}\}/g, vars.fullName || vars.firstName || "Trader")
    .replace(/\{\{email\}\}/g, vars.email || "")
    .replace(/\{\{app_url\}\}/g, vars.appUrl || "")
    .replace(/\{\{login_time\}\}/g, vars.loginTime || "");
}

export function isEphemeralOrigin(origin) {
  const host = String(origin || "")
    .replace(/^https?:\/\//, "")
    .split("/")[0];
  return /(?:^|\.)(?:run\.app|localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?$/i.test(
    host,
  );
}

function assertAcceptedRecipient(info, recipient) {
  const accepted = Array.isArray(info?.accepted) ? info.accepted : [];
  const rejected = Array.isArray(info?.rejected) ? info.rejected : [];
  if (rejected.length > 0 || accepted.length === 0) {
    const target = rejected.length ? rejected.join(", ") : recipient;
    throw new Error(`Mail server rejected recipient (${target}).`);
  }
  return { accepted, rejected };
}

export function formatVars({ to, name, origin }) {
  const fullName = String(name || "Trader").trim() || "Trader";
  const firstName = fullName.split(/\s+/)[0] || "Trader";
  const cleanOrigin = origin ? origin.replace(/\/+$/, "") : "";
  const appUrl =
    cleanOrigin && !isEphemeralOrigin(cleanOrigin)
      ? cleanOrigin
      : "your IndiFunded Trader Dashboard";
  const loginTime = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return {
    firstName,
    fullName,
    email: String(to || "")
      .trim()
      .toLowerCase(),
    appUrl,
    loginTime,
    hasPublicUrl: Boolean(cleanOrigin && !isEphemeralOrigin(cleanOrigin)),
    publicOrigin:
      cleanOrigin && !isEphemeralOrigin(cleanOrigin) ? cleanOrigin : "",
  };
}

export async function sendWelcomeEmail({ to, name, config, origin }) {
  const cfg = resolveEmailConfig(config);
  const recipient = String(to || "")
    .trim()
    .toLowerCase();
  if (
    !cfg.welcome_enabled ||
    !cfg.smtp_user ||
    !cfg.smtp_password ||
    !recipient
  ) {
    return { sent: false, reason: "not_configured" };
  }
  const vars = formatVars({ to: recipient, name, origin });
  const subject = renderEmailTemplate(
    cfg.welcome_subject || DEFAULT_EMAIL_CONFIG.welcome_subject,
    vars,
  );
  const rawBody = renderEmailTemplate(
    cfg.welcome_body || DEFAULT_EMAIL_CONFIG.welcome_body,
    vars,
  );
  try {
    const dashUrl = vars.hasPublicUrl ? `${vars.publicOrigin}/challenges` : "";
    const html = buildHtmlEmail({
      title: `Welcome to IndiFunded, ${vars.firstName}`,
      preheader: `Your IndiFunded account is ready, ${vars.firstName}.`,
      bodyLines: rawBody.split(/\r?\n/),
      ctaLabel: dashUrl ? "Open Trader Dashboard" : "",
      ctaUrl: dashUrl,
      footerNote:
        "You received this email because an account was created with IndiFunded (BRVS Education Pvt Ltd, Surat, Gujarat).",
    });
    const { sender, mailOptions } = buildMailOptions({
      cfg,
      to: recipient,
      subject,
      text: dashUrl ? `${rawBody}\n\n${dashUrl}` : rawBody,
      html,
    });
    const { info, portUsed } = await sendMailWithFallback(cfg, mailOptions);
    const { accepted, rejected } = assertAcceptedRecipient(info, recipient);
    return {
      sent: true,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response || "",
      from: sender.senderAddr,
      subject,
      provider: cfg.provider,
      portUsed,
    };
  } catch (err) {
    const reason = formatSmtpError(err, cfg);
    console.warn("[mailer] Welcome email skipped/failed:", reason);
    return {
      sent: false,
      reason,
      from: resolveAlignedSender(cfg).senderAddr,
      subject,
      provider: cfg.provider,
    };
  }
}

export async function sendLoginWelcomeEmail({ to, name, config, origin }) {
  const cfg = resolveEmailConfig(config);
  const recipient = String(to || "")
    .trim()
    .toLowerCase();
  if (
    !cfg.login_welcome_enabled ||
    !cfg.smtp_user ||
    !cfg.smtp_password ||
    !recipient
  ) {
    return { sent: false, reason: "disabled_or_not_configured" };
  }
  const vars = formatVars({ to: recipient, name, origin });
  const subject = renderEmailTemplate(
    cfg.login_welcome_subject || DEFAULT_EMAIL_CONFIG.login_welcome_subject,
    vars,
  );
  const rawBody = renderEmailTemplate(
    cfg.login_welcome_body || DEFAULT_EMAIL_CONFIG.login_welcome_body,
    vars,
  );
  try {
    const dashUrl = vars.hasPublicUrl ? `${vars.publicOrigin}/app` : "";
    const html = buildHtmlEmail({
      title: `Sign-in confirmation for ${vars.firstName}`,
      preheader: `New sign-in detected for ${vars.email}.`,
      bodyLines: rawBody.split(/\r?\n/),
      ctaLabel: dashUrl ? "Open Trader Dashboard" : "",
      ctaUrl: dashUrl,
      footerNote:
        "Security notification from IndiFunded (BRVS Education Pvt Ltd, Surat, Gujarat).",
    });
    const { sender, mailOptions } = buildMailOptions({
      cfg,
      to: recipient,
      subject,
      text: dashUrl ? `${rawBody}\n\n${dashUrl}` : rawBody,
      html,
    });
    const { info, portUsed } = await sendMailWithFallback(cfg, mailOptions);
    const { accepted, rejected } = assertAcceptedRecipient(info, recipient);
    return {
      sent: true,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response || "",
      from: sender.senderAddr,
      subject,
      provider: cfg.provider,
      portUsed,
    };
  } catch (err) {
    const reason = formatSmtpError(err, cfg);
    console.warn("[mailer] Login welcome email skipped/failed:", reason);
    return {
      sent: false,
      reason,
      from: resolveAlignedSender(cfg).senderAddr,
      subject,
      provider: cfg.provider,
    };
  }
}

export async function sendPasswordResetEmail({ to, resetUrl, config }) {
  const cfg = resolveEmailConfig(config);
  const recipient = String(to || "")
    .trim()
    .toLowerCase();
  if (!cfg.smtp_user || !cfg.smtp_password || !recipient || !resetUrl) {
    return { sent: false, reason: "not_configured" };
  }
  const text = `Reset your IndiFunded password\n\nWe received a request to reset your password for ${recipient}.\nOpen this link to choose a new password:\n${resetUrl}\n\nIf you did not request this, you can safely ignore this email.`;
  const html = buildHtmlEmail({
    title: "Reset your IndiFunded password",
    preheader:
      "Use this link to choose a new password for your IndiFunded account.",
    bodyLines: [
      `We received a request to reset the password for ${recipient}.`,
      "Click the button below to choose a new password for your IndiFunded account.",
      "If you did not request a password change, you can safely ignore this email.",
    ],
    ctaLabel: "Reset Password",
    ctaUrl: resetUrl,
    footerNote:
      "Password security notice from IndiFunded (BRVS Education Pvt Ltd).",
  });
  const { mailOptions } = buildMailOptions({
    cfg,
    to: recipient,
    subject: "Reset your IndiFunded password",
    text,
    html,
  });
  const { info } = await sendMailWithFallback(cfg, mailOptions);
  assertAcceptedRecipient(info, recipient);
  return { sent: true, messageId: info.messageId, accepted: info.accepted };
}

export async function sendTestEmail({
  to,
  name,
  config,
  origin,
  templateType = "test",
}) {
  const cfg = resolveEmailConfig(config);
  const recipient = String(to || "")
    .trim()
    .toLowerCase();

  if (templateType === "welcome") {
    const res = await sendWelcomeEmail({
      to: recipient,
      name: name || recipient.split("@")[0],
      config: { ...cfg, welcome_enabled: true },
      origin,
    });
    if (!res.sent)
      throw new Error(res.reason || "Failed to send welcome test email");
    return res;
  }
  if (templateType === "login") {
    const res = await sendLoginWelcomeEmail({
      to: recipient,
      name: name || recipient.split("@")[0],
      config: { ...cfg, login_welcome_enabled: true },
      origin,
    });
    if (!res.sent)
      throw new Error(res.reason || "Failed to send login welcome test email");
    return res;
  }

  const providerLabel =
    EMAIL_PROVIDERS[cfg.provider]?.label || "Business Email";
  const cleanOrigin =
    origin && !isEphemeralOrigin(origin) ? origin.replace(/\/+$/, "") : "";
  const subject = `IndiFunded email setup verified`;
  const text = `Hi,\n\nYour ${providerLabel} address (${cfg.smtp_user}) is connected and ready to deliver IndiFunded account emails.\n\nBest regards,\nIndiFunded Team`;
  const html = buildHtmlEmail({
    title: subject,
    preheader: `Your ${providerLabel} SMTP connection is verified.`,
    bodyLines: text.split(/\r?\n/),
    ctaLabel: cleanOrigin ? "Open Admin Email Panel" : "",
    ctaUrl: cleanOrigin ? `${cleanOrigin}/admin/email` : "",
  });
  const { sender, mailOptions } = buildMailOptions({
    cfg,
    to: recipient,
    subject,
    text,
    html,
  });
  try {
    const { info, portUsed, fallbackUsed } = await sendMailWithFallback(
      cfg,
      mailOptions,
    );
    const { accepted, rejected } = assertAcceptedRecipient(info, recipient);
    return {
      sent: true,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response || "",
      from: sender.senderAddr,
      subject,
      provider: cfg.provider,
      portUsed,
      fallbackUsed,
    };
  } catch (err) {
    throw new Error(formatSmtpError(err, cfg));
  }
}

export async function sendDirectAdminEmail({
  to,
  name,
  subject,
  message,
  ctaLabel,
  ctaUrl,
  config,
  origin,
}) {
  const cfg = resolveEmailConfig(config);
  const recipient = String(to || "")
    .trim()
    .toLowerCase();
  if (!cfg.smtp_user || !cfg.smtp_password || !recipient) {
    return {
      sent: false,
      reason:
        "Business Gmail / SMTP credentials must be configured before sending.",
    };
  }
  const vars = formatVars({ to: recipient, name, origin });
  const renderedSubject =
    renderEmailTemplate(subject, vars).trim() || "Message from IndiFunded";
  const renderedBody = renderEmailTemplate(message, vars).trim();
  if (!renderedBody) {
    return { sent: false, reason: "Email message body cannot be empty." };
  }
  try {
    const safeUrl = /^https:\/\//i.test(String(ctaUrl || "").trim())
      ? String(ctaUrl).trim()
      : "";
    const html = buildHtmlEmail({
      title: renderedSubject,
      preheader:
        renderedBody.split(/\r?\n/)[0]?.slice(0, 120) || renderedSubject,
      bodyLines: renderedBody.split(/\r?\n/),
      ctaLabel: safeUrl ? String(ctaLabel || "Open IndiFunded").trim() : "",
      ctaUrl: safeUrl,
      footerNote:
        "Sent by IndiFunded Support (BRVS Education Pvt Ltd, Surat, Gujarat). Reply directly to reach our team.",
    });
    const plainText = safeUrl
      ? `${renderedBody}\n\n${ctaLabel || "Link"}: ${safeUrl}`
      : renderedBody;
    const { sender, mailOptions } = buildMailOptions({
      cfg,
      to: recipient,
      subject: renderedSubject,
      text: plainText,
      html,
    });
    const { info, portUsed, fallbackUsed } = await sendMailWithFallback(
      cfg,
      mailOptions,
    );
    const { accepted, rejected } = assertAcceptedRecipient(info, recipient);
    return {
      sent: true,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response || "",
      from: sender.senderAddr,
      replyTo: sender.replyTo || sender.senderAddr,
      subject: renderedSubject,
      provider: cfg.provider,
      portUsed,
      fallbackUsed,
    };
  } catch (err) {
    const reason = formatSmtpError(err, cfg);
    console.warn("[mailer] Direct admin email failed:", reason);
    return {
      sent: false,
      reason,
      from: resolveAlignedSender(cfg).senderAddr,
      subject: renderedSubject,
      provider: cfg.provider,
    };
  }
}

export async function sendAccountBreachEmail({
  to,
  name,
  account,
  breach,
  config,
  origin,
}) {
  const cfg = resolveEmailConfig(config);
  const recipient = String(to || "")
    .trim()
    .toLowerCase();
  if (!cfg.smtp_user || !cfg.smtp_password || !recipient) {
    return { sent: false, reason: "not_configured" };
  }
  const vars = formatVars({ to: recipient, name, origin });
  const acctNo = account?.account_number || account?.id || "Account";
  const planName = account?.plan_name || "IndiFunded Account";
  const reason = breach?.reason || "Risk limit breached";
  const equityVal = `₹${Number(breach?.equity ?? account?.balance ?? 0).toLocaleString("en-IN")}`;
  const breachTime = breach?.breached_at || new Date().toISOString();

  const subject = `Account Failed — ${planName} (${acctNo})`;
  const text = [
    `Hi ${vars.firstName},`,
    "",
    `Your IndiFunded account ${acctNo} (${planName}) has automatically breached its risk limit and is now marked as FAILED.`,
    "",
    `Breach Reason: ${reason}`,
    `Breach Time: ${breachTime}`,
    `Equity at Breach: ${equityVal}`,
    "",
    "New trading orders on this account have been blocked, pending orders cancelled, and open positions closed per our automated risk policy.",
    "",
    "You can review full breach metrics and order history inside your IndiFunded Trader Dashboard.",
    "",
    "Best regards,",
    "IndiFunded Risk Desk",
  ].join("\n");

  const dashUrl = vars.hasPublicUrl ? `${vars.publicOrigin}/app/accounts` : "";
  try {
    const html = buildHtmlEmail({
      title: subject,
      preheader: `Account ${acctNo} status update: risk limit breached.`,
      bodyLines: text.split(/\r?\n/),
      ctaLabel: dashUrl ? "View Account Details" : "",
      ctaUrl: dashUrl,
      footerNote: "Automated account status alert from IndiFunded Risk Desk.",
    });
    const { sender, mailOptions } = buildMailOptions({
      cfg,
      to: recipient,
      subject,
      text: dashUrl ? `${text}\n\n${dashUrl}` : text,
      html,
    });
    const { info } = await sendMailWithFallback(cfg, mailOptions);
    const { accepted, rejected } = assertAcceptedRecipient(info, recipient);
    return {
      sent: true,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response || "",
      from: sender.senderAddr,
      subject,
      provider: cfg.provider,
    };
  } catch (err) {
    const errMsg = formatSmtpError(err, cfg);
    console.warn("[mailer] Breach email skipped/failed:", errMsg);
    return {
      sent: false,
      reason: errMsg,
      from: resolveAlignedSender(cfg).senderAddr,
      subject,
      provider: cfg.provider,
    };
  }
}

export async function sendChallengePassedEmail({
  to,
  name,
  challengeAccount,
  fundedAccount,
  config,
  origin,
}) {
  const cfg = resolveEmailConfig(config);
  const recipient = String(to || "")
    .trim()
    .toLowerCase();
  if (!cfg.smtp_user || !cfg.smtp_password || !recipient) {
    return { sent: false, reason: "not_configured" };
  }
  const vars = formatVars({ to: recipient, name, origin });
  const acctNo =
    challengeAccount?.account_number || challengeAccount?.id || "Challenge";
  const fundedNo = fundedAccount?.account_number || "";
  const planName = challengeAccount?.plan_name || "1-Step Challenge";

  const subject = `Challenge Passed — ${planName} (${acctNo})`;
  const text = [
    `Hi ${vars.firstName},`,
    "",
    `Congratulations! You have passed all rules and objectives for ${planName} (${acctNo}).`,
    fundedNo
      ? `Your funded account (${fundedNo}) has been automatically activated and is ready in your dashboard.`
      : "Your account is now marked as eligible for funded account activation.",
    "",
    "Best regards,",
    "IndiFunded Team",
  ].join("\n");

  const dashUrl = vars.hasPublicUrl ? `${vars.publicOrigin}/app/accounts` : "";
  try {
    const html = buildHtmlEmail({
      title: subject,
      preheader: `Your ${planName} (${acctNo}) objective is complete.`,
      bodyLines: text.split(/\r?\n/),
      ctaLabel: dashUrl ? "Open Trader Dashboard" : "",
      ctaUrl: dashUrl,
      footerNote: "Automated evaluation status update from IndiFunded.",
    });
    const { sender, mailOptions } = buildMailOptions({
      cfg,
      to: recipient,
      subject,
      text: dashUrl ? `${text}\n\n${dashUrl}` : text,
      html,
    });
    const { info } = await sendMailWithFallback(cfg, mailOptions);
    const { accepted, rejected } = assertAcceptedRecipient(info, recipient);
    return {
      sent: true,
      messageId: info.messageId,
      accepted,
      rejected,
      response: info.response || "",
      from: sender.senderAddr,
      subject,
      provider: cfg.provider,
    };
  } catch (err) {
    const errMsg = formatSmtpError(err, cfg);
    console.warn("[mailer] Challenge passed email skipped/failed:", errMsg);
    return {
      sent: false,
      reason: errMsg,
      from: resolveAlignedSender(cfg).senderAddr,
      subject,
      provider: cfg.provider,
    };
  }
}
