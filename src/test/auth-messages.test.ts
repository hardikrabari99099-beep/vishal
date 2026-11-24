import { describe, expect, it } from "vitest";
import { passwordChecks, friendlyAuthError } from "@/lib/auth-messages";

describe("sign-up password checklist", () => {
  it("rejects a short all-digit password", () => {
    expect(passwordChecks("123456").every((c) => c.ok)).toBe(false);
  });
  it("accepts 8+ chars with letter, number and symbol", () => {
    expect(passwordChecks("Trade@2026").every((c) => c.ok)).toBe(true);
  });
});

describe("auth error messages", () => {
  it("explains leaked/weak password rejections", () => {
    expect(
      friendlyAuthError("Password is known to be weak and easy to guess", true),
    ).toMatch(/too common/);
  });
  it("points existing users to sign in", () => {
    expect(
      friendlyAuthError("An account with this email already exists", true),
    ).toMatch(/Sign in/);
  });
});
