import blueprint from "../../firebase-blueprint.json";

export const BOOTSTRAPPED_ADMIN_EMAIL = "growthloopp@gmail.com";

export const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const SLUG_PATTERN = /^[a-z0-9_-]+$/;

export const BLUEPRINT_LIMITS = {
  idMaxLength: blueprint.entities.SiteConfig.properties.id.maxLength ?? 64,
  userIdMaxLength:
    blueprint.entities.UserPublicProfile.properties.uid.maxLength ?? 128,
  displayNameMaxLength:
    blueprint.entities.UserPublicProfile.properties.displayName.maxLength ??
    100,
  emailMaxLength:
    blueprint.entities.UserPrivateInfo.properties.email.maxLength ?? 200,
  phoneMaxLength:
    blueprint.entities.UserPrivateInfo.properties.phone.maxLength ?? 32,
  planNameMaxLength: blueprint.entities.PlanDoc.properties.name.maxLength ?? 80,
  planDescMaxLength:
    blueprint.entities.PlanDoc.properties.description.maxLength ?? 600,
  planFeaturesMaxItems: 15,
  planFeatureItemMaxLength: 200,
  blogSlugMaxLength:
    blueprint.entities.BlogPost.properties.slug.maxLength ?? 140,
  blogTitleMaxLength:
    blueprint.entities.BlogPost.properties.title.maxLength ?? 200,
  blogExcerptMaxLength:
    blueprint.entities.BlogPost.properties.excerpt.maxLength ?? 600,
  blogContentMaxLength:
    blueprint.entities.BlogPost.properties.content.maxLength ?? 40000,
  blogCoverMaxLength:
    blueprint.entities.BlogPost.properties.cover_image.maxLength ?? 1000,
  blogAuthorMaxLength:
    blueprint.entities.BlogPost.properties.author.maxLength ?? 120,
  certCodeMinLength:
    blueprint.entities.CertificateDoc.properties.certificate_code.minLength ??
    3,
  certCodeMaxLength:
    blueprint.entities.CertificateDoc.properties.certificate_code.maxLength ??
    64,
  certTraderNameMaxLength:
    blueprint.entities.CertificateDoc.properties.trader_name.maxLength ?? 120,
  certPlanMaxLength:
    blueprint.entities.CertificateDoc.properties.plan.maxLength ?? 80,
  certDateMaxLength:
    blueprint.entities.CertificateDoc.properties.payout_date.maxLength ?? 40,
  certImageUrlMaxLength:
    blueprint.entities.CertificateDoc.properties.image_url.maxLength ?? 1000,
  accountNumberMaxLength:
    blueprint.entities.TraderAccountDoc.properties.account_number.maxLength ??
    64,
  testimonialsMaxItems: 40,
  faqGroupsMaxItems: 20,
} as const;

export const SITE_CONFIG_ALLOWED_KEYS = [
  "id",
  "brand",
  "contact",
  "social",
  "announcement",
  "widgets",
  "hero",
  "ratings",
  "steps",
  "how_it_works",
  "why_choose",
  "home_copy",
  "home_sections",
  "evaluation_risk",
  "trust",
  "video_reviews",
  "testimonials",
  "faq_groups",
  "rules",
  "about",
  "benefits",
  "live_counter",
  "payouts_page",
  "funding_products",
  "updatedAt",
] as const;

export const PLAN_ALLOWED_KEYS = [
  "id",
  "name",
  "account_size",
  "challenge_fee",
  "profit_target_points",
  "profit_share",
  "max_loss_limit",
  "min_trading_days",
  "total_trading_days",
  "trades_per_day",
  "popular",
  "order",
  "description",
  "features",
  "updatedAt",
] as const;

export const BLOG_ALLOWED_KEYS = [
  "id",
  "slug",
  "title",
  "excerpt",
  "content",
  "cover_image",
  "author",
  "published",
  "updatedAt",
] as const;

