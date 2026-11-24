import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import blueprint from "../../firebase-blueprint.json";
import {
  ADMIN_RECORD_ALLOWED_KEYS,
  BLOG_ALLOWED_KEYS,
  BLUEPRINT_LIMITS,
  BOOTSTRAPPED_ADMIN_EMAIL,
  CERTIFICATE_ALLOWED_KEYS,
  PLAN_ALLOWED_KEYS,
  SITE_CONFIG_ALLOWED_KEYS,
  TRADER_ACCOUNT_ALLOWED_KEYS,
  USER_PRIVATE_ALLOWED_KEYS,
  USER_PUBLIC_ALLOWED_KEYS,
  sanitizeAdminRecordPayload,
  sanitizeBlogPayload,
  sanitizeCertificatePayload,
  sanitizePlanPayload,
  sanitizeSiteConfigPayload,
} from "../lib/firebase-schema";

const rulesPath = resolve(process.cwd(), "firestore.rules");
const rulesText = readFileSync(rulesPath, "utf8");

describe("Firestore Security Rules & Blueprint Invariants", () => {
  it("opens with default-deny catch-all rule and uses rules_version = '2'", () => {
    expect(rulesText.trimStart().startsWith("rules_version = '2';")).toBe(true);
    const catchAllIdx = rulesText.indexOf("match /{document=**}");
    const firstCollectionIdx = rulesText.indexOf("match /test/connection");
    expect(catchAllIdx).toBeGreaterThan(-1);
    expect(firstCollectionIdx).toBeGreaterThan(catchAllIdx);
    expect(rulesText).toMatch(
      /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/,
    );
  });

  it("defines match blocks for every collection in firebase-blueprint.json", () => {
    const expectedBlocks = [
      "match /site_config/{configId}",
      "match /plans/{planId}",
      "match /blogs/{blogId}",
      "match /certificates/{certId}",
      "match /users/{userId}",
      "match /private/{docId}",
      "match /trader_accounts/{accountId}",
      "match /admin_records/{recordId}",
      "match /test/connection",
    ];
    for (const block of expectedBlocks) {
      expect(rulesText).toContain(block);
    }
    expect(Object.keys(blueprint.firestore)).toHaveLength(9);
  });

  it("keeps allow list free of get() and exists() calls (Cost-Optimization Clause)", () => {
    const listRules = [...rulesText.matchAll(/allow list:[^;]+;/g)].map(
      (m) => m[0],
    );
    expect(listRules.length).toBeGreaterThanOrEqual(7);
    for (const rule of listRules) {
      expect(rule).not.toContain("get(");
      expect(rule).not.toContain("exists(");
      expect(rule).not.toMatch(/isAdmin\(/);
    }
  });

  it("requires email_verified == true for admin identity and standard writes", () => {
    expect(rulesText).toContain("request.auth.token.email_verified == true");
    expect(rulesText).toContain(
      `request.auth.token.email == '${BOOTSTRAPPED_ADMIN_EMAIL}'`,
    );
    expect(rulesText).toMatch(
      /function isBootstrappedAdmin\(\)\s*\{\s*return isVerified\(\)/,
    );
  });

  it("keeps validation helpers free of existing()/diff() and syncs allowlists with firebase-blueprint.json", () => {
    const helpersSection = rulesText.slice(
      rulesText.indexOf("// ---------- Validation Blueprints ----------"),
      rulesText.indexOf("// ---------- Collection Rules ----------"),
    );
    expect(helpersSection).not.toContain("existing(");
    expect(helpersSection).not.toContain("diff(");
    expect(helpersSection).toContain("data.updatedAt == request.time");

    for (const key of SITE_CONFIG_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
    for (const key of PLAN_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
    for (const key of BLOG_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
    for (const key of CERTIFICATE_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
    for (const key of USER_PUBLIC_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
    for (const key of USER_PRIVATE_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
    for (const key of TRADER_ACCOUNT_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
    for (const key of ADMIN_RECORD_ALLOWED_KEYS) {
      expect(rulesText).toContain(`'${key}'`);
    }
  });
});

describe("Dirty Dozen Security Spec Payloads", () => {
  it("1-4: blocks privilege escalation, role tampering, ghost fields, and UID spoofing on /users", () => {
    expect(rulesText).toContain(
      "(isOwner(userId) && incoming().role == 'user')",
    );
    expect(rulesText).toContain("incoming().uid == existing().uid");
    expect(rulesText).toContain("incoming().role == existing().role");
    expect(rulesText).toContain(
      "affectedKeys().hasOnly(['displayName', 'updatedAt'])",
    );
    expect(rulesText).toContain(
      "data.keys().hasOnly(['uid', 'displayName', 'role', 'createdAt', 'updatedAt'])",
    );
  });

  it("5-6: isolates PII in /users/{userId}/private/info and blocks blanket list scraping", () => {
    expect(blueprint.entities.UserPublicProfile.properties).not.toHaveProperty(
      "email",
    );
    expect(blueprint.entities.UserPublicProfile.properties).not.toHaveProperty(
      "phone",
    );
    expect(rulesText).toContain(
      "allow get: if isValidId(userId) && isValidId(docId) && docId == 'info' && (isOwner(userId) || isAdmin());",
    );
    expect(rulesText).toContain(
      "allow list: if (isSignedIn() && resource.data.uid == request.auth.uid) || isBootstrappedAdmin();",
    );
  });

  it("7-8: denies unverified admin spoofing and unauthenticated writes to /site_config", () => {
    expect(rulesText).toContain(
      "allow create: if isValidId(configId) && isAdmin() && isValidSiteConfig(incoming(), configId);",
    );
    expect(rulesText).toContain(
      "isVerified() && request.auth.token.email == 'growthloopp@gmail.com'",
    );
  });

  it("9-12: enforces ID regex/length, payload bounds, server timestamps, and unpublished draft protection", () => {
    expect(rulesText).toContain(
      "id.size() >= 1 && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\\\-]+$')",
    );
    expect(rulesText).toContain("data.features.size() <= 15");
    expect(rulesText).toContain("incoming().createdAt == request.time");
    expect(rulesText).toContain(
      "allow get: if isValidId(blogId) && (existing().published == true || isAdmin());",
    );
  });

  it("sanitizes outgoing client payloads to strip secret/ghost fields and clamp blueprint sizes", () => {
    const cleanConfig = sanitizeSiteConfigPayload(
      {
        _id: "mongo",
        email_config: { smtp_password: "secret" },
        smtp_password: "secret",
        hero: { title_before: "Trade" },
        testimonials: Array.from({ length: 100 }, (_, i) => ({
          a: `Trader ${i}`,
          q: "Great",
        })),
      },
      "public",
    );
    expect(cleanConfig).not.toHaveProperty("_id");
    expect(cleanConfig).not.toHaveProperty("email_config");
    expect(cleanConfig).not.toHaveProperty("smtp_password");
    expect((cleanConfig["testimonials"] as unknown[]).length).toBe(
      BLUEPRINT_LIMITS.testimonialsMaxItems,
    );

    const cleanPlan = sanitizePlanPayload({
      id: "plan/bad id",
      name: "A".repeat(300),
      account_size: -50,
      challenge_fee: 1999,
      features: Array.from({ length: 30 }, () => "B".repeat(500)),
      ghostField: true,
    });
    expect(cleanPlan).not.toHaveProperty("ghostField");
    expect((cleanPlan["name"] as string).length).toBe(
      BLUEPRINT_LIMITS.planNameMaxLength,
    );
    expect(cleanPlan["account_size"]).toBe(0);
    expect((cleanPlan["features"] as string[]).length).toBe(
      BLUEPRINT_LIMITS.planFeaturesMaxItems,
    );
    expect((cleanPlan["features"] as string[])[0]?.length).toBe(
      BLUEPRINT_LIMITS.planFeatureItemMaxLength,
    );

    const cleanBlog = sanitizeBlogPayload({
      id: "b1",
      title: "T".repeat(400),
      slug: "Bad Slug!!",
      published: false,
      hackerKey: 123,
    });
    expect(cleanBlog).not.toHaveProperty("hackerKey");
    expect((cleanBlog["title"] as string).length).toBe(
      BLUEPRINT_LIMITS.blogTitleMaxLength,
    );
    expect(cleanBlog["slug"]).toMatch(/^[a-z0-9_-]+$/);

    const cleanCert = sanitizeCertificatePayload({
      id: "c1",
      certificate_code: "x",
      image_url: "data:image/png;base64,AAAA",
      visible: true,
    });
    expect(
      (cleanCert["certificate_code"] as string).length,
    ).toBeGreaterThanOrEqual(BLUEPRINT_LIMITS.certCodeMinLength);
    expect(cleanCert["image_url"]).toBe("");

    const cleanRecord = sanitizeAdminRecordPayload("settings", {
      id: "email_config",
      smtp_user: "growthloopp@gmail.com",
      smtp_password: "super-secret-app-password",
      nested: { key_secret: "rzp_secret", safe: "ok" },
    });
    expect(cleanRecord.id).toBe("settings__email_config");
    expect(cleanRecord.payload).not.toHaveProperty("smtp_password");
    expect(cleanRecord.payload["nested"]).not.toHaveProperty("key_secret");
    expect(
      (cleanRecord.payload["nested"] as Record<string, unknown>)["safe"],
    ).toBe("ok");
  });
});
