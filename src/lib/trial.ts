export const TRIAL_DURATION_SECONDS = 0;
export const TRIAL_DURATION_MS = 0;
export const TRIAL_CAPITAL_INR = 0;

export function isTrialAccountRecord() {
  return false;
}

export function hasActivePurchasedAccount(
  accounts: Array<Record<string, unknown>> = [],
): boolean {
  return accounts.some(
    (a) =>
      a &&
      ["Active", "Funded", "Passed"].includes(String(a["status"] || "")) &&
      Number(a["starting_capital"] ?? a["balance"] ?? 0) > 0,
  );
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
