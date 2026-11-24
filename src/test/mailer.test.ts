import { describe, expect, it } from "vitest";
import {
  DEFAULT_EMAIL_CONFIG,
  EMAIL_PROVIDERS,
  formatSmtpError,
  formatVars,
  isEphemeralOrigin,
  normalizeSmtpPassword,
  renderEmailTemplate,
  resolveAlignedSender,
  resolveEmailConfig,
  sanitizeEmailConfigForAdmin,
  sendLoginWelcomeEmail,
  sendWelcomeEmail,
} from "../server/mailer";

describe("Business Gmail & Mailer", () => {
  it("defaults to Gmail SMTP and strips spaces from 16-char Google App Passwords", () => {
    expect(DEFAULT_EMAIL_CONFIG.provider).toBe("gmail");
    expect(EMAIL_PROVIDERS.gmail.smtp_host).toBe("smtp.gmail.com");
    expect(EMAIL_PROVIDERS.gmail.smtp_port).toBe(465);
    expect(normalizeSmtpPassword("gmail", "abcd efgh ijkl mnop")).toBe(
      "abcdefghijklmnop",
    );
    expect(normalizeSmtpPassword("titan", "keep spaces intact")).toBe(
      "keep spaces intact",
    );
  });

  it("never exposes smtp_password when sanitizing config for admin UI", () => {
    const safe = sanitizeEmailConfigForAdmin({
      provider: "gmail",
      smtp_user: "growthloopp@gmail.com",
      smtp_password: "abcd efgh ijkl mnop",
    });
    expect(safe.has_password).toBe(true);
    expect(safe.configured).toBe(true);
    expect("smtp_password" in safe).toBe(false);
  });

  it("interpolates welcome template variables cleanly", () => {
    const out = renderEmailTemplate(
      "Hi {{name}} ({{email}}) — visit {{app_url}}",
      {
        firstName: "Rahul",
        fullName: "Rahul Sharma",
        email: "rahul@example.com",
        appUrl: "https://indifunded.com",
        loginTime: "17 Nov 2026",
      },
    );
    expect(out).toBe(
      "Hi Rahul (rahul@example.com) — visit https://indifunded.com",
    );
  });

  it("strips ephemeral preview origins from automated email variables", () => {
    expect(isEphemeralOrigin("https://ais-dev-abc123.run.app")).toBe(true);
    expect(isEphemeralOrigin("http://localhost:3000")).toBe(true);
    expect(isEphemeralOrigin("https://indifunded.com")).toBe(false);

    const previewVars = formatVars({
      to: "User@Gmail.com ",
      name: "Rahul Sharma",
      origin: "https://ais-dev-abc123.run.app",
    });
    expect(previewVars.email).toBe("user@gmail.com");
    expect(previewVars.hasPublicUrl).toBe(false);
    expect(previewVars.appUrl).toBe("your IndiFunded Trader Dashboard");

    const prodVars = formatVars({
      to: "user@gmail.com",
      name: "Rahul Sharma",
      origin: "https://indifunded.com",
    });
    expect(prodVars.hasPublicUrl).toBe(true);
    expect(prodVars.appUrl).toBe("https://indifunded.com");
  });

  it("gracefully skips sending when not configured or disabled", async () => {
    const resSignup = await sendWelcomeEmail({
      to: "trader@example.com",
      name: "Trader",
      config: { smtp_user: "", smtp_password: "" },
      origin: "https://indifunded.com",
    });
    expect(resSignup.sent).toBe(false);
    expect(resSignup.reason).toBe("not_configured");

    const resLogin = await sendLoginWelcomeEmail({
      to: "trader@example.com",
      name: "Trader",
      config: {
        smtp_user: "a@gmail.com",
        smtp_password: "secret",
        login_welcome_enabled: false,
      },
      origin: "https://indifunded.com",
    });
    expect(resLogin.sent).toBe(false);
  });

  it("resolves gmail provider cleanly from stored settings", () => {
    const cfg = resolveEmailConfig({
      provider: "gmail",
      smtp_user: "growthloopp@gmail.com",
      smtp_password: "wxyz 1234 abcd 5678",
    });
    expect(cfg.smtp_host).toBe("smtp.gmail.com");
    expect(cfg.smtp_password).toBe("wxyz1234abcd5678");
  });

  it("aligns mismatched From domain on Gmail to smtp_user and preserves Reply-To to avoid Spam", () => {
    const aligned = resolveAlignedSender({
      provider: "gmail",
      smtp_user: "growthloopp@gmail.com",
      from_email: "support@indifunded.com",
      from_name: "IndiFunded",
    });
    expect(aligned.senderAddr).toBe("growthloopp@gmail.com");
    expect(aligned.replyTo).toBe("support@indifunded.com");
    expect(aligned.wasAligned).toBe(true);
    expect(aligned.header).toContain("growthloopp@gmail.com");

    const sameDomain = resolveAlignedSender({
      provider: "gmail",
      smtp_user: "admin@indifunded.com",
      from_email: "support@indifunded.com",
      from_name: "IndiFunded",
    });
    expect(sameDomain.senderAddr).toBe("support@indifunded.com");
    expect(sameDomain.wasAligned).toBe(false);
  });

  it("formats Gmail 535 App Password and timeout errors cleanly", () => {
    expect(
      formatSmtpError(
        new Error("535-5.7.8 Username and Password not accepted"),
        {
          provider: "gmail",
        },
      ),
    ).toContain("16-character Google App Password");
    expect(
      formatSmtpError(new Error("Connection timeout"), {
        provider: "custom",
        smtp_host: "smtp.example.com",
        smtp_port: 587,
      }),
    ).toContain("587");
  });
});