export const CERTIFICATE_ALLOWED_KEYS = [
  "id",
  "certificate_code",
  "trader_name",
  "amount",
  "plan",
  "account_size",
  "payout_date",
  "image_url",
  "visible",
  "updatedAt",
] as const;

export const USER_PUBLIC_ALLOWED_KEYS = [
  "uid",
  "displayName",
  "role",
  "createdAt",
  "updatedAt",
] as const;

export const USER_PRIVATE_ALLOWED_KEYS = [
  "uid",
  "email",
  "phone",
  "kycStatus",
  "createdAt",
  "updatedAt",
] as const;

export const TRADER_ACCOUNT_ALLOWED_KEYS = [
  "id",
  "uid",
  "account_number",
  "plan_name",
  "account_type",
  "starting_capital",
  "balance",
  "status",
  "createdAt",
  "updatedAt",
] as const;

export const ADMIN_RECORD_ALLOWED_KEYS = [
  "id",
  "collection",
  "docId",
  "payload",
  "updatedBy",
  "updatedAt",
] as const;

export const ADMIN_RECORD_COLLECTIONS = [
  "users",
  "trader_accounts",
  "orders",
  "payout_requests",
  "coupons",
  "weekly_payouts",
  "leaderboard",
  "stories",
  "leads",
  "support_tickets",
  "referrals",
  "fund_transactions",
  "virtual_orders",
  "virtual_positions",
  "virtual_trades",
  "system_meta",
  "plans",
  "blogs",
  "certificates",
  "league_registrations",
  "risk_breaches",
  "risk_events",
  "settings",
] as const;

const ADMIN_RECORD_SECRET_KEYS = new Set([
  "smtp_password",
  "password_hash",
  "salt",
  "razorpay_key_secret",
  "key_secret",
  "service_role_key",
  "private_key",
  "admin_secret",
]);

function boundStr(v: unknown, max: number): string {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}

export function sanitizeId(
  raw: unknown,
  fallback = "item",
  maxLen = BLUEPRINT_LIMITS.idMaxLength,
) {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, maxLen);
  return cleaned.length > 0 && ID_PATTERN.test(cleaned) ? cleaned : fallback;
}

export function sanitizeSlug(raw: unknown, fallback = "post") {
  const cleaned = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, BLUEPRINT_LIMITS.blogSlugMaxLength);
  return cleaned.length > 0 && SLUG_PATTERN.test(cleaned) ? cleaned : fallback;
}

export function sanitizeSiteConfigPayload(
  raw: Record<string, unknown>,
  configId = "public",
): Record<string, unknown> {
  const safeId = sanitizeId(configId, "public", BLUEPRINT_LIMITS.idMaxLength);
  const out: Record<string, unknown> = { id: safeId };

  const mapKeys = [
    "brand",
    "contact",
    "social",
    "announcement",
    "widgets",
    "hero",
    "ratings",
    "steps",
    "how_it_works",
    "why_choose",
    "home_copy",
    "home_sections",
    "evaluation_risk",
    "trust",
    "video_reviews",
    "rules",
    "about",
    "benefits",
    "live_counter",
    "payouts_page",
    "funding_products",
  ] as const;

  for (const k of mapKeys) {
    const val = raw[k];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      out[k] = val;
    }
  }

  if (Array.isArray(raw["testimonials"])) {
    out["testimonials"] = raw["testimonials"].slice(
      0,
      BLUEPRINT_LIMITS.testimonialsMaxItems,
    );
  }
  if (Array.isArray(raw["faq_groups"])) {
    out["faq_groups"] = raw["faq_groups"].slice(
      0,
      BLUEPRINT_LIMITS.faqGroupsMaxItems,
    );
  }

  return out;
}

