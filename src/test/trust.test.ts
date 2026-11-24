import { describe, expect, it } from "vitest";
import {
  utrLast4,
  maskUtr,
  findPayoutProof,
  findCredential,
} from "@/lib/trust";

describe("payout proofs show only the last 4 UTR digits", () => {
  it("cuts a full UTR down to its last 4 digits", () => {
    expect(utrLast4("SBIN324567891234")).toBe("1234");
    expect(maskUtr("324567895678")).toBe("•••• 5678");
  });
});

describe("public payout verification by Payout ID", () => {
  const proofs = [
    { payout_id: "PO-1001", amount: "15000", enabled: true },
    { payout_id: "PO-1002", amount: "9000", enabled: false },
  ];
  it("finds a published payout by its ID", () => {
    expect(findPayoutProof(proofs, " po-1001 ")?.amount).toBe("15000");
  });
  it("does not reveal unpublished payouts", () => {
    expect(findPayoutProof(proofs, "PO-1002")).toBeNull();
  });
});

describe("certificate QR verification", () => {
  it("matches only published codes", () => {
    const list = [
      { code: "CERT-7", enabled: true },
      { code: "AWD-1", enabled: false },
    ];
    expect(findCredential(list, "cert-7")).not.toBeNull();
    expect(findCredential(list, "AWD-1")).toBeNull();
  });
});
