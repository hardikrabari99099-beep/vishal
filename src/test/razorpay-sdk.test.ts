import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildRazorpayOrderPayload,
  buildRazorpayQrPayload,
  createRazorpayClient,
  getRazorpayCredentials,
  hasValidRazorpayKeys,
  isAllowedRazorpayImageUrl,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from "@/server/razorpay-client";

async function apiCall(
  method: string,
  path: string,
  {
    body,
    rawBody,
    headers: extraHeaders,
  }: {
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const { handleApi } = await import("@/server/api-handler");
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const headers: Record<string, string> = { ...(extraHeaders || {}) };
  if (body !== undefined) headers["content-type"] = "application/json";
  const init: RequestInit = { method, headers };
  if (rawBody !== undefined) init.body = rawBody;
  else if (body !== undefined) init.body = JSON.stringify(body);
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

describe("Official Razorpay SDK initialization, payloads, and verification", () => {
  const origId = process.env["RAZORPAY_KEY_ID"];
  const origSecret = process.env["RAZORPAY_KEY_SECRET"];
  const origWebhook = process.env["RAZORPAY_WEBHOOK_SECRET"];

  afterEach(() => {
    vi.restoreAllMocks();
    if (origId === undefined) delete process.env["RAZORPAY_KEY_ID"];
    else process.env["RAZORPAY_KEY_ID"] = origId;
    if (origSecret === undefined) delete process.env["RAZORPAY_KEY_SECRET"];
    else process.env["RAZORPAY_KEY_SECRET"] = origSecret;
    if (origWebhook === undefined)
      delete process.env["RAZORPAY_WEBHOOK_SECRET"];
    else process.env["RAZORPAY_WEBHOOK_SECRET"] = origWebhook;
  });

  it("initializes Razorpay SDK with trimmed keys, ignores placeholders, and refreshes client when keys change", () => {
    const emptyCreds = getRazorpayCredentials((name) =>
      name === "RAZORPAY_KEY_ID" ? "MY_RAZORPAY_KEY" : "  ",
    );
    expect(hasValidRazorpayKeys(emptyCreds)).toBe(false);

    const credsA = getRazorpayCredentials((name) =>
      name === "RAZORPAY_KEY_ID"
        ? " rzp_test_keyA "
        : name === "RAZORPAY_KEY_SECRET"
          ? " secretA \n"
          : "",
    );
    expect(hasValidRazorpayKeys(credsA)).toBe(true);
    const clientA = createRazorpayClient(credsA);
    expect(clientA.key_id).toBe("rzp_test_keyA");
    expect(clientA.key_secret).toBe("secretA");
    expect(typeof clientA.qrCode.create).toBe("function");
    expect(typeof clientA.orders.create).toBe("function");

    const clientB = createRazorpayClient({
      keyId: "rzp_test_keyB",
      keySecret: "secretB",
    });
    expect(clientB).not.toBe(clientA);
    expect(clientB.key_id).toBe("rzp_test_keyB");
  });

  it("builds valid Razorpay QR and Order request structures with sanitized labels and notes", () => {
    const qrPayload = buildRazorpayQrPayload({
      orderId: "ord-123",
      planName: "Instant Funding ₹1,00,000 (Intraday)",
      productType: "instant_funding",
      customerEmail: "trader@example.com",
      amountPaise: 499900,
    });
    expect(qrPayload.type).toBe("upi_qr");
    expect(qrPayload.usage).toBe("single_use");
    expect(qrPayload.fixed_amount).toBe(true);
    expect(qrPayload.payment_amount).toBe(499900);
    expect(qrPayload.name).not.toContain("₹");
    expect(qrPayload.name.length).toBeLessThanOrEqual(50);
    expect(qrPayload.close_by).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 900,
    );
    expect(qrPayload.notes).toEqual({
      order_id: "ord-123",
      plan: "Instant Funding ₹1,00,000 (Intraday)",
      product_type: "instant_funding",
      email: "trader@example.com",
    });

    const orderPayload = buildRazorpayOrderPayload({
      receiptId: "ord-123-long-uuid-with-extra-suffix-0123456789",
      amountPaise: 149900,
      notes: { kind: "league", empty: undefined, nothing: null },
    });
    expect(orderPayload.amount).toBe(149900);
    expect(orderPayload.currency).toBe("INR");
    expect(orderPayload.receipt.length).toBeLessThanOrEqual(40);
    expect(orderPayload.notes).toEqual({ kind: "league" });
  });

  it("verifies Razorpay payment and webhook HMAC-SHA256 signatures accurately", () => {
    const secret = "rzp_secret_12345";
    const orderId = "order_Abc123";
    const paymentId = "pay_Xyz987";
    const validSig = createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    expect(
      verifyRazorpayPaymentSignature({
        orderId,
        paymentId,
        signature: validSig,
        keySecret: secret,
      }),
    ).toBe(true);
    expect(
      verifyRazorpayPaymentSignature({
        orderId,
        paymentId,
        signature: validSig.replace(/^./, validSig[0] === "a" ? "b" : "a"),
        keySecret: secret,
      }),
    ).toBe(false);

    const rawBody = JSON.stringify({ event: "payment.captured" });
    const whSecret = "whsec_999";
    const whSig = createHmac("sha256", whSecret).update(rawBody).digest("hex");
    expect(
      verifyRazorpayWebhookSignature({
        rawBody,
        signature: whSig,
        webhookSecret: whSecret,
      }),
    ).toBe(true);
  });

  it("creates Razorpay QR via SDK when enabled and falls back to orders.create + UPI QR when QR API rejects", async () => {
    process.env["RAZORPAY_KEY_ID"] = "rzp_test_mock_id";
    process.env["RAZORPAY_KEY_SECRET"] = "rzp_test_mock_secret";

    const client = createRazorpayClient({
      keyId: "rzp_test_mock_id",
      keySecret: "rzp_test_mock_secret",
    });

    // Case 1: Razorpay QR Code API succeeds
    const qrCreateSpy = vi.spyOn(client.qrCode, "create").mockResolvedValue({
      id: "qr_Test123",
      entity: "qr_code",
      created_at: 1700000000,
      name: "IndiFunded - Starter",
      usage: "single_use",
      type: "upi_qr",
      image_url: "https://rzp.io/i/mock-qr-code",
      payment_amount: 149900,
      status: "active",
      payments_amount_received: 0,
      payments_count_received: 0,
      closed_at: 0,
      fixed_amount: true,
    });

    const okRes = await apiCall("POST", "/orders/razorpay/create", {
      body: {
        plan_id: "plan-starter",
        customer_name: "SDK Tester",
        customer_email: "sdk@example.com",
        customer_phone: "9876543210",
      },
    });
    expect(okRes.status).toBe(200);
    expect(qrCreateSpy).toHaveBeenCalledTimes(1);
    expect(okRes.data.payment_mode).toBe("razorpay_qr");
    expect(okRes.data.qr_id).toBe("qr_Test123");
    expect(okRes.data.qr_image).toBe("https://rzp.io/i/mock-qr-code");
    expect(okRes.data.razorpay_configured).toBe(true);

    // Case 2: Razorpay QR Code API fails (e.g. Smart QR not enabled), pre-creates Checkout order + dynamic UPI QR fallback
    qrCreateSpy.mockRejectedValueOnce({
      statusCode: 400,
      error: {
        code: "BAD_REQUEST_ERROR",
        description: "The QR code feature is not enabled for your account",
      },
    });
    const orderCreateSpy = vi.spyOn(client.orders, "create").mockResolvedValue({
      id: "order_CheckoutFallback1",
      entity: "order",
      amount: 149900,
      amount_paid: 0,
      amount_due: 149900,
      currency: "INR",
      receipt: "rcpt_1",
      status: "created",
      attempts: 0,
      created_at: 1700000000,
    });

    const fbRes = await apiCall("POST", "/orders/razorpay/create", {
      body: {
        plan_id: "plan-starter",
        customer_name: "Fallback Tester",
        customer_email: "fallback@example.com",
        customer_phone: "9876543210",
      },
    });
    expect(fbRes.status).toBe(200);
    expect(orderCreateSpy).toHaveBeenCalledTimes(1);
    expect(fbRes.data.payment_mode).toBe("upi_qr");
    expect(fbRes.data.qr_image).toMatch(/^data:image\/png;base64,/);
    expect(fbRes.data.razorpay_order_id).toBe("order_CheckoutFallback1");
    expect(fbRes.data.key_id).toBe("rzp_test_mock_id");
    expect(fbRes.data.razorpay_fallback_reason).toContain(
      "QR code feature is not enabled",
    );

    // Checkout verification completes the existing order
    const payId = "pay_Valid123";
    const sig = createHmac("sha256", "rzp_test_mock_secret")
      .update(`order_CheckoutFallback1|${payId}`)
      .digest("hex");
    const verifyRes = await apiCall("POST", "/orders/razorpay/verify", {
      body: {
        razorpay_order_id: "order_CheckoutFallback1",
        razorpay_payment_id: payId,
        razorpay_signature: sig,
      },
    });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.data.status).toBe("completed");
    expect(verifyRes.data.id).toBe(fbRes.data.order_id);
  });

  it("validates Razorpay QR image URLs against SSRF and serves PNG via /orders/razorpay/qr-image/:id", async () => {
    expect(isAllowedRazorpayImageUrl("https://rzp.io/i/AbCd1234")).toBe(true);
    expect(
      isAllowedRazorpayImageUrl("https://api.razorpay.com/v1/qr.png"),
    ).toBe(true);
    expect(isAllowedRazorpayImageUrl("http://rzp.io/i/AbCd1234")).toBe(false);
    expect(isAllowedRazorpayImageUrl("https://127.0.0.1/secret")).toBe(false);
    expect(isAllowedRazorpayImageUrl("https://169.254.169.254/latest")).toBe(
      false,
    );
    expect(isAllowedRazorpayImageUrl("https://evil.example.com/qr.png")).toBe(
      false,
    );

    process.env["RAZORPAY_KEY_ID"] = "rzp_test_proxy_id";
    process.env["RAZORPAY_KEY_SECRET"] = "rzp_test_proxy_secret";
    const client = createRazorpayClient({
      keyId: "rzp_test_proxy_id",
      keySecret: "rzp_test_proxy_secret",
    });
    vi.spyOn(client.qrCode, "create").mockResolvedValue({
      id: "qr_Proxy123",
      entity: "qr_code",
      created_at: 1700000000,
      name: "IndiFunded - Starter",
      usage: "single_use",
      type: "upi_qr",
      image_url: "https://rzp.io/i/proxy-qr-html",
      payment_amount: 149900,
      status: "active",
      payments_amount_received: 0,
      payments_count_received: 0,
      closed_at: 0,
      fixed_amount: true,
    });

    const createRes = await apiCall("POST", "/orders/razorpay/create", {
      body: {
        plan_id: "plan-starter",
        customer_name: "Proxy Tester",
        customer_email: "proxy@example.com",
        customer_phone: "9876543210",
      },
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.qr_proxy_url).toBe(
      `/api/orders/razorpay/qr-image/${createRes.data.order_id}`,
    );

    const origFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const target = typeof input === "string" ? input : input.toString();
      if (target === "https://rzp.io/i/proxy-qr-html") {
        return new Response(
          `<html><body><a href="upi://pay?pa=rzp@icici&amp;pn=IndiFunded&amp;am=1499.00&amp;cu=INR">Pay</a></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return origFetch(input, init);
    });

    const { handleApi } = await import("@/server/api-handler");
    const imgReq = new Request(
      `http://localhost:3000/api/orders/razorpay/qr-image/${createRes.data.order_id}`,
    );
    const imgRes = await handleApi(
      imgReq,
      `orders/razorpay/qr-image/${createRes.data.order_id}`,
    );
    expect(imgRes.status).toBe(200);
    expect(imgRes.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(100);
    // PNG magic bytes
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
  });
});