export function sanitizePlanPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const safeId = sanitizeId(raw["id"], `plan-${Date.now()}`);
  const featuresRaw = Array.isArray(raw["features"]) ? raw["features"] : [];
  const features = featuresRaw
    .map((f) => boundStr(f, BLUEPRINT_LIMITS.planFeatureItemMaxLength))
    .filter(Boolean)
    .slice(0, BLUEPRINT_LIMITS.planFeaturesMaxItems);

  const out: Record<string, unknown> = {
    id: safeId,
    name:
      boundStr(
        raw["name"] || "Challenge Plan",
        BLUEPRINT_LIMITS.planNameMaxLength,
      ) || "Plan",
    account_size: Math.max(0, Number(raw["account_size"] ?? 0) || 0),
    challenge_fee: Math.max(0, Number(raw["challenge_fee"] ?? 0) || 0),
    popular: Boolean(raw["popular"]),
    order: Number(raw["order"] ?? 0) || 0,
    features,
  };

  if (raw["profit_target_points"] !== undefined) {
    out["profit_target_points"] = Number(raw["profit_target_points"]) || 0;
  }
  if (raw["profit_share"] !== undefined) {
    out["profit_share"] = Number(raw["profit_share"]) || 0;
  }
  if (raw["max_loss_limit"] !== undefined) {
    out["max_loss_limit"] = Number(raw["max_loss_limit"]) || 0;
  }
  if (raw["min_trading_days"] !== undefined) {
    out["min_trading_days"] = Number(raw["min_trading_days"]) || 0;
  }
  if (raw["total_trading_days"] !== undefined) {
    out["total_trading_days"] = Number(raw["total_trading_days"]) || 0;
  }
  if (raw["trades_per_day"] !== undefined) {
    out["trades_per_day"] = Number(raw["trades_per_day"]) || 0;
  }
  if (raw["description"] !== undefined) {
    out["description"] = boundStr(
      raw["description"],
      BLUEPRINT_LIMITS.planDescMaxLength,
    );
  }

  return out;
}

export function sanitizeBlogPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const safeId = sanitizeId(raw["id"], `blog-${Date.now()}`);
  const safeTitle =
    boundStr(
      raw["title"] || "Untitled Post",
      BLUEPRINT_LIMITS.blogTitleMaxLength,
    ) || "Untitled Post";
  const safeSlug = sanitizeSlug(raw["slug"] || safeTitle, safeId.toLowerCase());

  const out: Record<string, unknown> = {
    id: safeId,
    slug: safeSlug,
    title: safeTitle,
    published: Boolean(raw["published"]),
  };

  if (raw["excerpt"] !== undefined) {
    out["excerpt"] = boundStr(
      raw["excerpt"],
      BLUEPRINT_LIMITS.blogExcerptMaxLength,
    );
  }
  if (raw["content"] !== undefined) {
    out["content"] = boundStr(
      raw["content"],
      BLUEPRINT_LIMITS.blogContentMaxLength,
    );
  }
  if (raw["cover_image"] !== undefined) {
    out["cover_image"] = boundStr(
      raw["cover_image"],
      BLUEPRINT_LIMITS.blogCoverMaxLength,
    );
  }
  if (raw["author"] !== undefined) {
    out["author"] = boundStr(
      raw["author"],
      BLUEPRINT_LIMITS.blogAuthorMaxLength,
    );
  }

  return out;
}

