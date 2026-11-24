// Browser-safe helpers for the sign-in / sign-up form.

/** Password rules shown as a live checklist on sign-up. */
export function passwordChecks(pw = "") {
  return [
    { label: "At least 8 characters", ok: pw.length >= 8 },
    { label: "A letter and a number", ok: /[a-z]/i.test(pw) && /\d/.test(pw) },
    { label: "A symbol (e.g. @ # ! $)", ok: /[^a-z0-9]/i.test(pw) },
  ];
}

/** Turn raw auth errors into clear, actionable messages. */
export function friendlyAuthError(message = "", isSignup = false) {
  const m = String(message || "");
  if (/weak|easy to guess|pwned|leaked/i.test(m))
    return "This password is too common and has appeared in data leaks. Please choose a different, stronger password.";
  if (/already exists|already registered/i.test(m))
    return "An account with this email already exists. Switch to Sign in, or use Forgot password.";
  if (/network|failed to fetch/i.test(m))
    return "Network problem — please check your internet and try again.";
  if (/email/i.test(m) && /valid/i.test(m))
    return "Please enter a valid email address.";
  return (
    m ||
    (isSignup
      ? "Sign up failed. Please try again."
      : "Sign in failed. Please try again.")
  );
}
