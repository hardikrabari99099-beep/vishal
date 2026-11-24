import { describe, expect, it } from "vitest";
import {
  buildVerificationUrl,
  generateCertificateCode,
  generateQrDataUrl,
  parseQrVerificationInput,
} from "@/lib/payout-cert-qr";
import { handleApi } from "@/server/api-handler";

async function callApi(splat: string, init: RequestInit = {}) {
  const path = splat.replace(/^\/+/, "");
  const req = new Request(`http://localhost/api/${path}`, init);
  return handleApi(req, path.split("?")[0] || "");
}

async function adminToken(): Promise<string> {
  const res = await callApi("auth/admin-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "owner@indifunded.com",
      password: "Indi#Admin2026!",
    }),
  });
  const data = (await res.json()) as { token?: string };
  return data.token || "";
}

describe("QR payout certificate helpers", () => {
  it("generates unique certificate codes and clean verification URLs", () => {
    const code = generateCertificateCode();
    expect(code).toMatch(/^IF-CERT-[A-Z0-9]{6}$/);
    expect(buildVerificationUrl(code, "https://indifunded.com")).toBe(
      `https://indifunded.com/verify-payout?code=${code}`,
    );
  });

  it("parses QR verification URLs, JSON payloads, and plain codes", () => {
    expect(
      parseQrVerificationInput(
        "https://indifunded.com/verify-payout?code=IF-CERT-9X2K4P",
      ).query,
    ).toBe("IF-CERT-9X2K4P");

    expect(parseQrVerificationInput("/verify-payout?q=PO-1042").query).toBe(
      "PO-1042",
    );
    expect(
      parseQrVerificationInput("https://indifunded.com/verify/CERT-77").query,
    ).toBe("CERT-77");

    const jsonParsed = parseQrVerificationInput(
      JSON.stringify({
        code: "IF-CERT-112233",
        trader_name: "Rohan",
        amount: 45000,
      }),
    );
    expect(jsonParsed.query).toBe("IF-CERT-112233");
    expect(jsonParsed.meta?.trader_name).toBe("Rohan");

    expect(parseQrVerificationInput("  IF-CERT-ABCD12  ").query).toBe(
      "IF-CERT-ABCD12",
    );
  });

  it("renders a scannable PNG QR data URL", async () => {
    const url = await generateQrDataUrl(
      "https://indifunded.com/verify-payout?code=IF-CERT-1001",
    );
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    expect(url.length).toBeGreaterThan(200);
  });
});

describe("QR payout certificate API & public Verify by QR lookup", () => {
  it("saves a certificate template, creates a QR certificate, and verifies without leaking email or full UTR", async () => {
    const token = await adminToken();
    expect(token.length).toBeGreaterThan(10);

    // Save custom certificate design template
    const tplRes = await callApi("admin/certificate-template", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        design_url: "data:image/png;base64,iVBORw0KGgo=",
        layout: { qrCorner: "bottom-right", qrSizePct: 18 },
      }),
    });
    expect(tplRes.status).toBe(200);

    // Create a QR certificate
    const createRes = await callApi("certificates", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
        trader_name: "Hardik Rabari",
        amount: 55000,
        plan: "Pro",
        account_size: 300000,
        payout_date: "17/11/2026",
        certificate_code: "IF-CERT-HR55K",
        payout_id: "PO-2099",
        utr: "SBIN9876543210",
        trader_email: "private.trader@example.com",
        visible: true,
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as Record<string, unknown>;
    expect(created["certificate_code"]).toBe("IF-CERT-HR55K");
    expect(created["utr_last4"]).toBe("3210");

    // Verify by certificate_code
    const verifyByCode = await callApi("public/verify-payout?q=IF-CERT-HR55K");
    expect(verifyByCode.status).toBe(200);
    const rows = (await verifyByCode.json()) as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0]?.["trader_name"]).toBe("Hardik Rabari");
    expect(rows[0]?.["amount"]).toBe(55000);
    expect(rows[0]?.["payout_id"]).toBe("PO-2099");
    expect(rows[0]?.["utr_last4"]).toBe("3210");
    expect(rows[0]?.["trader_email"]).toBeUndefined();

    // Verify by payout_id
    const verifyByPayoutId = await callApi("public/verify-payout?q=po-2099");
    expect(verifyByPayoutId.status).toBe(200);
  });
});
