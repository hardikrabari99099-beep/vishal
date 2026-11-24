/**
 * Builds direct deep-links for popular Indian UPI apps (GPay, PhonePe, Paytm, BHIM/Any UPI)
 * preserving all Razorpay/merchant UPI query parameters and guaranteeing the payable amount (`am`).
 */
export function buildUpiAppOptions({
  upiLink = "",
  upiId = "",
  brandName = "IndiFunded",
  amount = 0,
  note = "",
}) {
  let params = new URLSearchParams();
  const raw = String(upiLink || "").trim();
  if (raw.toLowerCase().startsWith("upi://")) {
    const qIdx = raw.indexOf("?");
    if (qIdx !== -1) {
      params = new URLSearchParams(raw.slice(qIdx + 1));
    }
  }
  if (!params.get("pa") && upiId) {
    params.set("pa", String(upiId).trim());
  }
  if (!params.get("pn") && brandName) {
    params.set("pn", String(brandName).trim());
  }
  const numericAmount = Number(amount);
  if (
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    (!params.get("am") || Number(params.get("am")) <= 0)
  ) {
    params.set("am", numericAmount.toFixed(2));
  }
  if (!params.get("cu")) {
    params.set("cu", "INR");
  }
  if (!params.get("tn") && note) {
    params.set("tn", String(note).trim());
  }

  const queryString = params.toString();
  const hasPayee = Boolean(params.get("pa"));
  const mk = (scheme) => (hasPayee ? `${scheme}?${queryString}` : "#");

  return {
    queryString,
    upiUrl: mk("upi://pay"),
    apps: [
      {
        id: "gpay",
        name: "Google Pay",
        badge: "GPay",
        color: "#4285F4",
        href: mk("tez://upi/pay"),
      },
      {
        id: "phonepe",
        name: "PhonePe",
        badge: "Pe",
        color: "#5f259f",
        href: mk("phonepe://pay"),
      },
      {
        id: "paytm",
        name: "Paytm",
        badge: "Paytm",
        color: "#00baf2",
        href: mk("paytmmp://pay"),
      },
      {
        id: "bhim",
        name: "BHIM / Any UPI",
        badge: "UPI",
        color: "#f59e0b",
        href: mk("upi://pay"),
      },
    ],
  };
}
