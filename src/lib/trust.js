// Shared, browser-safe helpers for Trust & Transparency content.

/** Keep only the last 4 digits/characters of a UTR. Never returns more than 4. */
export function utrLast4(value) {
  const clean = String(value ?? "").replace(/[^0-9a-z]/gi, "");
  return clean.slice(-4);
}

/** Display form of a UTR: "•••• 1234" (or "—" when empty). */
export function maskUtr(value) {
  const last = utrLast4(value);
  return last ? `•••• ${last}` : "—";
}

const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

/** Find a published payout proof by its exact Payout ID (case-insensitive). */
export function findPayoutProof(proofs, payoutId) {
  const q = norm(payoutId);
  if (!q) return null;
  return (
    (proofs || []).find(
      (p) => p && p.enabled !== false && norm(p.payout_id) === q,
    ) || null
  );
}

/** Find a published certificate/award by its verification code. */
export function findCredential(credentials, code) {
  const q = norm(code);
  if (!q) return null;
  return (
    (credentials || []).find(
      (c) => c && c.enabled !== false && norm(c.code) === q,
    ) || null
  );
}

/** Only allow https links (for documents, socials). */
export function safeHttps(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" ? u.toString() : "";
  } catch {
    return "";
  }
}

export function formatAmount(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || !String(v ?? "").trim()) return String(v ?? "");
  return "₹" + n.toLocaleString("en-IN");
}
