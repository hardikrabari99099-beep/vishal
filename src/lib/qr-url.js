export function buildVerificationUrl(code, originOverride = "") {
  const cleanCode = String(code || "").trim();
  const origin =
    originOverride ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://indifunded.com");
  return `${origin.replace(/\/$/, "")}/verify-payout?code=${encodeURIComponent(cleanCode)}`;
}

/**
 * Extracts a lookup code/ID and optional structured metadata from any scanned QR string.
 * Supports:
 * - Full verification URLs: https://.../verify-payout?code=IF-CERT-123456 or ?q=PO-1001
 * - Credential path URLs: https://.../verify/IF-CERT-123456
 * - JSON payloads: {"code":"IF-CERT-123456","trader_name":"...","amount":50000}
 * - Plain code strings: IF-CERT-123456 / PO-1001
 */
export function parseQrVerificationInput(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return { query: "", meta: null };

  // JSON payload support
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") {
        const query = String(
          obj.certificate_code ||
            obj.code ||
            obj.payout_id ||
            obj.id ||
            obj.q ||
            "",
        ).trim();
        return {
          query,
          meta: {
            certificate_code: obj.certificate_code || obj.code || "",
            payout_id: obj.payout_id || "",
            trader_name: obj.trader_name || obj.name || "",
            amount: obj.amount || "",
            date: obj.payout_date || obj.date || "",
            plan: obj.plan || "",
          },
        };
      }
    } catch {
      // fall through
    }
  }

  // URL parsing (?code= / ?q= / ?id= or /verify/<code>)
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) {
    try {
      const u = new URL(raw, "https://indifunded.com");
      const paramCode =
        u.searchParams.get("code") ||
        u.searchParams.get("q") ||
        u.searchParams.get("id") ||
        "";
      if (paramCode.trim()) {
        return { query: paramCode.trim(), meta: null };
      }
      const matchVerify = u.pathname.match(/\/verify(?:-payout)?\/([^/?#]+)/i);
      if (matchVerify?.[1]) {
        return { query: decodeURIComponent(matchVerify[1]).trim(), meta: null };
      }
    } catch {
      // fall through
    }
  }

  return { query: raw.slice(0, 120), meta: null };
}
