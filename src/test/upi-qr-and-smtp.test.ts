import { afterEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";

async function apiCall(
  method: string,
  path: string,
  { body, token }: { body?: unknown; token?: string } = {},
) {
  const { handleApi } = await import("@/server/api-handler");
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["authorization"] = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const req = new Request(`http://localhost:3000/api/${cleanPath}`, init);
  const splat = cleanPath.split("?")[0] || "";
  const res = await handleApi(req, splat);
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

describe("SMTP port failover & UPI QR fallback", () => {
  const origRzpId = process.env["RAZORPAY_KEY_ID"];
  const origRzpSecret = process.env["RAZORPAY_KEY_SECRET"];

  afterEach(() => {
    vi.restoreAllMocks();
    if (origRzpId === undefined) delete process.env["RAZORPAY_KEY_ID"];
    else process.env["RAZORPAY_KEY_ID"] = origRzpId;
    if (origRzpSecret === undefined) delete process.env["RAZORPAY_KEY_SECRET"];
    else process.env["RAZORPAY_KEY_SECRET"] = origRzpSecret;
  });

  it("retries SMTP port 465 SSL over IPv4 automatically when port 587 STARTTLS times out", async () => {
    const portsAttempted: Array<{
      port: number;
      secure: boolean;
      family?: number;
    }> = [];

    vi.spyOn(nodemailer, "createTransport").mockImplementation(((
      opts: Record<string, unknown>,
    ) => {
      const port = Number(opts["port"]);
      const secure = Boolean(opts["secure"]);
      const family = opts["family"] ? Number(opts["family"]) : undefined;
      portsAttempted.push({ port, secure, family });
      return {
        sendMail: vi.fn(async () => {
          if (port === 587) {
            const err = new Error("Connection timeout") as Error & {
              code?: string;
            };
            err.code = "ETIMEDOUT";
            throw err;
          }
          return {
            messageId: "<fallback-ok@gmail.com>",
            accepted: ["trader@example.com"],
            rejected: [],
            response: "250 2.0.0 OK",
          };
        }),
        close: vi.fn(),
      } as unknown as ReturnType<typeof nodemailer.createTransport>;
    }) as typeof nodemailer.createTransport);

    const { sendTestEmail } = await import("@/server/mailer");
    const res = await sendTestEmail({
      to: "trader@example.com",
      name: "Trader",
      origin: "https://indifunded.com",
      config: {
        provider: "gmail",
        smtp_host: "smtp.gmail.com",
        smtp_port: 587,
        smtp_secure: false,
        smtp_user: "indifunded@gmail.com",
        smtp_password: "abcd efgh ijkl mnop",
      },
    });

    expect(res.sent).toBe(true);
    expect(res.portUsed).toBe(465);
    expect(res.fallbackUsed).toBe(true);
    expect(portsAttempted).toEqual([
      { port: 587, secure: false, family: 4 },
      { port: 465, secure: true, family: 4 },
    ]);
  });

  it("does not retry when Gmail rejects credentials with 535 EAUTH", async () => {
    let attempts = 0;
    vi.spyOn(nodemailer, "createTransport").mockImplementation((() => {
      attempts += 1;
      return {
        sendMail: vi.fn(async () => {
          const err = new Error(
            "535-5.7.8 Username and Password not accepted",
          ) as Error & { code?: string };
          err.code = "EAUTH";
          throw err;
        }),
        close: vi.fn(),
      } as unknown as ReturnType<typeof nodemailer.createTransport>;
    }) as typeof nodemailer.createTransport);

    const { sendTestEmail } = await import("@/server/mailer");
    await expect(
      sendTestEmail({
        to: "trader@example.com",
        name: "Trader",
        origin: "https://indifunded.com",
        config: {
          provider: "gmail",
          smtp_host: "smtp.gmail.com",
          smtp_port: 587,
          smtp_user: "indifunded@gmail.com",
          smtp_password: "wrongpassword",
        },
      }),
    ).rejects.toThrow("16-character Google App Password");
    expect(attempts).toBe(1);
  });

  it("generates a scannable UPI QR image on /orders/razorpay/create without Razorpay keys and updates order on UTR submit", async () => {
    delete process.env["RAZORPAY_KEY_ID"];
    delete process.env["RAZORPAY_KEY_SECRET"];

    const qrRes = await apiCall("POST", "/orders/razorpay/create", {
      body: {
        plan_id: "plan-starter",
        customer_name: "QR Tester",
        customer_email: "qrtester@example.com",
        customer_phone: "9876543210",
      },
    });
    expect(qrRes.status).toBe(200);
    expect(qrRes.data.order_id).toBeTruthy();
    expect(qrRes.data.payment_mode).toBe("upi_qr");
    expect(qrRes.data.qr_image).toMatch(/^data:image\/png;base64,/);
    expect(qrRes.data.upi_link).toContain("upi://pay?");
    expect(qrRes.data.upi_id).toBeTruthy();

    const utrRes = await apiCall("POST", "/orders/upi", {
      body: {
        order_id: qrRes.data.order_id,
        plan_id: "plan-starter",
        customer_name: "QR Tester",
        customer_email: "qrtester@example.com",
        customer_phone: "9876543210",
        utr: "412345678901",
      },
    });
    expect(utrRes.status).toBe(200);
    expect(utrRes.data.id).toBe(qrRes.data.order_id);
    expect(utrRes.data.status).toBe("pending_verification");
    expect(utrRes.data.utr).toBe("412345678901");
  });

  it("generates a UPI QR fallback for /league/register and confirms UTR via /league/confirm-upi", async () => {
    delete process.env["RAZORPAY_KEY_ID"];
    delete process.env["RAZORPAY_KEY_SECRET"];
    process.env["ADMIN_EMAIL"] = "admin@indifunded.com";
    process.env["ADMIN_PASSWORD"] = "TestAdminPass!2026";

    const adm = await apiCall("POST", "/auth/admin-login", {
      body: { email: "admin@indifunded.com", password: "TestAdminPass!2026" },
    });
    expect(adm.status).toBe(200);
    const enableRes = await apiCall("PUT", "/league/config", {
      token: String(adm.data.token || ""),
      body: { enabled: true },
    });
    expect(enableRes.status).toBe(200);

    const regRes = await apiCall("POST", "/league/register", {
      body: {
        full_name: "League QR Trader",
        email: "leaguetester@example.com",
        phone: "9876543210",
        is_existing_trader: false,
      },
    });
    expect(regRes.status).toBe(200);
    expect(regRes.data.registration_id).toBeTruthy();
    expect(regRes.data.payment_mode).toBe("upi_qr");
    expect(regRes.data.qr_image).toMatch(/^data:image\/png;base64,/);

    const confirmRes = await apiCall("POST", "/league/confirm-upi", {
      body: {
        registration_id: regRes.data.registration_id,
        utr: "412345678999",
      },
    });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.data.status).toBe("pending_verification");
  });
});