export function sanitizeCertificatePayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const safeId = sanitizeId(raw["id"], `cert-${Date.now()}`);
  let code = sanitizeId(
    raw["certificate_code"] || safeId,
    "CERT001",
    BLUEPRINT_LIMITS.certCodeMaxLength,
  );
  if (code.length < BLUEPRINT_LIMITS.certCodeMinLength) {
    code = `${code}-001`.slice(0, BLUEPRINT_LIMITS.certCodeMaxLength);
  }

  const out: Record<string, unknown> = {
    id: safeId,
    certificate_code: code,
    visible: raw["visible"] !== false,
  };

  if (raw["trader_name"] !== undefined) {
    out["trader_name"] = boundStr(
      raw["trader_name"],
      BLUEPRINT_LIMITS.certTraderNameMaxLength,
    );
  }
  if (raw["amount"] !== undefined) {
    out["amount"] = Number(raw["amount"]) || 0;
  }
  if (raw["plan"] !== undefined) {
    out["plan"] = boundStr(raw["plan"], BLUEPRINT_LIMITS.certPlanMaxLength);
  }
  if (raw["account_size"] !== undefined) {
    out["account_size"] = Number(raw["account_size"]) || 0;
  }
  if (raw["payout_date"] !== undefined) {
    out["payout_date"] = boundStr(
      raw["payout_date"],
      BLUEPRINT_LIMITS.certDateMaxLength,
    );
  }
  if (raw["image_url"] !== undefined) {
    const imgUrl = boundStr(
      raw["image_url"],
      BLUEPRINT_LIMITS.certImageUrlMaxLength,
    );
    // Never write huge inline data URLs into certificate metadata docs
    out["image_url"] = imgUrl.startsWith("data:") ? "" : imgUrl;
  }

  return out;
}

export function sanitizeUserPublicPayload(raw: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
  role?: "user" | "admin";
}) {
  const uid = sanitizeId(raw.uid, "user", BLUEPRINT_LIMITS.userIdMaxLength);
  const fallbackName = raw.email ? String(raw.email).split("@")[0] : "Trader";
  const displayName =
    boundStr(
      raw.displayName || fallbackName,
      BLUEPRINT_LIMITS.displayNameMaxLength,
    ) || "Trader";
  const role: "user" | "admin" = raw.role === "admin" ? "admin" : "user";
  return { uid, displayName, role };
}

export function sanitizeUserPrivatePayload(raw: {
  uid: string;
  email: string;
  phone?: string | null;
  kycStatus?: "none" | "submitted" | "verified" | "rejected";
}) {
  const uid = sanitizeId(raw.uid, "user", BLUEPRINT_LIMITS.userIdMaxLength);
  const email = boundStr(
    raw.email,
    BLUEPRINT_LIMITS.emailMaxLength,
  ).toLowerCase();
  const phone = boundStr(raw.phone || "", BLUEPRINT_LIMITS.phoneMaxLength);
  const allowedKyc = new Set(["none", "submitted", "verified", "rejected"]);
  const kycStatus =
    raw.kycStatus && allowedKyc.has(raw.kycStatus) ? raw.kycStatus : "none";
  return { uid, email, phone, kycStatus };
}

function stripSecretsDeep(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 500).map((item) => stripSecretsDeep(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (ADMIN_RECORD_SECRET_KEYS.has(k.toLowerCase())) continue;
      if (v === undefined) continue;
      out[k] = stripSecretsDeep(v, depth + 1);
    }
    return out;
  }
  return null;
}

export function buildAdminRecordId(collectionName: string, docId: string) {
  return sanitizeId(`${collectionName}__${docId}`, "rec", 128);
}

export function sanitizeAdminRecordPayload(
  collectionName: string,
  rawDoc: Record<string, unknown>,
  updatedBy = BOOTSTRAPPED_ADMIN_EMAIL,
) {
  const safeCollection = (
    ADMIN_RECORD_COLLECTIONS as readonly string[]
  ).includes(collectionName)
    ? collectionName
    : "system_meta";
  const rawDocId = String(rawDoc["id"] || `doc-${Date.now()}`).trim();
  const safeDocId = rawDocId.slice(0, 128) || "doc";
  const id = buildAdminRecordId(safeCollection, safeDocId);
  const payload = stripSecretsDeep(rawDoc) as Record<string, unknown>;
  return {
    id,
    collection: safeCollection,
    docId: safeDocId,
    payload:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload
        : {},
    updatedBy:
      boundStr(updatedBy || BOOTSTRAPPED_ADMIN_EMAIL, 200) ||
      BOOTSTRAPPED_ADMIN_EMAIL,
  };
}
