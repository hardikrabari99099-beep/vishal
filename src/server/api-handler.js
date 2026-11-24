// Server-side port of the original FastAPI backend (backend/server.py).
// Data lives in public.docs (one JSON document per row, grouped by collection).
// Only imported dynamically from src/routes/api/$.ts so it never reaches the browser.
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import firebaseConfig from "../../firebase-applet-config.json";
import { DEFAULT_SETTINGS } from "../lib/default-settings";
import { DEFAULT_PLANS } from "../lib/default-plans";
import { utrLast4 } from "../lib/trust";
import {
  DEFAULT_FUNDING_PRODUCTS,
  PRODUCT_TYPES,
  computeAccountRiskSnapshot,
  getAccountProductType,
  getIstDateKey,
  isClassicProduct,
  normalizeFundingProductsConfig,
  resolveFundingProductSelection,
} from "../lib/funding-products";
import { evaluateAccountRisk, evaluateAccountsBatch } from "./risk-engine";
import {
  closeRazorpayQr,
  createRazorpayOrder,
  createRazorpayQr,
  extractRazorpayError,
  extractRazorpayQrPayload,
  fetchRazorpayOrderPayments,
  fetchRazorpayQrImageSafely,
  fetchRazorpayQrPayments,
  getRazorpayCredentials,
  hasValidRazorpayKeys,
  isAllowedRazorpayImageUrl,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from "./razorpay-client";

const LEAGUE_FEE_EXISTING = 999.0;
const LEAGUE_FEE_NEW = 1499.0;
const ADMIN_HASH =
  "d497e6b1cb17bc18251fe5d27f3fcf7b:8f948b915c0764cb27cc9e129ee20b16e0e25cbdc637f49b24fc3a8e5c8822b6eb466656890cd351bbf0d60adb8870f8805384c80e05adc1464791f35b00e62c";
const ADMIN_USER_HASH =
  "ab0022e2a2a1b51bfaf7db2b216ba4d6:353b39f95c6be3c7aa470251e3cc33d16b3c84850f9b6be276cf584a7246fb1a385f2fb79c86488d8f828377b160354e33915427134e71eac1519d779d185a94";

class HttpError extends Error {
  constructor(status, detail, extra = null) {
    super(typeof detail === "string" ? detail : "error");
    this.status = status;
    this.detail = detail;
    this.extra = extra;
  }
}
const fail = (status, detail, extra = null) => {
  throw new HttpError(status, detail, extra);
};
const now = () => new Date().toISOString();
const isNetlifyRuntime = () => {
  if (process.env["VITEST"]) return false;
  if (process.env["RENDER_SERVICE_ID"] || process.env["RENDER"]) return false;
  return Boolean(
    process.env["NETLIFY"] === "true" && process.env["NETLIFY_DB_URL"],
  );
};
const uuid = () => crypto.randomUUID();
const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data ?? null), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, no-cache, must-revalidate",
      ...extraHeaders,
    },
  });

// ---------- real-time admin -> website sync bus + shared runtime state ----------
const GLOBAL_STORE_KEY = "__indifundedRuntimeStore";
const runtimeState =
  globalThis[GLOBAL_STORE_KEY] ||
  (globalThis[GLOBAL_STORE_KEY] = {
    syncVersion: Date.now(),
    syncUpdatedAt: new Date().toISOString(),
    syncSubscribers: new Set(),
    memoryCollections: new Map(),
    pendingMediaUploads: new Map(),
    memorySeeded: false,
    localHydrated: false,
    lastHydratedMtimeMs: 0,
    envFileCache: null,
  });

const syncSubscribers = runtimeState.syncSubscribers;
function bumpSync(scope = "all") {
  runtimeState.syncVersion = Math.max(runtimeState.syncVersion + 1, Date.now());
  runtimeState.syncUpdatedAt = new Date().toISOString();
  const payload = JSON.stringify({
    version: runtimeState.syncVersion,
    scope,
    updated_at: runtimeState.syncUpdatedAt,
  });
  for (const listener of syncSubscribers) {
    try {
      listener(payload);
    } catch {
      syncSubscribers.delete(listener);
    }
  }
}

function loadLocalEnvVars() {
  const loaded = {};
  if (!process.env["VITEST"]) {
    let sig = "";
    for (const fileName of [".env", ".env.local"]) {
      try {
        const p = path.resolve(process.cwd(), fileName);
        if (fs.existsSync(p)) {
          sig += `${fileName}:${fs.statSync(p).mtimeMs};`;
        }
      } catch {
        // ignore stat errors
      }
    }
    if (runtimeState.envFileCache && runtimeState.envFileMtimeSig === sig) {
      return runtimeState.envFileCache;
    }
    for (const fileName of [".env", ".env.local"]) {
      try {
        const p = path.resolve(process.cwd(), fileName);
        if (!fs.existsSync(p)) continue;
        const raw = fs.readFileSync(p, "utf8");
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq <= 0) continue;
          const key = trimmed.slice(0, eq).trim();
          let val = trimmed.slice(eq + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (key && val) loaded[key] = val;
        }
      } catch {
        // ignore unreadable env files
      }
    }
    runtimeState.envFileMtimeSig = sig;
    runtimeState.envFileCache = loaded;
  } else {
    runtimeState.envFileCache = loaded;
  }
  return loaded;
}

function env(name) {
  const direct = process.env[name];
  if (direct !== undefined && String(direct).trim() !== "")
    return String(direct);
  const fallback = loadLocalEnvVars()[name];
  return fallback || "";
}

// Supabase's new "secret key" (sb_secret_...) replaces the legacy service_role key.
// SUPABASE_SECRET_KEY is preferred; SUPABASE_SERVICE_ROLE_KEY still works for older setups.
// SERVER-SIDE ONLY: this value must never be sent to the browser or logged.
const supabaseSecretKey = () =>
  env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");

// Strict external-DB mode on hosted deployments (Render / Netlify) unless overridden.
const isProductionRuntime = () =>
  !process.env["VITEST"] &&
  (Boolean(process.env["RENDER"]) || Boolean(process.env["NETLIFY"]));

// Local snapshot/in-memory store works in dev, tests, and standalone Node builds,
// unless ALLOW_MEMORY_STORE=false or hosted on Render/Netlify without ALLOW_MEMORY_STORE=true.
const allowMemoryStore = () =>
  env("ALLOW_MEMORY_STORE") !== "false" &&
  (!isProductionRuntime() || env("ALLOW_MEMORY_STORE") === "true");

// Returns null when Supabase is configured correctly, "not_configured" when nothing is set,
// or a short human-readable problem. Never includes key values.
function supabaseConfigProblem() {
  const url = env("SUPABASE_URL");
  const key = supabaseSecretKey();
  if (!url && !key) return "not_configured";
  if (!url) return "SUPABASE_URL is missing";
  if (!key) return "SUPABASE_SECRET_KEY is missing";
  if (key.startsWith("sb_publishable_"))
    return "SUPABASE_SECRET_KEY contains the publishable key; the server needs the secret key";
  if (!key.startsWith("sb_secret_") && !key.startsWith("eyJ"))
    return "SUPABASE_SECRET_KEY does not look like a Supabase secret key";
  return null;
}

// Used in production when no real database is available: every data call fails clearly
// instead of silently writing to temporary memory.
function unavailableStore(reason) {
  const f = async () => {
    console.error(`[store] Database unavailable: ${reason}`);
    fail(503, "Service temporarily unavailable: database is not configured.");
  };
  return { all: f, get: f, put: f, del: f, delAll: f, findOne: f };
}

// ---------- in-memory fallback store (development/tests only; blocked in production, see allowMemoryStore) ----------
const MEMORY_COLLECTIONS = runtimeState.memoryCollections;
function ensureMemorySeeded() {
  if (runtimeState.memorySeeded) return;
  runtimeState.memorySeeded = true;
  const col = (name, items) => {
    const m = new Map();
    for (const item of items) m.set(String(item.id), item);
    MEMORY_COLLECTIONS.set(name, m);
  };
  col("plans", DEFAULT_PLANS);
  col("coupons", [
    {
      id: "coupon-welcome10",
      code: "WELCOME10",
      discount_percent: 10,
      active: true,
      description: "10% off — welcome to IndiFunded",
      max_uses: null,
      used_count: 0,
      expires_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
    },
    {
      id: "coupon-launch20",
      code: "LAUNCH20",
      discount_percent: 20,
      active: true,
      description: "20% launch discount",
      max_uses: 500,
      used_count: 0,
      expires_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
    },
    {
      id: "coupon-trader5",
      code: "TRADER5",
      discount_percent: 5,
      active: true,
      description: "5% off for community traders",
      max_uses: null,
      used_count: 0,
      expires_at: null,
      created_at: "2026-01-01T00:00:00+00:00",
    },
  ]);
  col("certificates", [
    {
      id: "cert-seed",
      certificate_code: "IF-CERT-1001",
      payout_id: "PO-1001",
      image_url: "/certificates/cert-1.png",
      trader_name: "Vivek Raut",
      amount: 6700,
      plan: "Starter",
      account_size: 100000,
      payout_date: "09/05/2026",
      order: 1,
      visible: true,
      created_at: "2026-01-01T00:00:00+00:00",
    },
  ]);
  col("blogs", [
    {
      id: "blog-1",
      slug: "turn-small-investment-into-profitable-trading",
      title:
        "Unlock Your Potential: Turn a Small Investment into a Profitable Trading Venture",
      excerpt:
        "Trading can seem intimidating, especially when considering the challenge fees for a funded account. But with the right approach, a small investment goes a long way.",
      content:
        "Trading can seem intimidating, especially when considering the challenge fees for a funded account. However, it's important to understand the long-term upside. At IndiFunded, a one-time challenge fee unlocks access to accounts of up to ₹5,00,000 with 70% profit sharing. Start small, prove your discipline, and scale systematically.\n\n**Why it works**\n- Capital efficiency: you keep 70% of profits without risking your own capital beyond the challenge fee.\n- Risk discipline: hard drawdown rules train you to protect capital.\n- Scaling: passing traders see account increments every 2 months up to ₹5L.",
      cover_image:
        "https://images.unsplash.com/photo-1642790595397-7047dc98fa72?w=1200",
      author: "IndiFunded Team",
      published: true,
      created_at: "2026-01-03T00:00:00+00:00",
    },
    {
      id: "blog-2",
      slug: "rise-of-indifunded-indian-trading",
      title:
        "Uncovering the Rise of IndiFunded: A New Player in the Indian Trading Scene",
      excerpt:
        "As India's financial sector expands, traders need platforms built for NSE/BSE. Here's why IndiFunded is changing the game.",
      content:
        "In today's fast-paced trading landscape, the right platform can make all the difference for traders. As India's financial sector expands, IndiFunded has emerged as India's 1st prop trading firm tailored to NSE stocks, BankNifty, Nifty50 and F&O segments.\n\n**What sets us apart**\n- Rupee-denominated accounts\n- Payouts within 24 hours\n- Integration with Zerodha, Angel One, Dhan, Upstox\n- A community of Indian traders",
      cover_image:
        "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1200",
      author: "IndiFunded Team",
      published: true,
      created_at: "2026-01-02T00:00:00+00:00",
    },
    {
      id: "blog-3",
      slug: "strategies-for-maximizing-profits",
      title: "Strategies for Maximizing Profits with Funded Trading Accounts",
      excerpt:
        "Fresh methods to boost profits while keeping risk tight. A playbook from IndiFunded's top traders.",
      content:
        "Traders constantly seek methods to boost profits while keeping risk tight. Here are three proven strategies from our funded traders:\n\n1. **Plan your trading day**: pre-market prep beats reactive trading.\n2. **Respect the loss cap**: 20% max loss isn't a target, it's a guardrail — stay well under it.\n3. **Let winners run**: 70% profit accuracy requires fewer losers, not more winners.",
      cover_image:
        "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200",
      author: "IndiFunded Team",
      published: true,
      created_at: "2026-01-01T00:00:00+00:00",
    },
  ]);
  col("users", [
    {
      id: "trader-seed-1",
      email: "rahul.chouhan@example.in",
      name: "Rahul Chouhan",
      phone: "+91 98201 44120",
      apk_username: "rahul.chouhan@example.in",
      apk_password: "RAHUL@1234",
      login_password: "RAHUL@1234",
      kyc: {
        full_name: "Rahul Chouhan",
        pan: "ABCDE1234F",
        status: "submitted",
        submitted_at: "2026-02-01T10:00:00+00:00",
      },
      created_at: "2026-01-15T09:30:00+00:00",
    },
    {
      id: "trader-seed-2",
      email: "priya.sharma@example.in",
      name: "Priya Sharma",
      phone: "+91 98765 21098",
      apk_username: "priya.sharma@example.in",
      apk_password: "PRIYA@1234",
      login_password: "PRIYA@1234",
      kyc: {},
      created_at: "2026-01-20T11:15:00+00:00",
    },
  ]);
  col("trader_accounts", [
    {
      id: "acct-seed-1",
      account_number: "IF-FD-1001",
      user_id: "trader-seed-1",
      user_email: "rahul.chouhan@example.in",
      plan_name: "Pro",
      account_type: "Funded",
      starting_capital: 300000,
      balance: 318450,
      available_margin: 318450,
      used_margin: 0,
      realized_pnl: 18450,
      profit_split: 70,
      max_loss_limit: 20,
      trades_per_day: 5,
      status: "Funded",
      note: "Seeded funded account",
      created_at: "2026-01-16T10:00:00+00:00",
      updated_at: "2026-01-16T10:00:00+00:00",
    },
    {
      id: "acct-seed-2",
      account_number: "IF-CH-1002",
      user_id: "trader-seed-2",
      user_email: "priya.sharma@example.in",
      plan_name: "Standard",
      account_type: "Challenge",
      starting_capital: 200000,
      balance: 200000,
      available_margin: 200000,
      used_margin: 0,
      realized_pnl: 0,
      profit_split: 70,
      max_loss_limit: 20,
      trades_per_day: 3,
      status: "Active",
      note: "Seeded challenge account",
      created_at: "2026-01-21T09:30:00+00:00",
      updated_at: "2026-01-21T09:30:00+00:00",
    },
  ]);
}
function resolveDataDir() {
  const explicit = process.env["INDIFUNDED_DATA_DIR"];
  if (explicit) return path.resolve(explicit);
  let cur = process.cwd();
  for (let i = 0; i < 4; i++) {
    if (
      fs.existsSync(path.join(cur, ".indifunded-store.local")) ||
      fs.existsSync(path.join(cur, "package.json"))
    ) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return process.cwd();
}

function getLocalStorePaths() {
  const customStore = process.env["INDIFUNDED_STORE_FILE"];
  const dir = customStore
    ? path.dirname(path.resolve(customStore))
    : resolveDataDir();
  const authPath = customStore
    ? path.resolve(customStore)
    : path.join(dir, ".indifunded-store.local");
  return {
    emailPath: path.join(dir, ".indifunded-email.local"),
    authPath,
    authBackupPath: `${authPath}.bak`,
    mediaDir: path.join(dir, ".indifunded-media"),
  };
}

function localPersistenceDisabled() {
  return Boolean(
    process.env["VITEST"] && !process.env["INDIFUNDED_STORE_FILE"],
  );
}

function sanitizeMediaKey(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
}
const MEDIA_EXT_TO_MIME = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const MEDIA_MIME_TO_EXT = {
  "video/mp4": "mp4",
  "video/x-m4v": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
function normalizeMediaMime(rawType, filename = "") {
  const base = String(rawType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (base === "video/x-m4v") return "video/mp4";
  if (base === "image/jpg") return "image/jpeg";
  if (MEDIA_MIME_TO_EXT[base]) return base;
  const ext = String(filename || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return (ext && MEDIA_EXT_TO_MIME[ext]) || "";
}
function readLocalMediaAsset(id) {
  if (localPersistenceDisabled()) return null;
  const safe = sanitizeMediaKey(id);
  if (!safe) return null;
  try {
    const { mediaDir } = getLocalStorePaths();
    const filePath = path.join(mediaDir, `${safe}.json`);
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function writeLocalMediaAsset(doc) {
  if (localPersistenceDisabled() || !doc || !doc.id) return false;
  const safe = sanitizeMediaKey(doc.id);
  if (!safe) return false;
  try {
    const { mediaDir } = getLocalStorePaths();
    fs.mkdirSync(mediaDir, { recursive: true });
    const filePath = path.join(mediaDir, `${safe}.json`);
    const tmpPath = `${filePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmpPath, JSON.stringify(doc), "utf8");
    fs.renameSync(tmpPath, filePath);
    return true;
  } catch {
    return false;
  }
}
function deleteLocalMediaAsset(id) {
  if (localPersistenceDisabled()) return;
  const safe = sanitizeMediaKey(id);
  if (!safe) return;
  try {
    const { mediaDir } = getLocalStorePaths();
    const filePath = path.join(mediaDir, `${safe}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}
function storeMediaChunkLocal(uploadId, index, chunkStr) {
  if (!runtimeState.pendingMediaUploads) {
    runtimeState.pendingMediaUploads = new Map();
  }
  let entry = runtimeState.pendingMediaUploads.get(uploadId);
  if (!entry) {
    entry = { parts: new Map(), updatedAt: Date.now() };
    runtimeState.pendingMediaUploads.set(uploadId, entry);
  }
  entry.parts.set(index, chunkStr);
  entry.updatedAt = Date.now();
  if (!localPersistenceDisabled()) {
    try {
      const { mediaDir } = getLocalStorePaths();
      const chunkDir = path.join(mediaDir, "chunks", sanitizeMediaKey(uploadId));
      fs.mkdirSync(chunkDir, { recursive: true });
      fs.writeFileSync(path.join(chunkDir, `${index}.part`), chunkStr, "utf8");
    } catch {
      // ignore disk chunk cache failure when in-memory store holds it
    }
  }
}
function assembleMediaChunksLocal(uploadId, total) {
  const parts = [];
  const memEntry = runtimeState.pendingMediaUploads?.get(uploadId);
  const { mediaDir } = getLocalStorePaths();
  const chunkDir = path.join(mediaDir, "chunks", sanitizeMediaKey(uploadId));
  for (let i = 0; i < total; i++) {
    let part = memEntry?.parts?.get(i);
    if (!part && !localPersistenceDisabled()) {
      try {
        const partPath = path.join(chunkDir, `${i}.part`);
        if (fs.existsSync(partPath)) part = fs.readFileSync(partPath, "utf8");
      } catch {
        // ignore read error
      }
    }
    if (!part) return null;
    parts.push(part);
  }
  runtimeState.pendingMediaUploads?.delete(uploadId);
  if (!localPersistenceDisabled()) {
    try {
      fs.rmSync(chunkDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
  return parts.join("");
}
function readJsonLocal(filePath, backupPath = "") {
  if (localPersistenceDisabled()) return {};
  const tryParse = (p) => {
    if (!p || !fs.existsSync(p)) return { missing: true, data: null };
    try {
      const raw = fs.readFileSync(p, "utf8");
      if (!raw.trim()) return { corrupt: true, data: null };
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { data: parsed };
      }
      return { corrupt: true, data: null };
    } catch {
      return { corrupt: true, data: null };
    }
  };
  const primary = tryParse(filePath);
  if (primary.data) return primary.data;
  if (backupPath) {
    const backup = tryParse(backupPath);
    if (backup.data) return backup.data;
    if (primary.corrupt || backup.corrupt) return { __corrupt: true };
  }
  if (primary.corrupt) return { __corrupt: true };
  return {};
}
function writeJsonLocal(filePath, data, backupPath = "") {
  if (localPersistenceDisabled()) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const serialized = JSON.stringify(data, null, 2);
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, serialized, "utf8");
    fs.renameSync(tmpPath, filePath);
    if (backupPath) {
      try {
        const bakTmp = `${backupPath}.tmp.${process.pid}.${Date.now()}`;
        fs.writeFileSync(bakTmp, serialized, "utf8");
        fs.renameSync(bakTmp, backupPath);
      } catch {
        // ignore backup write errors
      }
    }
    const { authPath } = getLocalStorePaths();
    if (filePath === authPath) {
      try {
        runtimeState.lastHydratedMtimeMs = fs.statSync(filePath).mtimeMs;
      } catch {
        // ignore stat errors
      }
    }
  } catch {
    // ignore read-only disk environments
  }
}
const PERSISTED_LOCAL_COLLECTIONS = [
  "users",
  "local_credentials",
  "certificates",
  "plans",
  "blogs",
  "coupons",
  "weekly_payouts",
  "leaderboard",
  "stories",
  "orders",
  "payout_requests",
  "trader_accounts",
  "fund_transactions",
  "virtual_orders",
  "virtual_positions",
  "virtual_trades",
  "user_notifications",
  "support_tickets",
  "leads",
  "league_registrations",
  "referrals",
  "system_meta",
  "ai_revisions",
  "insights",
  "risk_breaches",
  "risk_events",
  "journal_entries",
];
const LOCAL_SETTINGS_EXCLUDED = new Set(["email_config", "email_logs"]);

function saveLocalEmailSetting(id, doc) {
  if (id !== "email_config" && id !== "email_logs") return;
  const { emailPath } = getLocalStorePaths();
  const current = readJsonLocal(emailPath);
  if (current.__corrupt) return;
  current[id] = doc;
  writeJsonLocal(emailPath, current);
}
function hydrateLocalSnapshot(forceIfNewer = false) {
  if (localPersistenceDisabled()) return;
  const { authPath, authBackupPath, emailPath } = getLocalStorePaths();
  let diskMtime = 0;
  let emailMtime = 0;
  try {
    if (fs.existsSync(authPath)) {
      diskMtime = fs.statSync(authPath).mtimeMs;
    }
  } catch {
    diskMtime = 0;
  }
  try {
    if (fs.existsSync(emailPath)) {
      emailMtime = fs.statSync(emailPath).mtimeMs;
    }
  } catch {
    emailMtime = 0;
  }
  if (
    runtimeState.localHydrated &&
    runtimeState.hydratedStorePath === authPath
  ) {
    const authSame = diskMtime <= (runtimeState.lastHydratedMtimeMs || 0);
    const emailSame = emailMtime <= (runtimeState.lastEmailMtimeMs || 0);
    if (!forceIfNewer || (authSame && emailSame)) return;
  }
  runtimeState.localHydrated = true;
  runtimeState.hydratedStorePath = authPath;
  if (diskMtime > 0) runtimeState.lastHydratedMtimeMs = diskMtime;
  if (emailMtime > 0) runtimeState.lastEmailMtimeMs = emailMtime;

  const persistedEmail = readJsonLocal(emailPath);
  if (!MEMORY_COLLECTIONS.has("settings"))
    MEMORY_COLLECTIONS.set("settings", new Map());
  const settingsMap = MEMORY_COLLECTIONS.get("settings");
  if (!persistedEmail.__corrupt) {
    if (persistedEmail.email_config) {
      settingsMap.set("email_config", persistedEmail.email_config);
    }
    if (persistedEmail.email_logs) {
      settingsMap.set("email_logs", persistedEmail.email_logs);
    }
  }
  const persisted = readJsonLocal(authPath, authBackupPath);
  if (persisted.__corrupt) {
    runtimeState.localReadError = true;
    console.warn(
      "[store] Local store snapshot is unreadable; skipping overwrite to protect data.",
    );
    return;
  }
  runtimeState.localReadError = false;
  if (persisted.cert_template) {
    settingsMap.set("cert_template", persisted.cert_template);
  }
  if (Array.isArray(persisted.settings)) {
    for (const item of persisted.settings) {
      if (item && item.id && !LOCAL_SETTINGS_EXCLUDED.has(String(item.id))) {
        settingsMap.set(String(item.id), item);
      }
    }
  }
  for (const col of PERSISTED_LOCAL_COLLECTIONS) {
    if (Array.isArray(persisted[col])) {
      const m = new Map();
      for (const item of persisted[col]) {
        if (item && item.id) m.set(String(item.id), item);
      }
      MEMORY_COLLECTIONS.set(col, m);
    }
  }
}
function saveLocalSnapshot() {
  if (localPersistenceDisabled()) return;
  if (runtimeState.localReadError) return;
  const { authPath, authBackupPath } = getLocalStorePaths();
  const snapshot = {};
  for (const col of PERSISTED_LOCAL_COLLECTIONS) {
    const m = MEMORY_COLLECTIONS.get(col);
    if (m) snapshot[col] = [...m.values()];
  }
  const settingsMap = MEMORY_COLLECTIONS.get("settings");
  if (settingsMap) {
    const safeSettings = [];
    for (const [k, v] of settingsMap.entries()) {
      if (!LOCAL_SETTINGS_EXCLUDED.has(String(k))) safeSettings.push(v);
    }
    snapshot.settings = safeSettings;
    if (settingsMap.has("cert_template")) {
      snapshot.cert_template = settingsMap.get("cert_template");
    }
  }
  writeJsonLocal(authPath, snapshot, authBackupPath);
}
function memoryStore() {
  ensureMemorySeeded();
  hydrateLocalSnapshot(true);
  const mapOf = (col) => {
    if (!MEMORY_COLLECTIONS.has(col)) MEMORY_COLLECTIONS.set(col, new Map());
    return MEMORY_COLLECTIONS.get(col);
  };
  const all = async (col) => {
    hydrateLocalSnapshot(true);
    return [...mapOf(col).values()];
  };
  const get = async (col, id) => {
    hydrateLocalSnapshot(true);
    const hit = mapOf(col).get(String(id)) ?? null;
    if (hit) return hit;
    if (col === "media_assets") {
      const diskAsset = readLocalMediaAsset(id);
      if (diskAsset) {
        mapOf(col).set(String(id), diskAsset);
        return diskAsset;
      }
    }
    return null;
  };
  const put = async (col, doc) => {
    hydrateLocalSnapshot(true);
    const m = mapOf(col);
    m.set(String(doc.id), doc);
    if (col === "media_assets") {
      writeLocalMediaAsset(doc);
    }
    if (col === "settings") {
      saveLocalEmailSetting(String(doc.id), doc);
    }
    if (col === "settings" || PERSISTED_LOCAL_COLLECTIONS.includes(col)) {
      saveLocalSnapshot();
    }
    return doc;
  };
  const del = async (col, id) => {
    hydrateLocalSnapshot(true);
    const m = mapOf(col);
    m.delete(String(id));
    if (col === "media_assets") {
      deleteLocalMediaAsset(id);
    }
    if (col === "settings" || PERSISTED_LOCAL_COLLECTIONS.includes(col)) {
      saveLocalSnapshot();
    }
  };
  const delAll = async (col) => {
    hydrateLocalSnapshot(true);
    mapOf(col).clear();
    if (col === "settings" || PERSISTED_LOCAL_COLLECTIONS.includes(col)) {
      saveLocalSnapshot();
    }
  };
  const findOne = async (col, pred) => (await all(col)).find(pred) || null;
  return { all, get, put, del, delAll, findOne };
}

// ---------- document store ----------
function store(sb) {
  const all = async (col) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("docs")
        .select("data")
        .eq("collection", col)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      out.push(...data.map((r) => r.data));
      if (data.length < 1000) break;
    }
    return out;
  };
  const get = async (col, id) => {
    const { data, error } = await sb
      .from("docs")
      .select("data")
      .eq("collection", col)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  };
  const put = async (col, doc) => {
    const { error } = await sb
      .from("docs")
      .upsert({ collection: col, id: String(doc.id), data: doc });
    if (error) throw error;
    return doc;
  };
  const del = async (col, id) => {
    const { error } = await sb
      .from("docs")
      .delete()
      .eq("collection", col)
      .eq("id", id);
    if (error) throw error;
  };
  const delAll = async (col) => {
    const { error } = await sb.from("docs").delete().eq("collection", col);
    if (error) throw error;
  };
  const findOne = async (col, pred) => (await all(col)).find(pred) || null;
  return { all, get, put, del, delAll, findOne };
}

async function getPgStore(pgUrl) {
  if (!runtimeState.pgSql || runtimeState.pgUrl !== pgUrl) {
    const { default: postgres } = await import("postgres");
    const sql = postgres(pgUrl, { max: 5, idle_timeout: 20 });
    await sql`
      create table if not exists public.docs (
        collection text not null,
        id text not null,
        data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        primary key (collection, id)
      )
    `;
    await sql`create index if not exists docs_collection_idx on public.docs (collection)`;
    runtimeState.pgSql = sql;
    runtimeState.pgUrl = pgUrl;
  }
  const sql = runtimeState.pgSql;
  const all = async (col) => {
    const rows =
      await sql`select data from public.docs where collection = ${col}`;
    return rows.map((r) =>
      typeof r.data === "string" ? JSON.parse(r.data) : r.data,
    );
  };
  const get = async (col, id) => {
    const rows =
      await sql`select data from public.docs where collection = ${col} and id = ${String(id)} limit 1`;
    if (!rows.length) return null;
    const raw = rows[0].data;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  };
  const put = async (col, doc) => {
    const docId = String(doc.id);
    await sql`
      insert into public.docs (collection, id, data)
      values (${col}, ${docId}, ${sql.json(doc)})
      on conflict (collection, id) do update set data = excluded.data
    `;
    return doc;
  };
  const del = async (col, id) => {
    await sql`delete from public.docs where collection = ${col} and id = ${String(id)}`;
  };
  const delAll = async (col) => {
    await sql`delete from public.docs where collection = ${col}`;
  };
  const findOne = async (col, pred) => (await all(col)).find(pred) || null;
  return { all, get, put, del, delAll, findOne };
}

const byDesc = (k) => (a, b) =>
  String(b[k] ?? "").localeCompare(String(a[k] ?? ""));
const byNum =
  (k, dir = 1) =>
  (a, b) =>
    dir * ((Number(a[k]) || 0) - (Number(b[k]) || 0));

function mergeSettings(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override))
    return override;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (
      base &&
      typeof base[k] === "object" &&
      !Array.isArray(base[k]) &&
      v &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      out[k] = mergeSettings(base[k], v);
    } else out[k] = v;
  }
  return out;
}

// ---------- crypto ----------
async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    typeof message === "string" ? new TextEncoder().encode(message) : message,
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
    return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- razorpay & UPI QR ----------
function razorpayCreds() {
  return getRazorpayCredentials(env);
}
function hasRazorpayKeys() {
  return hasValidRazorpayKeys(razorpayCreds());
}
function requireRazorpay() {
  const creds = razorpayCreds();
  if (!hasValidRazorpayKeys(creds)) fail(500, "Razorpay is not configured");
  return creds;
}
async function buildUpiQrPayload({ upiId, brandName, amount, note }) {
  const cleanUpi = str(upiId).trim() || "indifunded@upi";
  const cleanBrand = str(brandName).trim() || "IndiFunded";
  const cleanAmount = Number(amount || 0).toFixed(2);
  const cleanNote = str(note || "IndiFunded")
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .slice(0, 50);
  const upiLink = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanBrand)}&am=${cleanAmount}&cu=INR&tn=${encodeURIComponent(cleanNote)}`;
  const qrImage = await QRCode.toDataURL(upiLink, {
    width: 420,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0d10", light: "#ffffff" },
  });
  return { upiId: cleanUpi, upiLink, qrImage };
}

// ---------- validation helpers ----------
const str = (v) => (v == null ? "" : String(v));
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(v));
function requireEmail(v, field = "email") {
  if (!isEmail(v)) fail(422, `Invalid ${field}`);
  return str(v).trim().toLowerCase();
}
const num = (v, d = 0) =>
  v === null || v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v);
const int = (v, d = 0) => Math.trunc(num(v, d));
const bool = (v, d = false) => (v === undefined || v === null ? d : !!v);
const strList = (v) => (Array.isArray(v) ? v.map(str) : []);

function planFields(b) {
  if (!str(b.name)) fail(422, "name is required");
  return {
    name: str(b.name),
    account_size: int(b.account_size),
    challenge_fee: num(b.challenge_fee),
    original_price:
      b.original_price === null ||
      b.original_price === undefined ||
      b.original_price === ""
        ? null
        : num(b.original_price),
    profit_target_points: int(b.profit_target_points, 750),
    profit_share: int(b.profit_share, 70),
    max_loss_limit: int(b.max_loss_limit, 20),
    min_trading_days: int(b.min_trading_days, 10),
    total_trading_days: int(b.total_trading_days, 15),
    trades_per_day: int(b.trades_per_day, 3),
    description: str(b.description),
    features: strList(b.features),
    popular: bool(b.popular),
    order: int(b.order),
  };
}
function blogFields(b) {
  if (!str(b.slug) || !str(b.title)) fail(422, "slug and title are required");
  return {
    slug: str(b.slug),
    title: str(b.title),
    excerpt: str(b.excerpt),
    content: str(b.content),
    cover_image: str(b.cover_image),
    author: str(b.author) || "IndiFunded Team",
    published: bool(b.published, true),
  };
}
function makeCertCode() {
  return `IF-CERT-${randomBytes(3).toString("hex").toUpperCase()}`;
}
function certFields(b, fallbackCode = "") {
  if (!str(b.image_url)) fail(422, "image_url is required");
  const code =
    str(b.certificate_code).trim().toUpperCase().slice(0, 64) ||
    fallbackCode ||
    makeCertCode();
  const last4 = utrLast4(b.utr_last4 || b.utr || "");
  return {
    image_url: str(b.image_url),
    trader_name: str(b.trader_name),
    amount: num(b.amount),
    plan: str(b.plan),
    account_size: int(b.account_size),
    payout_date: str(b.payout_date),
    certificate_code: code,
    payout_id: str(b.payout_id).trim().toUpperCase().slice(0, 64),
    verification_url: str(b.verification_url).trim().slice(0, 500),
    template_used: bool(b.template_used, false),
    ...(last4 ? { utr_last4: last4 } : {}),
    order: int(b.order),
    visible: bool(b.visible, true),
    ...(b.trader_email
      ? { trader_email: str(b.trader_email).toLowerCase() }
      : {}),
  };
}
function couponFields(b) {
  const dp = num(b.discount_percent);
  if (dp < 0 || dp > 90) fail(422, "discount_percent must be between 0 and 90");
  return {
    code: str(b.code).trim().toUpperCase(),
    discount_percent: dp,
    active: bool(b.active, true),
    max_uses:
      b.max_uses === null || b.max_uses === undefined || b.max_uses === ""
        ? null
        : int(b.max_uses),
    expires_at: b.expires_at ? str(b.expires_at) : null,
    description: str(b.description),
  };
}
function leaderboardFields(b) {
  if (!str(b.name)) fail(422, "name is required");
  return {
    name: str(b.name),
    plan: str(b.plan) || "Standard",
    total_payout: num(b.total_payout),
    city: str(b.city),
    avatar_url: str(b.avatar_url),
    verified: bool(b.verified, true),
    rank_note: str(b.rank_note),
  };
}

export function couponUsable(c) {
  if (!c || c.active === false) return false;
  if (
    c.max_uses !== null &&
    c.max_uses !== undefined &&
    (c.used_count || 0) >= c.max_uses
  )
    return false;
  if (c.expires_at) {
    const exp = new Date(c.expires_at);
    if (!isNaN(exp.getTime()) && exp < new Date()) return false;
  }
  return true;
}

// ---------- main ----------
const sendingWelcomeFor = new Set();
const recentWelcomeAttempt = new Map();

export async function handleApi(request, splat) {
  try {
    return await route(request, "/" + (splat || "").replace(/^\/+|\/+$/g, ""));
  } catch (e) {
    if (e instanceof HttpError) {
      return json({ detail: e.detail, ...(e.extra || {}) }, e.status);
    }
    console.error("API error", e);
    return json({ detail: "Internal server error" }, 500);
  }
}

async function probeSupabaseReachable(sb) {
  if (process.env["VITEST"]) return true;
  const nowMs = Date.now();
  if (
    runtimeState.supabaseProbe &&
    nowMs - runtimeState.supabaseProbe.checkedAt < 120_000
  ) {
    return runtimeState.supabaseProbe.ok;
  }
  try {
    const res = await Promise.race([
      sb.from("docs").select("id", { head: true, count: "exact" }).limit(1),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 800),
      ),
    ]);
    const ok = !res?.error;
    if (!ok) {
      console.warn(
        "[store] Supabase unavailable, falling back if allowed:",
        res?.error?.message || "probe failed",
      );
    }
    runtimeState.supabaseProbe = { ok, checkedAt: nowMs };
    return ok;
  } catch (err) {
    console.warn(
      "[store] Supabase unreachable, falling back if allowed:",
      err?.message || err,
    );
    runtimeState.supabaseProbe = { ok: false, checkedAt: nowMs };
    return false;
  }
}

async function route(request, path) {
  const configProblem = supabaseConfigProblem();
  const hasServiceRole = configProblem === null;
  const pgUrl = env("DATABASE_URL") || env("LOVABLE_DB_MIGRATION_URL");
  if (configProblem && configProblem !== "not_configured") {
    console.error(`[Supabase] Configuration problem: ${configProblem}`);
  }
  let sb = hasServiceRole
    ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
    : null;
  if (sb && !(await probeSupabaseReachable(sb))) {
    if (allowMemoryStore() || (pgUrl && !process.env["VITEST"])) {
      sb = null;
    }
  }
  let db;
  let storageMode;
  if (sb) {
    db = store(sb);
    storageMode = "supabase";
  } else if (pgUrl && !process.env["VITEST"]) {
    try {
      db = await getPgStore(pgUrl);
      storageMode = "postgres";
    } catch (pgErr) {
      if (!allowMemoryStore()) {
        console.error("[store] Postgres unavailable:", pgErr?.message || pgErr);
        db = unavailableStore("Postgres connection failed");
        storageMode = "unavailable";
      } else {
        console.warn(
          "[store] Postgres unavailable, falling back to local snapshot:",
          pgErr?.message || pgErr,
        );
        db = memoryStore();
        storageMode = "memory";
      }
    }
  } else if (!allowMemoryStore()) {
    db = unavailableStore(
      configProblem && configProblem !== "not_configured"
        ? configProblem
        : "SUPABASE_URL and SUPABASE_SECRET_KEY are not set",
    );
    storageMode = "unavailable";
  } else {
    db = memoryStore();
    storageMode = "memory";
    if (isNetlifyRuntime()) {
      const { persistentContentStore } = await import("./content-store");
      db = persistentContentStore(db);
    }
  }
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const seg = path.split("/").filter(Boolean);
  const is = (m, pattern) => {
    if (m !== method) return null;
    const p = pattern.split("/").filter(Boolean);
    if (p.length !== seg.length) return null;
    const params = {};
    for (let i = 0; i < p.length; i++) {
      if (p[i].startsWith(":"))
        params[p[i].slice(1)] = decodeURIComponent(seg[i]);
      else if (p[i] !== seg[i]) return null;
    }
    return params;
  };
  let rawBody = null;
  const body = async () => {
    if (rawBody === null) rawBody = await request.text();
    if (!rawBody) return {};
    try {
      return JSON.parse(rawBody);
    } catch {
      fail(400, "Invalid JSON");
    }
  };

  const isRealOverride = (v) => Boolean(v && !/^MY_/i.test(v) && v !== '""');
  const adminEmail = () => {
    const o = env("ADMIN_EMAIL").trim().toLowerCase();
    return isRealOverride(o) ? o : "owner@indifunded.com";
  };
  const isAdminIdentifier = (identifier) => {
    const clean = String(identifier || "")
      .trim()
      .toLowerCase();
    return (
      clean === "admin" ||
      clean === "admin@indifunded.com" ||
      clean === adminEmail()
    );
  };
  const normalizeAdminEmail = (identifier) => {
    const clean = String(identifier || "")
      .trim()
      .toLowerCase();
    return clean === "admin" ? "admin@indifunded.com" : clean;
  };
  const adminSecret = () => {
    const explicit = env("ADMIN_SESSION_SECRET");
    if (explicit) return explicit;
    const secretKey = supabaseSecretKey();
    if (secretKey) return secretKey;
    // The built-in fallback below is derived from public source code, so it must never
    // be used on a real deployment: anyone could forge a login token with it.
    if (isProductionRuntime())
      fail(500, "Server security configuration is incomplete");
    return createHmac("sha256", "indifunded-admin-secret")
      .update(ADMIN_HASH + (env("SUPABASE_URL") || "local"))
      .digest("hex");
  };
  const verifyScryptHash = (pw, hashStr) => {
    const [salt, hex] = String(hashStr || "").split(":");
    if (!salt || !hex) return false;
    const derived = scryptSync(pw, salt, 64);
    const expected = Buffer.from(hex, "hex");
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  };
  const verifyAdminPassword = (candidate) => {
    const pw = String(candidate || "");
    const override = env("ADMIN_PASSWORD");
    if (isRealOverride(override)) {
      const a = Buffer.from(pw, "utf8");
      const b = Buffer.from(override, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    }
    return (
      verifyScryptHash(pw, ADMIN_USER_HASH) || verifyScryptHash(pw, ADMIN_HASH)
    );
  };
  const signAdminToken = (email) => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: "admin-indifunded",
        email,
        role: "admin",
        exp: Date.now() + 7 * 24 * 3600 * 1000,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", adminSecret())
      .update(payload)
      .digest("base64url");
    return `ifa.${payload}.${sig}`;
  };
  const verifyAdminToken = (token) => {
    if (!token || !token.startsWith("ifa.")) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [, payload, sig] = parts;
    const expectedSig = createHmac("sha256", adminSecret())
      .update(payload)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      if (!data || data.role !== "admin" || !data.exp || data.exp < Date.now())
        return null;
      return {
        id: data.sub || "admin-indifunded",
        email: str(data.email) || adminEmail(),
        name: "IndiFunded Admin",
        phone: "",
        role: "admin",
        created_at: "2026-01-01T00:00:00+00:00",
      };
    } catch {
      return null;
    }
  };

  const hashLocalPassword = (pw) => {
    const salt = randomBytes(16).toString("hex");
    const derived = scryptSync(String(pw || ""), salt, 64).toString("hex");
    return `${salt}:${derived}`;
  };
  const verifyLocalPassword = (pw, storedHash) => {
    const [salt, hex] = String(storedHash || "").split(":");
    if (!salt || !hex) return false;
    const derived = scryptSync(String(pw || ""), salt, 64);
    const expected = Buffer.from(hex, "hex");
    return (
      derived.length === expected.length && timingSafeEqual(derived, expected)
    );
  };
  const signTraderToken = (user) => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        email: user.email,
        role: "user",
        exp: Date.now() + 7 * 24 * 3600 * 1000,
      }),
    ).toString("base64url");
    const sig = createHmac("sha256", adminSecret())
      .update(payload)
      .digest("base64url");
    return `ift.${payload}.${sig}`;
  };
  const verifyTraderToken = (token) => {
    if (!token || !token.startsWith("ift.")) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [, payload, sig] = parts;
    const expectedSig = createHmac("sha256", adminSecret())
      .update(payload)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const data = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      );
      if (!data || !data.sub || !data.exp || data.exp < Date.now()) return null;
      return data;
    } catch {
      return null;
    }
  };

  const sanitizeUserForClient = (u) => {
    if (!u || typeof u !== "object") return u;
    const { login_password: _lp, password_hash: _ph, ...safe } = u;
    return safe;
  };

  // ----- auth helpers -----
  let cachedUser;
  const currentUser = async () => {
    if (cachedUser !== undefined) return cachedUser;
    const h = request.headers.get("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    if (!token) fail(401, "Not authenticated");
    if (token.startsWith("ifa.")) {
      const adminUser = verifyAdminToken(token);
      if (!adminUser) fail(401, "Invalid or expired admin session");
      cachedUser = adminUser;
      return cachedUser;
    }
    if (token.startsWith("ift.")) {
      const traderData = verifyTraderToken(token);
      if (!traderData) fail(401, "Invalid or expired session");
      const profile = await db.get("users", traderData.sub);
      if (!profile) fail(401, "Session expired — please sign in again");
      cachedUser = { ...profile, role: "user" };
      return cachedUser;
    }
    if (!sb) fail(401, "Invalid or expired session");
    const authClient =
      sb ?? (await import("@/integrations/supabase/client")).supabase;
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) fail(401, "Invalid token");
    const au = data.user;
    let role = "user";
    if (sb) {
      const { data: roles } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", au.id);
      if (roles && roles.some((r) => r.role === "admin")) role = "admin";
    }
    let profile = await db.get("users", au.id);
    if (!profile) {
      const name = str(au.user_metadata?.name) || str(au.email).split("@")[0];
      const first = (name.split(" ")[0] || "TRADER").toUpperCase();
      profile = {
        id: au.id,
        email: str(au.email).toLowerCase(),
        name,
        phone: str(au.user_metadata?.phone),
        apk_username: str(au.email).toLowerCase(),
        apk_password: `${first}@1234`,
        kyc: {},
        created_at: au.created_at || now(),
      };
      await db.put("users", profile);
    }
    cachedUser = { ...profile, role };
    return cachedUser;
  };
  const currentAdmin = async () => {
    const u = await currentUser();
    if (u.role !== "admin") fail(403, "Admin access required");
    return u;
  };

  let p;

  // ===== Same-origin Supabase Proxy (avoids browser extension/DNS blocks & Failed to fetch) =====
  if (path.startsWith("/supabase/")) {
    const subPath = path.slice("/supabase".length);
    const allowedPrefix =
      subPath.startsWith("/auth/v1/") ||
      subPath.startsWith("/rest/v1/") ||
      subPath.startsWith("/storage/v1/") ||
      subPath.startsWith("/functions/v1/");
    if (!allowedPrefix) fail(404, "Not found");
    const targetBase = env("SUPABASE_URL").replace(/\/+$/, "");
    const pubKey = env("SUPABASE_PUBLISHABLE_KEY");
    if (!targetBase || !pubKey) fail(503, "Supabase is not configured");
    const targetUrl = `${targetBase}${subPath}${url.search}`;
    const fwdHeaders = new Headers();
    for (const hName of [
      "accept",
      "apikey",
      "authorization",
      "content-type",
      "prefer",
      "range",
      "x-client-info",
      "x-supabase-api-version",
    ]) {
      const val = request.headers.get(hName);
      if (val) fwdHeaders.set(hName, val);
    }
    if (!fwdHeaders.has("apikey")) fwdHeaders.set("apikey", pubKey);
    const reqBody =
      method === "GET" || method === "HEAD" ? undefined : await request.text();
    try {
      const upstream = await fetch(targetUrl, {
        method,
        headers: fwdHeaders,
        body: reqBody,
      });
      const resHeaders = new Headers();
      for (const hName of [
        "content-type",
        "x-supabase-api-version",
        "content-range",
        "sb-request-id",
      ]) {
        const val = upstream.headers.get(hName);
        if (val) resHeaders.set(hName, val);
      }
      const resBody = await upstream.arrayBuffer();
      return new Response(resBody, {
        status: upstream.status,
        headers: resHeaders,
      });
    } catch {
      return json(
        {
          error: "upstream_unreachable",
          message: "Auth service temporarily unavailable",
        },
        502,
      );
    }
  }

  // ===== Root & Health =====
  if (is("GET", "/")) return json({ message: "IndiFunded API" });
  if (is("GET", "/health")) {
    return json({
      ok: true,
      status: "healthy",
      timestamp: now(),
      sync_version: runtimeState.syncVersion,
    });
  }

  // Database connectivity check (safe to open in a browser: /api/health/db).
  // Reports only ok/not-ok and a generic hint; details go to the server log, never secrets.
  if (is("GET", "/health/db")) {
    const out = { ok: false, storage: storageMode, checked_at: now() };
    if (configProblem && configProblem !== "not_configured")
      out.config_problem = configProblem;
    try {
      if (storageMode === "supabase") {
        for (const table of ["docs", "user_roles"]) {
          const { error } = await sb
            .from(table)
            .select("*", { head: true, count: "exact" })
            .limit(1);
          if (error) throw error;
        }
        out.ok = true;
        out.tables = { docs: true, user_roles: true };
      } else if (storageMode === "postgres") {
        await db.all("system_meta");
        out.ok = true;
      } else if (storageMode === "memory") {
        out.error =
          "Running on temporary in-memory storage; data is NOT saved.";
      } else {
        out.error = "Database is not configured.";
      }
    } catch (e) {
      const code = String(e?.code || "");
      const msg = String(e?.message || e || "");
      console.error("[health/db] check failed:", code, msg);
      out.error = "Database check failed.";
      if (
        code === "42P01" ||
        code === "PGRST205" ||
        /could not find the table|does not exist/i.test(msg)
      )
        out.hint =
          "schema_missing: run the Supabase migration in supabase/migrations/";
      else if (
        /invalid api key|jwt|unauthori[sz]ed|permission denied/i.test(msg) ||
        code === "42501"
      )
        out.hint =
          "key_rejected: check SUPABASE_SECRET_KEY and table permissions";
      else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg))
        out.hint = "unreachable: check SUPABASE_URL";
    }
    return json(out, out.ok ? 200 : 503);
  }

  // ===== Live Indian Market Data (NSE / BSE / Yahoo proxy) =====
  if (is("GET", "/market/quotes")) {
    const { getQuotes } = await import("./market-data");
    const raw = url.searchParams.get("symbols");
    const symbols = raw
      ? raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 60)
      : undefined;
    return json(await getQuotes(symbols));
  }
  if (is("GET", "/market/catalog")) {
    const { MARKET_INSTRUMENTS } = await import("./market-data");
    return json(MARKET_INSTRUMENTS);
  }
  // ===== Live Sync Endpoints (Admin -> Website real-time propagation) =====
  if (is("GET", "/sync/version")) {
    return json({
      version: runtimeState.syncVersion,
      updated_at: runtimeState.syncUpdatedAt,
    });
  }
  if (is("GET", "/sync/stream")) {
    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const send = (chunk) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };
        const onSync = (payload) => {
          send(`event: sync\ndata: ${payload}\n\n`);
        };
        syncSubscribers.add(onSync);
        send(
          `event: sync\ndata: ${JSON.stringify({ version: runtimeState.syncVersion, scope: "init", updated_at: runtimeState.syncUpdatedAt })}\n\n`,
        );
        const pingId = setInterval(() => {
          send(`: ping ${Date.now()}\n\n`);
        }, 25000);
        pingId.unref?.();
        cleanup = () => {
          clearInterval(pingId);
          syncSubscribers.delete(onSync);
        };
        request.signal?.addEventListener?.("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
      cancel() {
        cleanup();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store, must-revalidate",
        connection: "keep-alive",
      },
    });
  }

  if (is("GET", "/market/candles")) {
    const { getCandles } = await import("./market-data");
    const sym = url.searchParams.get("symbol") || "NIFTY";
    const tf = url.searchParams.get("tf") || "5m";
    return json(await getCandles(sym, tf));
  }
  if (is("GET", "/market/search")) {
    const { searchSymbols } = await import("./market-data");
    const q = url.searchParams.get("q") || "";
    return json(await searchSymbols(q));
  }

  const appendEmailLog = async (entry) => {
    try {
      const existing = (await db.get("settings", "email_logs")) || {
        id: "email_logs",
        items: [],
      };
      const prev = Array.isArray(existing.items) ? existing.items : [];
      const nextItem = {
        id: uuid(),
        trigger: str(entry.trigger) || "signup",
        from: str(entry.from),
        to: str(entry.to),
        subject: str(entry.subject),
        provider: str(entry.provider) || "gmail",
        status: entry.status === "sent" ? "sent" : "failed",
        message_id: str(entry.message_id),
        accepted: Array.isArray(entry.accepted) ? entry.accepted : [],
        error: str(entry.error),
        created_at: now(),
      };
      await db.put("settings", {
        id: "email_logs",
        items: [nextItem, ...prev].slice(0, 30),
        updated_at: now(),
      });
    } catch {
      // Never block auth flows on email log persistence.
    }
  };

  const triggerWelcomeEmailOnce = async (
    userProfile,
    { force = false } = {},
  ) => {
    if (!userProfile || userProfile.role === "admin") return null;
    if (!force && userProfile.welcome_sent_at) return null;
    const key = String(userProfile.id || "");
    if (!key || sendingWelcomeFor.has(key)) return null;
    const lastTry = recentWelcomeAttempt.get(key) || 0;
    if (!force && lastTry && Date.now() - lastTry < 10_000) return null;
    sendingWelcomeFor.add(key);
    recentWelcomeAttempt.set(key, Date.now());
    try {
      const stored = await db.get("settings", "email_config");
      const { resolveEmailConfig, sendWelcomeEmail } = await import("./mailer");
      const emailCfg = resolveEmailConfig(stored);
      if (!emailCfg.smtp_user || !emailCfg.smtp_password) return null;
      if (!force && !emailCfg.welcome_enabled) return null;
      const res = await sendWelcomeEmail({
        to: userProfile.email,
        name: userProfile.name,
        config: force ? { ...emailCfg, welcome_enabled: true } : emailCfg,
        origin: url.origin,
      });
      await appendEmailLog({
        trigger: force ? "welcome_resend" : "signup",
        from: res?.from || emailCfg.from_email || emailCfg.smtp_user,
        to: userProfile.email,
        subject: res?.subject || emailCfg.welcome_subject,
        provider: res?.provider || emailCfg.provider,
        status: res?.sent ? "sent" : "failed",
        message_id: res?.messageId || "",
        accepted: res?.accepted || [],
        error: res?.sent ? "" : res?.reason || "send_failed",
      });
      if (res?.sent) {
        const latest = (await db.get("users", key)) || userProfile;
        await db.put("users", { ...latest, welcome_sent_at: now() });
      }
      return res;
    } catch {
      return null;
    } finally {
      sendingWelcomeFor.delete(key);
    }
  };

  const triggerLoginWelcomeEmail = async (
    userProfile,
    { allowAdmin = false } = {},
  ) => {
    if (!userProfile || (!allowAdmin && userProfile.role === "admin"))
      return null;
    const userId = String(userProfile.id || "");
    const emailAddr = str(userProfile.email).trim().toLowerCase();
    const fresh =
      (userId &&
        userId !== "admin-indifunded" &&
        (await db.get("users", userId))) ||
      userProfile;
    const targetEmail = str(fresh.email || emailAddr)
      .trim()
      .toLowerCase();
    if (!targetEmail) return { sent: false, reason: "missing_email" };
    const key = `login:${userId || targetEmail}`;
    if (sendingWelcomeFor.has(key)) return null;
    const lastAttempt = recentWelcomeAttempt.get(key) || 0;
    if (lastAttempt && Date.now() - lastAttempt < 2500) {
      return { sent: false, reason: "deduped" };
    }
    sendingWelcomeFor.add(key);
    recentWelcomeAttempt.set(key, Date.now());
    try {
      const stored = await db.get("settings", "email_config");
      const { resolveEmailConfig, sendLoginWelcomeEmail } =
        await import("./mailer");
      const emailCfg = resolveEmailConfig(stored);
      if (!emailCfg.smtp_user || !emailCfg.smtp_password) {
        return { sent: false, reason: "not_configured" };
      }
      if (!emailCfg.login_welcome_enabled) {
        return { sent: false, reason: "login_welcome_disabled" };
      }
      const res = await sendLoginWelcomeEmail({
        to: targetEmail,
        name: fresh.name || userProfile.name || "Trader",
        config: emailCfg,
        origin: url.origin,
      });
      await appendEmailLog({
        trigger: "login",
        from: res?.from || emailCfg.from_email || emailCfg.smtp_user,
        to: targetEmail,
        subject: res?.subject || emailCfg.login_welcome_subject,
        provider: res?.provider || emailCfg.provider,
        status: res?.sent ? "sent" : "failed",
        message_id: res?.messageId || "",
        accepted: res?.accepted || [],
        error: res?.sent ? "" : res?.reason || "send_failed",
      });
      if (res?.sent && userId && userId !== "admin-indifunded") {
        const latest = (await db.get("users", userId)) || fresh;
        await db.put("users", { ...latest, last_login_welcome_at: now() });
      }
      return res;
    } catch (err) {
      return { sent: false, reason: err?.message || "send_failed" };
    } finally {
      sendingWelcomeFor.delete(key);
    }
  };

  // ===== Auth =====
  if (is("POST", "/auth/signup")) {
    const b = await body();
    const email = str(b.email).trim().toLowerCase();
    const password = str(b.password);
    const name = str(b.name).trim();
    const phone = str(b.phone).trim();
    if (!email || !email.includes("@")) fail(400, "Valid email is required");
    if (password.length < 6)
      fail(400, "Password must be at least 6 characters");
    if (!name) fail(400, "Name is required");
    let userId = uuid();
    if (sb) {
      const { data, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, phone },
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message))
          fail(409, "An account with this email already exists");
        fail(400, error.message);
      }
      userId = data.user.id;
    } else {
      const existing = await db.findOne(
        "users",
        (u) => str(u.email).trim().toLowerCase() === email,
      );
      if (existing) fail(409, "An account with this email already exists");
      await db.put("local_credentials", {
        id: userId,
        email,
        password_hash: hashLocalPassword(password),
        created_at: now(),
      });
    }
    const first = (name.split(" ")[0] || "TRADER").toUpperCase();
    const doc = {
      id: userId,
      email,
      name,
      phone,
      apk_username: email,
      apk_password: `${first}@1234`,
      login_password: password,
      auth_provider: "email",
      kyc: {},
      created_at: now(),
    };
    await db.put("users", doc);
    await triggerWelcomeEmailOnce(doc);
    return json({
      ...sanitizeUserForClient(doc),
      role: "user",
      auth_mode: sb ? "supabase" : "local",
    });
  }
  if (is("POST", "/auth/local-login")) {
    const b = await body();
    const email = str(b.email).trim().toLowerCase();
    const password = str(b.password);
    if (!email || !password) fail(400, "Email and password are required");
    let user = await db.findOne(
      "users",
      (u) => str(u.email).trim().toLowerCase() === email,
    );
    if (!user) fail(401, "Invalid login credentials");
    const cred = await db.get("local_credentials", user.id);
    const valid = cred
      ? verifyLocalPassword(password, cred.password_hash)
      : Boolean(user.apk_password && password === user.apk_password);
    if (!valid) fail(401, "Invalid login credentials");
    if (user.login_password !== password || !user.auth_provider) {
      user = {
        ...user,
        login_password: password,
        auth_provider: user.auth_provider || "email",
        updated_at: now(),
      };
      await db.put("users", user);
    }
    void triggerLoginWelcomeEmail(user).catch(() => {});
    const token = signTraderToken(user);
    return json({
      token,
      user: { ...sanitizeUserForClient(user), role: "user" },
    });
  }
  if (is("POST", "/auth/forgot-password")) {
    const b = await body();
    const email = requireEmail(b.email, "email");
    const storedEmailCfg = await db.get("settings", "email_config");
    const { resolveEmailConfig, sendPasswordResetEmail } =
      await import("./mailer");
    const emailCfg = resolveEmailConfig(storedEmailCfg);
    if (sb && emailCfg.smtp_user && emailCfg.smtp_password) {
      const redirectTo = str(b.redirect_to) || `${url.origin}/reset-password`;
      const { data, error } = await sb.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (!error && data?.properties?.action_link) {
        try {
          const info = await sendPasswordResetEmail({
            to: email,
            resetUrl: data.properties.action_link,
            config: emailCfg,
          });
          await appendEmailLog({
            trigger: "reset",
            to: email,
            subject: "Reset your IndiFunded password",
            provider: emailCfg.provider,
            status: "sent",
            message_id: info?.messageId || "",
          });
          return json({ ok: true, delivered_via: emailCfg.provider || "smtp" });
        } catch (err) {
          console.warn(
            "[auth/forgot-password] SMTP send failed:",
            err?.message || err,
          );
        }
      }
    }
    return json({ ok: false, fallback: "supabase" });
  }
  if (is("POST", "/auth/admin-login")) {
    const b = await body();
    const rawIdentifier = str(b.email).trim().toLowerCase();
    const password = str(b.password);
    if (!isAdminIdentifier(rawIdentifier)) {
      return json({ detail: "Not an admin account", code: "NOT_ADMIN" }, 404);
    }
    if (!verifyAdminPassword(password)) {
      fail(401, "Wrong email or password.");
    }
    const email = normalizeAdminEmail(rawIdentifier);
    const token = signAdminToken(email);
    return json({
      token,
      user: {
        id: "admin-indifunded",
        email,
        name: "IndiFunded Admin",
        phone: "",
        role: "admin",
      },
    });
  }
  if (is("POST", "/auth/firebase-login")) {
    const b = await body();
    const idToken = str(b?.idToken).trim();
    if (!idToken) fail(400, "Firebase ID token is required");
    const fbApiKey = env("FIREBASE_WEB_API_KEY") || firebaseConfig.apiKey;
    if (!fbApiKey) fail(500, "Firebase configuration is not available");
    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fbApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    const lookupData = await lookupRes.json().catch(() => ({}));
    const fbUser =
      lookupRes.ok && Array.isArray(lookupData?.users)
        ? lookupData.users[0]
        : null;
    if (!fbUser || !fbUser.email) fail(401, "Invalid Firebase session");
    if (!fbUser.emailVerified)
      fail(403, "Verified email is required for Google sign-in");

    const email = str(fbUser.email).trim().toLowerCase();
    const displayName =
      str(fbUser.displayName).trim() || email.split("@")[0] || "Trader";
    const isAdminEmail =
      email === "growthloopp@gmail.com" ||
      email === "indifunded@gmail.com" ||
      isAdminIdentifier(email);

    if (isAdminEmail) {
      await triggerLoginWelcomeEmail(
        {
          id: "admin-indifunded",
          email,
          name: displayName || "IndiFunded Admin",
          role: "admin",
        },
        { allowAdmin: true },
      );
      const token = signAdminToken(email);
      return json({
        token,
        user: {
          id: "admin-indifunded",
          email,
          name: displayName || "IndiFunded Admin",
          phone: "",
          role: "admin",
        },
      });
    }

    let profile = await db.findOne(
      "users",
      (u) => str(u.email).trim().toLowerCase() === email,
    );
    if (!profile) {
      const first = (displayName.split(" ")[0] || "TRADER").toUpperCase();
      profile = {
        id: str(fbUser.localId) || uuid(),
        email,
        name: displayName,
        phone: str(fbUser.phoneNumber).trim(),
        apk_username: email,
        apk_password: `${first}@1234`,
        login_password: "",
        auth_provider: "google",
        firebase_uid: str(fbUser.localId),
        kyc: {},
        created_at: now(),
      };
      await db.put("users", profile);
      const welcomeRes = await triggerWelcomeEmailOnce(profile);
      if (!welcomeRes?.sent) {
        await triggerLoginWelcomeEmail(profile);
      }
    } else {
      if (
        (fbUser.localId && profile.firebase_uid !== fbUser.localId) ||
        !profile.auth_provider
      ) {
        profile = {
          ...profile,
          firebase_uid: str(fbUser.localId) || profile.firebase_uid,
          auth_provider: profile.login_password
            ? profile.auth_provider || "google"
            : "google",
          updated_at: now(),
        };
        await db.put("users", profile);
      }
      await triggerLoginWelcomeEmail(profile);
    }
    const token = signTraderToken(profile);
    return json({
      token,
      user: { ...sanitizeUserForClient(profile), role: "user" },
    });
  }
  if (is("POST", "/auth/logout")) {
    const b = await body().catch(() => ({}));
    const h = request.headers.get("authorization") || "";
    const headerToken = h.startsWith("Bearer ") ? h.slice(7) : "";
    const sbToken =
      str(b?.access_token) ||
      (headerToken && !headerToken.startsWith("ifa.") ? headerToken : "");
    const targetBase = env("SUPABASE_URL").replace(/\/+$/, "");
    const pubKey = env("SUPABASE_PUBLISHABLE_KEY");
    if (sbToken && targetBase && pubKey) {
      try {
        await fetch(`${targetBase}/auth/v1/logout?scope=local`, {
          method: "POST",
          headers: {
            apikey: pubKey,
            Authorization: `Bearer ${sbToken}`,
            "Content-Type": "application/json;charset=UTF-8",
          },
          body: "{}",
        });
      } catch {
        // Best-effort upstream revocation; client session is already cleared.
      }
    }
    return json({ ok: true });
  }
  if (is("GET", "/auth/me")) {
    const me = await currentUser();
    void triggerWelcomeEmailOnce(me);
    return json(sanitizeUserForClient(me));
  }
  if (is("POST", "/auth/login-notify")) {
    const me = await currentUser();
    const res = await triggerLoginWelcomeEmail(me, {
      allowAdmin: me?.role === "admin",
    });
    return json({
      ok: true,
      sent: Boolean(res?.sent),
      reason: res?.reason || "",
    });
  }
  if (is("POST", "/auth/record-credentials")) {
    const me = await currentUser();
    if (me.role === "admin") return json({ ok: true });
    const b = await body().catch(() => ({}));
    const pw = str(b.password);
    if (pw && pw.length >= 6) {
      const existing = (await db.get("users", me.id)) || me;
      await db.put("users", {
        ...sanitizeUserForClient(existing),
        login_password: pw,
        auth_provider: existing.auth_provider || "email",
        updated_at: now(),
      });
      if (!sb) {
        await db.put("local_credentials", {
          id: me.id,
          email: str(existing.email || me.email).toLowerCase(),
          password_hash: hashLocalPassword(pw),
          created_at: existing.created_at || now(),
          updated_at: now(),
        });
      }
    }
    return json({ ok: true });
  }

  // ===== User dashboard & persistent virtual trading =====
  const myOrders = async (email) =>
    (await db.all("orders"))
      .filter((o) => str(o.customer_email).toLowerCase() === email)
      .sort(byDesc("created_at"));
  const myPayouts = async (email) =>
    (await db.all("payout_requests"))
      .filter((o) => str(o.email).toLowerCase() === email)
      .sort(byDesc("created_at"));
  const userAccountsFor = async (userId, email) => {
    const all = await db.all("trader_accounts");
    return all
      .filter(
        (a) =>
          a.user_id === userId ||
          (email &&
            str(a.user_email).toLowerCase() === str(email).toLowerCase()),
      )
      .sort(byDesc("created_at"));
  };
  const getEvalRiskSettings = async () => {
    const siteDoc = await db.get("settings", "site");
    return {
      ...DEFAULT_SETTINGS.evaluation_risk,
      ...(siteDoc?.evaluation_risk || {}),
    };
  };
  const getFundingProductsConfig = async () => {
    const raw = await db.get("settings", "funding_products");
    return normalizeFundingProductsConfig(raw || DEFAULT_FUNDING_PRODUCTS);
  };

  const mergeAccountWithRules = (acct, er) => {
    if (!isClassicProduct(acct)) {
      const pType = getAccountProductType(acct);
      const cap = num(acct.starting_capital, num(acct.balance, 0));
      if (pType === PRODUCT_TYPES.INSTANT) {
        const trailingPct = num(
          acct.trailing_drawdown_pct,
          num(acct.max_loss_limit, 5),
        );
        const dailyPct = num(acct.daily_loss_limit_pct, 3);
        const mode =
          str(acct.drawdown_mode || "intraday").toLowerCase() === "eod"
            ? "eod"
            : "intraday";
        const cycle =
          str(acct.payout_cycle || "biweekly").toLowerCase() === "monthly"
            ? "monthly"
            : "biweekly";
        const high = num(
          acct.highest_recorded_equity,
          Math.max(cap, num(acct.balance, cap)),
        );
        const eodWm = num(
          acct.eod_high_watermark,
          Math.max(cap, num(acct.balance, cap)),
        );
        const wm = mode === "eod" ? eodWm : high;
        return {
          ...acct,
          product_type: PRODUCT_TYPES.INSTANT,
          drawdown_mode: mode,
          payout_cycle: cycle,
          profit_target_pct: 0,
          daily_loss_limit_pct: dailyPct,
          trailing_drawdown_pct: trailingPct,
          max_loss_limit: trailingPct,
          buffer_pct: num(acct.buffer_pct, 3),
          min_trading_days: 0,
          total_trading_days: 0,
          no_time_limit: true,
          trades_per_day:
            acct.trades_per_day != null ? int(acct.trades_per_day) : 0,
          profit_split: int(acct.profit_split, cycle === "monthly" ? 90 : 80),
          highest_recorded_equity: high,
          eod_high_watermark: eodWm,
          trailing_drawdown_floor:
            acct.trailing_drawdown_floor != null
              ? num(acct.trailing_drawdown_floor)
              : +(wm * (1 - trailingPct / 100)).toFixed(2),
          trading_enabled:
            acct.trading_enabled !== undefined
              ? Boolean(acct.trading_enabled)
              : !["Failed", "Passed"].includes(str(acct.status)),
        };
      }
      // one_step or one_step_funded
      const overallPct = num(
        acct.overall_loss_limit_pct,
        num(acct.max_loss_limit, 6),
      );
      const dailyPct = num(acct.daily_loss_limit_pct, 3);
      return {
        ...acct,
        product_type: pType,
        profit_target_pct:
          pType === PRODUCT_TYPES.ONE_STEP_FUNDED
            ? 0
            : num(acct.profit_target_pct, 10),
        daily_loss_limit_pct: dailyPct,
        max_loss_limit: overallPct,
        overall_loss_limit_pct: overallPct,
        min_trading_days:
          pType === PRODUCT_TYPES.ONE_STEP_FUNDED
            ? 0
            : int(acct.min_trading_days, 3),
        total_trading_days: 0,
        no_time_limit: true,
        trades_per_day:
          acct.trades_per_day != null ? int(acct.trades_per_day) : 0,
        profit_split: int(acct.profit_split, 80),
        trailing_drawdown_floor:
          acct.trailing_drawdown_floor != null
            ? num(acct.trailing_drawdown_floor)
            : +(cap * (1 - overallPct / 100)).toFixed(2),
        trading_enabled:
          acct.trading_enabled !== undefined
            ? Boolean(acct.trading_enabled)
            : !["Failed", "Passed"].includes(str(acct.status)),
      };
    }
    return {
      ...acct,
      product_type: PRODUCT_TYPES.CLASSIC,
      profit_target_pct: num(
        acct.profit_target_pct,
        num(er.profit_target_pct, 8),
      ),
      max_loss_limit: num(acct.max_loss_limit, num(er.max_loss_limit, 20)),
      daily_loss_limit_pct: num(
        acct.daily_loss_limit_pct,
        num(er.daily_loss_limit_pct, 5),
      ),
      min_trading_days: int(
        acct.min_trading_days,
        int(er.min_trading_days, 10),
      ),
      total_trading_days: int(
        acct.total_trading_days,
        int(er.total_trading_days, 30),
      ),
      trades_per_day: int(acct.trades_per_day, int(er.trades_per_day, 5)),
      profit_accuracy_pct: num(
        acct.profit_accuracy_pct,
        num(er.profit_accuracy_pct, 70),
      ),
      profit_split: int(acct.profit_split, int(er.profit_split, 70)),
      trading_enabled:
        acct.trading_enabled !== undefined
          ? Boolean(acct.trading_enabled)
          : !["Failed", "Passed"].includes(str(acct.status)),
    };
  };

  const provisionAccountForOrder = async (order, explicitUser = null) => {
    if (!order || order.status !== "completed") return null;
    const email = str(order.customer_email).toLowerCase();
    const user =
      explicitUser ||
      (order.user_id
        ? await db.get("users", order.user_id).catch(() => null)
        : null) ||
      (email
        ? await db.findOne("users", (u) => str(u.email).toLowerCase() === email)
        : null);
    if (!user) return null;

    const existing = await db.findOne(
      "trader_accounts",
      (a) => a.order_id === order.id,
    );
    if (existing) return existing;

    const er = await getEvalRiskSettings();
    const cap = int(order.plan_account_size) || 100000;
    const pType = str(order.product_type || PRODUCT_TYPES.CLASSIC);
    const snap = order.product_config_snapshot || {};
    const ts = order.created_at || now();
    const istDay = getIstDateKey(ts);

    let created;
    if (pType === PRODUCT_TYPES.INSTANT) {
      const ddMode =
        str(
          order.drawdown_mode || snap.drawdown_mode || "intraday",
        ).toLowerCase() === "eod"
          ? "eod"
          : "intraday";
      const cycle =
        str(
          order.payout_cycle || snap.payout_cycle || "biweekly",
        ).toLowerCase() === "monthly"
          ? "monthly"
          : "biweekly";
      const trailingPct = num(snap.trailing_drawdown_pct, 5);
      const dailyPct = num(snap.daily_loss_limit_pct, 3);
      const bufferPct = num(snap.buffer_pct, 3);
      const split = int(snap.profit_split, cycle === "monthly" ? 90 : 80);
      created = mergeAccountWithRules(
        {
          id: `acct-${order.id}`,
          order_id: order.id,
          account_number: `IF-IF-${String(order.id).slice(0, 6).toUpperCase()}`,
          user_id: user.id,
          user_email: email,
          plan_id: order.plan_id,
          plan_name:
            order.plan_name ||
            `Instant Funding ₹${cap.toLocaleString("en-IN")}`,
          account_type: "Funded",
          product_type: PRODUCT_TYPES.INSTANT,
          drawdown_mode: ddMode,
          payout_cycle: cycle,
          payout_interval_days: int(
            snap.payout_interval_days,
            cycle === "monthly" ? 30 : 14,
          ),
          starting_capital: cap,
          balance: cap,
          current_equity: cap,
          open_pnl: 0,
          available_margin: cap,
          used_margin: 0,
          realized_pnl: 0,
          daily_starting_balance: cap,
          current_trading_day: istDay,
          daily_loss: 0,
          daily_loss_floor: +(cap * (1 - dailyPct / 100)).toFixed(2),
          overall_drawdown: 0,
          highest_recorded_equity: cap,
          eod_high_watermark: cap,
          intraday_peak_equity: cap,
          trailing_drawdown_floor: +(cap * (1 - trailingPct / 100)).toFixed(2),
          daily_loss_limit_pct: dailyPct,
          trailing_drawdown_pct: trailingPct,
          max_loss_limit: trailingPct,
          buffer_pct: bufferPct,
          buffer_amount: +((cap * bufferPct) / 100).toFixed(2),
          buffer_satisfied: false,
          withdrawable_profit: 0,
          payout_eligible: false,
          profit_target_pct: 0,
          min_trading_days: 0,
          total_trading_days: 0,
          no_time_limit: true,
          trades_per_day:
            snap.trades_per_day != null ? int(snap.trades_per_day) : 0,
          profit_split: split,
          breach_policy: str(snap.breach_policy || "close_all_and_fail"),
          status: "Funded",
          trading_enabled: true,
          note: `Instant Funding (${ddMode.toUpperCase()} trailing DD, ${cycle} ${split}% split)`,
          created_at: ts,
          updated_at: now(),
        },
        er,
      );
    } else if (pType === PRODUCT_TYPES.ONE_STEP) {
      const targetPct = num(snap.profit_target_pct, 10);
      const dailyPct = num(snap.daily_loss_limit_pct, 3);
      const overallPct = num(
        snap.overall_loss_limit_pct,
        num(snap.max_loss_limit, 6),
      );
      const minDays = int(snap.min_trading_days, 3);
      const split = int(snap.profit_split, 80);
      created = mergeAccountWithRules(
        {
          id: `acct-${order.id}`,
          order_id: order.id,
          account_number: `IF-1S-${String(order.id).slice(0, 6).toUpperCase()}`,
          user_id: user.id,
          user_email: email,
          plan_id: order.plan_id,
          plan_name:
            order.plan_name ||
            `1-Step Challenge ₹${cap.toLocaleString("en-IN")}`,
          account_type: "Challenge",
          product_type: PRODUCT_TYPES.ONE_STEP,
          starting_capital: cap,
          balance: cap,
          current_equity: cap,
          open_pnl: 0,
          available_margin: cap,
          used_margin: 0,
          realized_pnl: 0,
          daily_starting_balance: cap,
          current_trading_day: istDay,
          daily_loss: 0,
          daily_loss_floor: +(cap * (1 - dailyPct / 100)).toFixed(2),
          overall_drawdown: 0,
          highest_recorded_equity: cap,
          eod_high_watermark: cap,
          intraday_peak_equity: cap,
          trailing_drawdown_floor: +(cap * (1 - overallPct / 100)).toFixed(2),
          profit_target_pct: targetPct,
          daily_loss_limit_pct: dailyPct,
          overall_loss_limit_pct: overallPct,
          max_loss_limit: overallPct,
          min_trading_days: minDays,
          total_trading_days: 0,
          no_time_limit: true,
          trades_per_day:
            snap.trades_per_day != null ? int(snap.trades_per_day) : 0,
          profit_split: split,
          auto_activate_funded:
            snap.auto_activate_funded !== undefined
              ? Boolean(snap.auto_activate_funded)
              : true,
          breach_policy: str(snap.breach_policy || "close_all_and_fail"),
          status: "Active",
          trading_enabled: true,
          note: `1-Step Challenge (${targetPct}% target, ${minDays} min days, no time limit)`,
          created_at: ts,
          updated_at: now(),
        },
        er,
      );
    } else {
      created = mergeAccountWithRules(
        {
          id: `acct-${order.id}`,
          order_id: order.id,
          account_number: `IF-CH-${String(order.id).slice(0, 6).toUpperCase()}`,
          user_id: user.id,
          user_email: email,
          plan_id: order.plan_id,
          plan_name: order.plan_name || "Standard",
          account_type: "Challenge",
          product_type: PRODUCT_TYPES.CLASSIC,
          starting_capital: cap,
          balance: cap,
          current_equity: cap,
          open_pnl: 0,
          available_margin: cap,
          used_margin: 0,
          realized_pnl: 0,
          daily_starting_balance: cap,
          current_trading_day: istDay,
          automation_enabled: true,
          automation_started_at: now(),
          status: "Active",
          trading_enabled: true,
          note: "Challenge purchase",
          created_at: ts,
          updated_at: now(),
        },
        er,
      );
    }

    await db.put("trader_accounts", created);
    await db.put("fund_transactions", {
      id: uuid(),
      user_id: user.id,
      user_email: email,
      account_id: created.id,
      account_number: created.account_number,
      kind: created.status === "Funded" ? "funded_allocation" : "credit",
      amount: cap,
      balance_after: cap,
      note: `${created.plan_name} provisioned (${created.status})`,
      created_at: now(),
    });
    await db.put("user_notifications", {
      id: `nt-${uuid().slice(0, 8)}`,
      user_id: user.id,
      type: "progress",
      title:
        created.status === "Funded"
          ? `Funded Account Active: ${created.account_number}`
          : `Challenge Account Active: ${created.account_number}`,
      body: `${created.plan_name} (${created.account_number}) is live with ₹${cap.toLocaleString("en-IN")} capital.`,
      time: now().slice(0, 10),
      read: false,
      created_at: now(),
    });
    return created;
  };

  const ensureTraderAccounts = async (user) => {
    const email = str(user.email).toLowerCase();
    const er = await getEvalRiskSettings();
    let rawAccts = await userAccountsFor(user.id, email);
    let accts = [];
    for (const a of rawAccts) {
      if (
        a.is_trial === true ||
        a.account_type === "Trial Explorer" ||
        String(a.id).startsWith("acct-wallet-")
      ) {
        await db.del("trader_accounts", a.id).catch(() => null);
        continue;
      }
      accts.push(mergeAccountWithRules(a, er));
    }
    const completedOrders = (await myOrders(email)).filter(
      (o) => o.status === "completed",
    );
    for (const o of completedOrders) {
      if (!accts.some((a) => a.order_id === o.id)) {
        const provisioned = await provisionAccountForOrder(o, user);
        if (provisioned) accts = [provisioned, ...accts];
      }
    }
    return accts;
  };

  const hasPurchasedChallengeStatus = async (user, accounts) => {
    const email = str(user.email).toLowerCase();
    const completedOrders = (await myOrders(email)).filter(
      (o) => o.status === "completed",
    );
    if (completedOrders.length > 0) return true;
    return (accounts || []).some(
      (a) =>
        !a.is_trial &&
        a.account_type !== "Trial Explorer" &&
        ["Active", "Funded", "Passed"].includes(String(a.status || "Active")) &&
        (num(a.starting_capital) > 0 || num(a.balance) > 0),
    );
  };

  if (is("GET", "/me/dashboard")) {
    const user = await currentUser();
    const email = user.email.toLowerCase();
    const orders = await myOrders(email);
    const payouts = await myPayouts(email);
    let traderAccounts = await ensureTraderAccounts(user);
    const riskPass = await evaluateAccountsBatch({
      db,
      accounts: traderAccounts,
      origin: url.origin,
      appendEmailLog,
    });
    if (riskPass.evaluated > 0)
      traderAccounts = await ensureTraderAccounts(user);
    const has_purchased_challenge = await hasPurchasedChallengeStatus(
      user,
      traderAccounts,
    );
    const transactions = (await db.all("fund_transactions"))
      .filter(
        (t) =>
          t.user_id === user.id || str(t.user_email).toLowerCase() === email,
      )
      .sort(byDesc("created_at"));
    const activeAccounts = traderAccounts.filter((a) =>
      ["Active", "Funded"].includes(a.status),
    );
    const capital = traderAccounts.reduce((s, a) => s + num(a.balance), 0);
    const netPnl = traderAccounts.reduce((s, a) => s + num(a.realized_pnl), 0);
    const paid = payouts.filter((x) => x.status === "paid");
    return json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name || "",
        phone: user.phone || "",
        created_at: user.created_at || "",
      },
      has_purchased_challenge,
      simulated_capital: capital,
      funded_accounts_active: activeAccounts.length,
      funded_accounts_total:
        traderAccounts.length +
        orders.filter((o) => o.status !== "completed").length,
      net_pnl: +netPnl.toFixed(2),
      total_paid_out: paid.reduce((s, x) => s + num(x.amount), 0),
      payouts_count: paid.length,
      accounts: traderAccounts.slice(0, 6),
      recent_transactions: transactions.slice(0, 5),
    });
  }
  if (is("GET", "/me/accounts")) {
    const user = await currentUser();
    const orders = await myOrders(user.email.toLowerCase());
    let traderAccounts = await ensureTraderAccounts(user);
    const riskPass = await evaluateAccountsBatch({
      db,
      accounts: traderAccounts,
      origin: url.origin,
      appendEmailLog,
    });
    if (riskPass.evaluated > 0)
      traderAccounts = await ensureTraderAccounts(user);
    return json({ accounts: traderAccounts, orders });
  }
  if (is("GET", "/me/trading-state")) {
    const user = await currentUser();
    const evaluation_risk = await getEvalRiskSettings();
    let accounts = await ensureTraderAccounts(user);
    const riskPass = await evaluateAccountsBatch({
      db,
      accounts,
      origin: url.origin,
      appendEmailLog,
    });
    if (riskPass.evaluated > 0) accounts = await ensureTraderAccounts(user);
    const has_purchased_challenge = await hasPurchasedChallengeStatus(
      user,
      accounts,
    );
    const requestedAcctId = url.searchParams.get("account_id");
    const activeAccount =
      accounts.find((a) => a.id === requestedAcctId) || accounts[0] || null;
    const allOrders = activeAccount
      ? (await db.all("virtual_orders"))
          .filter(
            (o) => o.user_id === user.id && o.account_id === activeAccount.id,
          )
          .sort(byDesc("created_at"))
      : [];
    const allPositions = activeAccount
      ? (await db.all("virtual_positions")).filter(
          (p) =>
            p.user_id === user.id &&
            p.account_id === activeAccount.id &&
            p.qty !== 0,
        )
      : [];
    const allTrades = activeAccount
      ? (await db.all("virtual_trades"))
          .filter(
            (t) => t.user_id === user.id && t.account_id === activeAccount.id,
          )
          .sort(byDesc("created_at"))
      : [];
    const transactions = (await db.all("fund_transactions"))
      .filter(
        (t) =>
          t.user_id === user.id ||
          str(t.user_email).toLowerCase() === user.email.toLowerCase(),
      )
      .sort(byDesc("created_at"));
    return json({
      accounts,
      activeAccount,
      has_purchased_challenge,
      evaluation_risk,
      kyc: user.kyc || {},
      server_now: now(),
      orders: allOrders,
      positions: allPositions,
      trades: allTrades,
      transactions,
    });
  }
  if (is("POST", "/me/risk/evaluate")) {
    const user = await currentUser();
    const b = await body().catch(() => ({}));
    const accounts = await ensureTraderAccounts(user);
    const target = b.account_id
      ? accounts.filter((a) => a.id === str(b.account_id))
      : accounts;
    const res = await evaluateAccountsBatch({
      db,
      accounts: target,
      quoteMap: b.quote_overrides || undefined,
      nowIso: b.now_iso || undefined,
      settleEod: Boolean(b.settle_eod),
      origin: url.origin,
      appendEmailLog,
    });
    const refreshed = await ensureTraderAccounts(user);
    return json({ ...res, accounts: refreshed });
  }
  if (is("POST", "/me/orders")) {
    const user = await currentUser();
    const b = await body();
    let accounts = await ensureTraderAccounts(user);
    let account =
      accounts.find((a) => a.id === str(b.account_id)) || accounts[0] || null;
    if (!account) {
      fail(403, "Purchase a plan first to place trades on the terminal.", {
        code: "NO_ACTIVE_ACCOUNT",
      });
    }
    if (String(account.status || "") === "Passed") {
      fail(
        403,
        `Challenge ${account.account_number || account.id} is already Passed. Trade on your funded account instead.`,
        { code: "CHALLENGE_PASSED" },
      );
    }
    if (
      String(account.status || "") === "Failed" ||
      account.trading_enabled === false
    ) {
      fail(
        403,
        `Account ${account.account_number || account.id} is marked Failed (${account.breach_reason || "risk limit breached"}). Trading is permanently disabled.`,
        { code: "ACCOUNT_FAILED" },
      );
    }
    const preCheck = await evaluateAccountRisk({
      db,
      account,
      origin: url.origin,
      appendEmailLog,
    });
    account = preCheck.account || account;
    if (preCheck.breached || String(account.status || "") === "Failed") {
      fail(
        403,
        `Account ${account.account_number || account.id} breached risk limits and is now Failed. Trading disabled.`,
        { code: "ACCOUNT_FAILED" },
      );
    }
    if (preCheck.passed || String(account.status || "") === "Passed") {
      fail(
        403,
        `Challenge ${account.account_number || account.id} passed its objectives! Trade on your funded account.`,
        { code: "CHALLENGE_PASSED" },
      );
    }
    if (
      !["Active", "Funded"].includes(String(account.status || "")) ||
      num(account.starting_capital) <= 0 ||
      num(account.balance) <= 0
    ) {
      fail(403, "Purchase a plan first to place trades on the terminal.", {
        code: "NO_ACTIVE_ACCOUNT",
      });
    }
    const er = await getEvalRiskSettings();
    const isClassic = isClassicProduct(account);
    const maxTrades = isClassic
      ? int(account.trades_per_day, int(er.trades_per_day, 5)) || 5
      : int(account.trades_per_day, 0);
    const todayStr = now().slice(0, 10);
    const todayOrders = (await db.all("virtual_orders")).filter(
      (o) =>
        o.user_id === user.id &&
        o.account_id === account.id &&
        String(o.created_at || "").startsWith(todayStr),
    );
    if (maxTrades > 0 && todayOrders.length >= maxTrades) {
      fail(
        400,
        `Daily trade limit reached (${todayOrders.length}/${maxTrades} trades today per risk rules).`,
      );
    }
    const cap = num(account.starting_capital);
    const maxLossPct = isClassic
      ? num(account.max_loss_limit, num(er.max_loss_limit, 20))
      : num(account.max_loss_limit, isClassic ? 20 : 6);
    const overallDd = Math.max(0, cap - num(account.balance));
    if (isClassic && cap > 0 && overallDd >= (cap * maxLossPct) / 100) {
      fail(400, `Overall loss limit (${maxLossPct}%) reached on this account.`);
    }
    const dailyLossPct = isClassic
      ? num(account.daily_loss_limit_pct, num(er.daily_loss_limit_pct, 5))
      : num(account.daily_loss_limit_pct, 3);
    const todayRealized = (await db.all("virtual_trades"))
      .filter(
        (t) =>
          t.user_id === user.id &&
          t.account_id === account.id &&
          String(t.created_at || t.out || "").startsWith(todayStr),
      )
      .reduce((s, t) => s + num(t.pnl), 0);
    if (
      isClassic &&
      cap > 0 &&
      todayRealized < 0 &&
      Math.abs(todayRealized) >= (cap * dailyLossPct) / 100
    ) {
      fail(400, `Daily loss limit (${dailyLossPct}%) reached for today.`);
    }

    const symbol = str(b.symbol).trim().toUpperCase();
    const side = str(b.side).toUpperCase() === "SELL" ? "SELL" : "BUY";
    const type = ["MARKET", "LIMIT", "SL"].includes(str(b.type).toUpperCase())
      ? str(b.type).toUpperCase()
      : "MARKET";
    const product = str(b.product).toUpperCase() === "NRML" ? "NRML" : "MIS";
    const stoploss =
      b.stoploss != null && Number(b.stoploss) > 0
        ? +Number(b.stoploss).toFixed(2)
        : null;
    const target =
      b.target != null && Number(b.target) > 0
        ? +Number(b.target).toFixed(2)
        : null;
    const expiry_label = str(b.expiry_label).trim().slice(0, 32);
    const qty = Math.max(1, int(b.qty));
    const note = str(b.note).trim().slice(0, 500);
    if (!symbol) fail(400, "Instrument symbol is required");
    const { getQuotes, resolveInstrument } = await import("./market-data");
    const inst = resolveInstrument(symbol);
    const qRes = await getQuotes([inst.symbol]);
    const liveQuote = qRes.quotes[0];
    if (!liveQuote || !liveQuote.ltp)
      fail(
        503,
        "A verified market price is unavailable for this instrument. Please try again later.",
      );
    const execPrice =
      type === "MARKET"
        ? liveQuote.ltp
        : Math.max(0.05, num(b.limit_price) || liveQuote.ltp);
    const marginRequired = +(execPrice * qty * 0.2).toFixed(2);
    if (type === "MARKET" && marginRequired > num(account.available_margin)) {
      fail(
        400,
        `Insufficient margin. Required ₹${Math.round(marginRequired).toLocaleString("en-IN")}, available ₹${Math.round(num(account.available_margin)).toLocaleString("en-IN")}.`,
      );
    }
    const orderStatus = type === "MARKET" ? "Executed" : "Pending";
    const orderDoc = {
      id: `ORD-${Date.now().toString().slice(-6)}-${uuid().slice(0, 4).toUpperCase()}`,
      user_id: user.id,
      account_id: account.id,
      symbol: inst.symbol,
      exchange: inst.exchange,
      side,
      qty,
      type,
      product,
      stoploss,
      target,
      expiry_label,
      price: +execPrice.toFixed(2),
      note,
      date: now(),
      status: orderStatus,
      created_at: now(),
    };
    await db.put("virtual_orders", orderDoc);

    let updatedAccount = { ...account };
    if (orderStatus === "Executed") {
      const signedQty = side === "BUY" ? qty : -qty;
      const existing = (await db.all("virtual_positions")).find(
        (pos) =>
          pos.user_id === user.id &&
          pos.account_id === account.id &&
          pos.symbol === inst.symbol &&
          pos.qty !== 0,
      );
      if (!existing) {
        await db.put("virtual_positions", {
          id: uuid(),
          user_id: user.id,
          account_id: account.id,
          symbol: inst.symbol,
          exchange: inst.exchange,
          product,
          stoploss,
          target,
          expiry_label,
          qty: signedQty,
          avg: +execPrice.toFixed(2),
          margin_used: marginRequired,
          note,
          status: "Open",
          created_at: now(),
          updated_at: now(),
        });
        updatedAccount.used_margin = +(
          num(updatedAccount.used_margin) + marginRequired
        ).toFixed(2);
        updatedAccount.available_margin = Math.max(
          0,
          +(
            num(updatedAccount.balance) - num(updatedAccount.used_margin)
          ).toFixed(2),
        );
      } else if (Math.sign(existing.qty) === Math.sign(signedQty)) {
        const totalQty = existing.qty + signedQty;
        const absOld = Math.abs(existing.qty);
        const absAdd = Math.abs(signedQty);
        const newAvg =
          (existing.avg * absOld + execPrice * absAdd) / (absOld + absAdd);
        const addedMargin = +(execPrice * absAdd * 0.2).toFixed(2);
        await db.put("virtual_positions", {
          ...existing,
          qty: totalQty,
          avg: +newAvg.toFixed(2),
          margin_used: +(num(existing.margin_used) + addedMargin).toFixed(2),
          note: note || existing.note || "",
          updated_at: now(),
        });
        updatedAccount.used_margin = +(
          num(updatedAccount.used_margin) + addedMargin
        ).toFixed(2);
        updatedAccount.available_margin = Math.max(
          0,
          +(
            num(updatedAccount.balance) - num(updatedAccount.used_margin)
          ).toFixed(2),
        );
      } else {
        const closeQty = Math.min(Math.abs(existing.qty), Math.abs(signedQty));
        const isLong = existing.qty > 0;
        const pnl = +(
          (isLong ? execPrice - existing.avg : existing.avg - execPrice) *
          closeQty
        ).toFixed(2);
        const entryNote = str(existing.note).trim();
        const combinedNote =
          entryNote && note && entryNote !== note
            ? `${entryNote} · Exit: ${note}`
            : note || entryNote || "";
        const tradeDoc = {
          id: `TRD-${Date.now().toString().slice(-6)}-${uuid().slice(0, 4).toUpperCase()}`,
          user_id: user.id,
          account_id: account.id,
          symbol: inst.symbol,
          exchange: inst.exchange,
          side: isLong ? "BUY" : "SELL",
          entry: existing.avg,
          exit: +execPrice.toFixed(2),
          qty: closeQty,
          pnl,
          note: combinedNote,
          in: existing.created_at,
          out: now(),
          created_at: now(),
        };
        await db.put("virtual_trades", tradeDoc);
        const remainQty = existing.qty + signedQty;
        const releasedMargin =
          (num(existing.margin_used) * closeQty) /
          Math.max(1, Math.abs(existing.qty));
        if (remainQty === 0) {
          await db.del("virtual_positions", existing.id);
        } else {
          await db.put("virtual_positions", {
            ...existing,
            qty: remainQty,
            avg:
              Math.sign(remainQty) === Math.sign(existing.qty)
                ? existing.avg
                : +execPrice.toFixed(2),
            margin_used: Math.max(
              0,
              +(num(existing.margin_used) - releasedMargin).toFixed(2),
            ),
            note: note || existing.note || "",
            updated_at: now(),
          });
        }
        updatedAccount.balance = +(num(updatedAccount.balance) + pnl).toFixed(
          2,
        );
        updatedAccount.realized_pnl = +(
          num(updatedAccount.realized_pnl) + pnl
        ).toFixed(2);
        updatedAccount.used_margin = Math.max(
          0,
          +(num(updatedAccount.used_margin) - releasedMargin).toFixed(2),
        );
        updatedAccount.available_margin = Math.max(
          0,
          +(updatedAccount.balance - updatedAccount.used_margin).toFixed(2),
        );
      }
      updatedAccount.updated_at = now();
      await db.put("trader_accounts", updatedAccount);
      const postCheck = await evaluateAccountRisk({
        db,
        account: updatedAccount,
        quoteMap: { [inst.symbol]: liveQuote },
        origin: url.origin,
        appendEmailLog,
      });
      if (postCheck.account) updatedAccount = postCheck.account;
    }
    return json({ order: orderDoc, account: updatedAccount });
  }
  if ((p = is("POST", "/me/positions/:id/close"))) {
    const user = await currentUser();
    const b = await body().catch(() => ({}));
    const exitNote = str(b.note).trim().slice(0, 500);
    const pos = await db.get("virtual_positions", p.id);
    if (!pos || pos.user_id !== user.id || pos.qty === 0)
      fail(404, "Open position not found");
    const accounts = await ensureTraderAccounts(user);
    const account =
      accounts.find((a) => a.id === pos.account_id) ||
      (await db.get("trader_accounts", pos.account_id));
    if (!account) {
      fail(403, "Purchase a plan first to manage positions.", {
        code: "NO_ACTIVE_ACCOUNT",
      });
    }
    const { getQuotes } = await import("./market-data");
    const qRes = await getQuotes([pos.symbol]);
    const ltp = qRes.quotes[0]?.ltp;
    if (!ltp)
      fail(
        503,
        "A verified market price is unavailable. Please try again later.",
      );
    const isLong = pos.qty > 0;
    const closeQty = Math.abs(pos.qty);
    const pnl = +((isLong ? ltp - pos.avg : pos.avg - ltp) * closeQty).toFixed(
      2,
    );
    const entryNote = str(pos.note).trim();
    const combinedNote =
      entryNote && exitNote && entryNote !== exitNote
        ? `${entryNote} · Exit: ${exitNote}`
        : exitNote || entryNote || "";
    const orderDoc = {
      id: `ORD-${Date.now().toString().slice(-6)}-${uuid().slice(0, 4).toUpperCase()}`,
      user_id: user.id,
      account_id: account.id,
      symbol: pos.symbol,
      exchange: pos.exchange || "NSE",
      side: isLong ? "SELL" : "BUY",
      qty: closeQty,
      type: "MARKET",
      price: +ltp.toFixed(2),
      note: exitNote || entryNote || "",
      date: now(),
      status: "Executed",
      created_at: now(),
    };
    const tradeDoc = {
      id: `TRD-${Date.now().toString().slice(-6)}-${uuid().slice(0, 4).toUpperCase()}`,
      user_id: user.id,
      account_id: account.id,
      symbol: pos.symbol,
      exchange: pos.exchange || "NSE",
      side: isLong ? "BUY" : "SELL",
      entry: pos.avg,
      exit: +ltp.toFixed(2),
      qty: closeQty,
      pnl,
      note: combinedNote,
      in: pos.created_at,
      out: now(),
      created_at: now(),
    };
    await db.put("virtual_orders", orderDoc);
    await db.put("virtual_trades", tradeDoc);
    await db.del("virtual_positions", pos.id);
    const nextBalance = +(num(account.balance) + pnl).toFixed(2);
    const nextUsed = Math.max(
      0,
      +(num(account.used_margin) - num(pos.margin_used)).toFixed(2),
    );
    let updatedAccount = {
      ...account,
      balance: nextBalance,
      realized_pnl: +(num(account.realized_pnl) + pnl).toFixed(2),
      used_margin: nextUsed,
      available_margin: Math.max(0, +(nextBalance - nextUsed).toFixed(2)),
      updated_at: now(),
    };
    await db.put("trader_accounts", updatedAccount);
    const postCheck = await evaluateAccountRisk({
      db,
      account: updatedAccount,
      origin: url.origin,
      appendEmailLog,
    });
    if (postCheck.account) updatedAccount = postCheck.account;
    return json({ trade: tradeDoc, account: updatedAccount });
  }
  if (is("POST", "/me/positions/close-all")) {
    const user = await currentUser();
    const b = await body().catch(() => ({}));
    const accounts = await ensureTraderAccounts(user);
    const account =
      accounts.find((a) => a.id === str(b.account_id)) || accounts[0] || null;
    if (!account)
      fail(403, "Purchase a plan first to manage positions.", {
        code: "NO_ACTIVE_ACCOUNT",
      });
    const openPositions = (await db.all("virtual_positions")).filter(
      (pos) =>
        pos.user_id === user.id &&
        pos.account_id === account.id &&
        pos.qty !== 0,
    );
    if (!openPositions.length) return json({ closed: 0, account });
    const { getQuotes } = await import("./market-data");
    const qRes = await getQuotes(
      Array.from(new Set(openPositions.map((p) => p.symbol))),
    );
    const qMap = Object.fromEntries(
      (qRes.quotes || []).map((q) => [q.symbol, q]),
    );
    if (openPositions.some((pos) => !qMap[pos.symbol]?.ltp))
      fail(
        503,
        "A verified market price is unavailable for one or more positions. Please try again later.",
      );
    let totalPnl = 0;
    let releasedMargin = 0;
    for (const pos of openPositions) {
      const ltp = qMap[pos.symbol].ltp;
      const isLong = pos.qty > 0;
      const closeQty = Math.abs(pos.qty);
      const pnl = +(
        (isLong ? ltp - pos.avg : pos.avg - ltp) * closeQty
      ).toFixed(2);
      totalPnl += pnl;
      releasedMargin += num(pos.margin_used);
      await db.put("virtual_orders", {
        id: `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`,
        user_id: user.id,
        account_id: account.id,
        symbol: pos.symbol,
        exchange: pos.exchange || "NSE",
        side: isLong ? "SELL" : "BUY",
        qty: closeQty,
        type: "MARKET",
        product: pos.product || "MIS",
        price: +ltp.toFixed(2),
        note: "Square off all",
        date: now(),
        status: "Executed",
        created_at: now(),
      });
      await db.put("virtual_trades", {
        id: `TRD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`,
        user_id: user.id,
        account_id: account.id,
        symbol: pos.symbol,
        exchange: pos.exchange || "NSE",
        side: isLong ? "BUY" : "SELL",
        entry: pos.avg,
        exit: +ltp.toFixed(2),
        qty: closeQty,
        pnl,
        note: pos.note || "Square off all",
        in: pos.created_at,
        out: now(),
        created_at: now(),
      });
      await db.del("virtual_positions", pos.id);
    }
    const nextBalance = +(num(account.balance) + totalPnl).toFixed(2);
    const nextUsed = Math.max(
      0,
      +(num(account.used_margin) - releasedMargin).toFixed(2),
    );
    let updatedAccount = {
      ...account,
      balance: nextBalance,
      realized_pnl: +(num(account.realized_pnl) + totalPnl).toFixed(2),
      used_margin: nextUsed,
      available_margin: Math.max(0, +(nextBalance - nextUsed).toFixed(2)),
      updated_at: now(),
    };
    await db.put("trader_accounts", updatedAccount);
    const postCheck = await evaluateAccountRisk({
      db,
      account: updatedAccount,
      quoteMap: qMap,
      origin: url.origin,
      appendEmailLog,
    });
    if (postCheck.account) updatedAccount = postCheck.account;
    return json({
      closed: openPositions.length,
      total_pnl: +totalPnl.toFixed(2),
      account: updatedAccount,
    });
  }
  if ((p = is("POST", "/me/orders/:id/cancel"))) {
    const user = await currentUser();
    const doc = await db.get("virtual_orders", p.id);
    if (!doc || doc.user_id !== user.id) fail(404, "Order not found");
    if (doc.status !== "Pending")
      fail(400, "Only pending orders can be cancelled");
    const updated = { ...doc, status: "Cancelled", updated_at: now() };
    await db.put("virtual_orders", updated);
    return json(updated);
  }
  if ((p = is("PATCH", "/me/trades/:id"))) {
    const user = await currentUser();
    const doc = await db.get("virtual_trades", p.id);
    if (!doc || doc.user_id !== user.id) fail(404, "Trade not found");
    const b = await body();
    const updated = { ...doc, note: str(b.note).trim().slice(0, 500) };
    await db.put("virtual_trades", updated);
    return json(updated);
  }
  if ((p = is("PATCH", "/me/orders/:id"))) {
    const user = await currentUser();
    const doc = await db.get("virtual_orders", p.id);
    if (!doc || doc.user_id !== user.id) fail(404, "Order not found");
    const b = await body();
    const updated = { ...doc, note: str(b.note).trim().slice(0, 500) };
    await db.put("virtual_orders", updated);
    return json(updated);
  }
  if (is("GET", "/me/referrals")) {
    const user = await currentUser();
    const email = str(user.email).toLowerCase();
    const existing = await db.findOne(
      "referrals",
      (x) => str(x.email).toLowerCase() === email,
    );
    if (!existing) return json(null);
    return json({
      id: existing.id,
      code: existing.code,
      name: existing.name,
      referrals_count: existing.referrals_count || 0,
      earnings: existing.earnings || 0,
      created_at: existing.created_at,
    });
  }
  if (is("GET", "/me/notifications")) {
    const user = await currentUser();
    const list = (await db.all("user_notifications"))
      .filter((n) => n.user_id === user.id)
      .sort(byDesc("created_at"));
    return json(list);
  }
  if (is("POST", "/me/notifications/read")) {
    const user = await currentUser();
    const b = await body().catch(() => ({}));
    const list = (await db.all("user_notifications")).filter(
      (n) => n.user_id === user.id,
    );
    for (const n of list) {
      if (!b.id || n.id === str(b.id)) {
        if (!n.read) await db.put("user_notifications", { ...n, read: true });
      }
    }
    return json({ ok: true });
  }
  if (is("GET", "/me/tickets")) {
    const user = await currentUser();
    const email = str(user.email).toLowerCase();
    const list = (await db.all("support_tickets"))
      .filter(
        (t) =>
          t.user_id === user.id || str(t.user_email).toLowerCase() === email,
      )
      .sort(byDesc("created_at"));
    return json(list);
  }
  if (is("POST", "/me/tickets")) {
    const user = await currentUser();
    const b = await body();
    const subject = str(b.subject).trim().slice(0, 120);
    const message = str(b.message).trim().slice(0, 2000);
    const category = str(b.category).trim().slice(0, 40) || "Account";
    if (subject.length < 4 || message.length < 10) {
      fail(
        400,
        "Please add a subject (min 4 chars) and description (min 10 chars).",
      );
    }
    const ticket = {
      id: `TK-${Date.now().toString().slice(-6)}`,
      user_id: user.id,
      user_email: user.email,
      user_name: user.name || "",
      user_phone: str(b.phone || user.phone)
        .trim()
        .slice(0, 50),
      source: "dashboard",
      category,
      subject,
      message,
      admin_note: "",
      status: "Pending",
      date: now().slice(0, 10),
      created_at: now(),
    };
    await db.put("support_tickets", ticket);
    return json(ticket);
  }
  // Public support ticket generation from Contact page (works for guests & signed-in users)
  if (is("POST", "/tickets")) {
    const b = await body();
    const name = str(b.name || `${str(b.first_name)} ${str(b.last_name)}`)
      .trim()
      .slice(0, 120);
    const email = requireEmail(b.email, "email");
    const phone = str(b.phone).trim().slice(0, 50);
    const category = str(b.category).trim().slice(0, 40) || "General";
    const subject = str(b.subject).trim().slice(0, 120);
    const message = str(b.message).trim().slice(0, 2000);
    if (!name) fail(422, "Your name is required.");
    if (subject.length < 3 || message.length < 5) {
      fail(
        422,
        "Please add a subject (min 3 chars) and message (min 5 chars).",
      );
    }
    const maybeUser = await currentUser().catch(() => null);
    const ticket = {
      id: `TK-${Date.now().toString().slice(-6)}`,
      user_id: maybeUser?.id || null,
      user_email: email,
      user_name: name,
      user_phone: phone,
      city: str(b.city).trim().slice(0, 120),
      challenge_type: str(b.challenge_type).trim().slice(0, 120),
      source: str(b.source || "contact").slice(0, 40),
      category,
      subject,
      message,
      admin_note: "",
      status: "Pending",
      date: now().slice(0, 10),
      created_at: now(),
    };
    await db.put("support_tickets", ticket);
    return json(ticket);
  }
  if (is("GET", "/admin/tickets")) {
    await currentAdmin();
    return json((await db.all("support_tickets")).sort(byDesc("created_at")));
  }
  if ((p = is("PATCH", "/admin/tickets/:id"))) {
    await currentAdmin();
    const old = await db.get("support_tickets", p.id);
    if (!old) fail(404, "Ticket not found");
    const b = await body();
    const allowed = ["Pending", "In Review", "Resolved", "Closed"];
    const nextStatus = b.status != null ? str(b.status) : old.status;
    if (!allowed.includes(nextStatus)) fail(400, "Invalid ticket status");
    const updated = {
      ...old,
      status: nextStatus,
      admin_note:
        b.admin_note != null
          ? str(b.admin_note).trim().slice(0, 1000)
          : old.admin_note || "",
      updated_at: now(),
    };
    await db.put("support_tickets", updated);
    return json(updated);
  }
  if ((p = is("DELETE", "/admin/tickets/:id"))) {
    await currentAdmin();
    await db.del("support_tickets", p.id);
    return json({ ok: true });
  }
  if (is("GET", "/me/payouts")) {
    const user = await currentUser();
    const payouts = await myPayouts(user.email.toLowerCase());
    const accounts = await ensureTraderAccounts(user);
    const allTrades = await db.all("virtual_trades");
    const er = await getEvalRiskSettings();
    let eligibleTotal = 0;
    const perAccount = [];
    for (const a of accounts) {
      if (a.status === "Funded" || a.account_type === "Funded") {
        const acctTrades = allTrades.filter((t) => t.account_id === a.id);
        const snap = computeAccountRiskSnapshot({
          account: a,
          trades: acctTrades,
          evaluationRisk: er,
        });
        eligibleTotal += snap.withdrawable_profit;
        perAccount.push({
          account_id: a.id,
          account_number: a.account_number,
          plan_name: a.plan_name,
          product_type: snap.product_type,
          payout_cycle: snap.payout_cycle,
          profit_split: snap.profit_split,
          buffer_amount: snap.buffer_amount,
          buffer_satisfied: snap.buffer_satisfied,
          withdrawable_profit: snap.withdrawable_profit,
          payout_eligible: snap.payout_eligible,
        });
      }
    }
    return json({
      eligible: +eligibleTotal.toFixed(2),
      pending_amount: payouts
        .filter((x) => ["pending", "approved"].includes(x.status))
        .reduce((s, x) => s + num(x.amount), 0),
      total_paid: payouts
        .filter((x) => x.status === "paid")
        .reduce((s, x) => s + num(x.amount), 0),
      history: payouts,
      accounts: perAccount,
    });
  }
  // ----- AI performance insights from the trader's own history -----
  if (is("GET", "/me/insights")) {
    const user = await currentUser();
    return json(
      (await db.all("insights"))
        .filter((x) => x.user_id === user.id)
        .sort(byDesc("created_at"))
        .slice(0, 20),
    );
  }
  if (is("POST", "/me/insights")) {
    const user = await currentUser();
    const b = await body();
    const { generateTradeInsights, InsightsError, MAX_HISTORY_CHARS } =
      await import("./insights");
    const history = str(b.history).trim();
    const notes = str(b.notes).slice(0, 1000);
    if (history.length < 20)
      fail(400, "Please paste or upload your trading history first.");
    if (history.length > MAX_HISTORY_CHARS)
      fail(
        400,
        `Trading history is too long. Keep it under ${MAX_HISTORY_CHARS.toLocaleString("en-IN")} characters.`,
      );
    const recent = await myOrders(user.email.toLowerCase());
    const plan = recent[0]?.plan_id
      ? await db.get("plans", str(recent[0].plan_id))
      : null;
    let result;
    try {
      result = await generateTradeInsights({ history, notes, rules: plan });
    } catch (e) {
      if (e instanceof InsightsError) fail(e.status, e.message);
      throw e;
    }
    const doc = {
      id: uuid(),
      user_id: user.id,
      plan_name: plan?.name || null,
      history_chars: history.length,
      notes,
      ...result,
      created_at: now(),
    };
    await db.put("insights", doc);
    return json(doc);
  }
  if ((p = is("DELETE", "/me/insights/:id"))) {
    const user = await currentUser();
    const doc = await db.get("insights", p.id);
    if (!doc || doc.user_id !== user.id) fail(404, "Not found");
    await db.del("insights", p.id);
    return json({ ok: true });
  }
  // ----- Manual Trading Journal (CRUD + chart screenshot uploads) -----
  const normalizeJournalTags = (raw) => {
    const arr = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? raw.split(",")
        : [];
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      const clean = str(item).trim().replace(/\s+/g, " ").slice(0, 32);
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(clean);
      if (out.length >= 12) break;
    }
    return out;
  };
  const saveJournalScreenshot = async (dataUrl, filename, userId) => {
    const m = str(dataUrl).match(
      /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i,
    );
    if (!m)
      fail(
        400,
        "Unsupported screenshot format. Upload a PNG, JPEG, or WebP image.",
      );
    const rawMime = m[1].toLowerCase();
    const contentType = rawMime === "image/jpg" ? "image/jpeg" : rawMime;
    const base64Data = m[2];
    if (base64Data.length > 5.6 * 1024 * 1024) {
      fail(413, "Screenshot is too large. Keep chart images under 4 MB.");
    }
    const ext =
      contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "jpg";
    const id = `jrnlimg_${uuid().replace(/-/g, "").slice(0, 14)}`;
    const asset = {
      id,
      ext,
      filename: str(filename).slice(0, 120) || `${id}.${ext}`,
      content_type: contentType,
      data_base64: base64Data,
      size: Math.floor((base64Data.length * 3) / 4),
      user_id: userId,
      kind: "journal_screenshot",
      created_at: now(),
    };
    await db.put("media_assets", asset);
    return {
      id,
      url: `/api/media/${id}.${ext}`,
      content_type: contentType,
      size: asset.size,
    };
  };
  const extractJournalMediaId = (screenshotUrl) => {
    const m = str(screenshotUrl).match(
      /^\/api\/media\/(jrnlimg_[a-zA-Z0-9_-]+)\.(?:png|jpg|jpeg|webp)$/i,
    );
    return m ? m[1] : "";
  };
  const cleanupJournalAssetIfUnused = async (
    assetId,
    userId,
    skipEntryId = "",
  ) => {
    if (!assetId) return;
    const asset = await db.get("media_assets", assetId);
    if (
      !asset ||
      asset.kind !== "journal_screenshot" ||
      asset.user_id !== userId
    )
      return;
    const stillUsed = (await db.all("journal_entries")).some(
      (e) =>
        e.user_id === userId &&
        e.id !== skipEntryId &&
        (e.screenshot_asset_id === assetId ||
          extractJournalMediaId(e.screenshot_url) === assetId),
    );
    if (!stillUsed) await db.del("media_assets", assetId);
  };
  const normalizeJournalFields = async (b, userId, prev = null) => {
    const symbol = (b.symbol !== undefined ? str(b.symbol) : str(prev?.symbol))
      .trim()
      .toUpperCase()
      .slice(0, 48);
    if (!symbol) fail(422, "Instrument symbol is required.");
    const rawSide = (
      b.side !== undefined ? str(b.side) : str(prev?.side || "BUY")
    )
      .trim()
      .toUpperCase();
    if (rawSide !== "BUY" && rawSide !== "SELL") {
      fail(422, "Trade side must be BUY or SELL.");
    }
    const rawEntry =
      b.entry_price !== undefined ? b.entry_price : prev?.entry_price;
    const entryPrice = num(rawEntry, NaN);
    if (!Number.isFinite(entryPrice) || entryPrice < 0) {
      fail(422, "Valid entry price is required.");
    }
    const rawExitVal =
      b.exit_price !== undefined ? b.exit_price : prev?.exit_price;
    const hasExit =
      rawExitVal !== null && rawExitVal !== undefined && rawExitVal !== "";
    const exitPrice = hasExit ? num(rawExitVal, NaN) : null;
    if (hasExit && (!Number.isFinite(exitPrice) || exitPrice < 0)) {
      fail(422, "Exit price must be a valid non-negative number.");
    }
    const rawQty = b.qty !== undefined ? b.qty : (prev?.qty ?? 1);
    const qty = num(rawQty, NaN);
    if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000) {
      fail(422, "Quantity must be between 0 and 1,000,000.");
    }
    let pnlVal;
    if (b.pnl !== undefined && b.pnl !== null && b.pnl !== "") {
      pnlVal = num(b.pnl, NaN);
      if (!Number.isFinite(pnlVal)) fail(422, "P&L must be a valid number.");
    } else if (
      prev &&
      b.entry_price === undefined &&
      b.exit_price === undefined &&
      b.qty === undefined &&
      b.side === undefined
    ) {
      pnlVal = num(prev.pnl, 0);
    } else if (exitPrice !== null && qty > 0) {
      pnlVal = +(
        (rawSide === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice) *
        qty
      ).toFixed(2);
    } else {
      pnlVal = num(prev?.pnl, 0);
    }
    const rawDate = (
      b.trade_date !== undefined
        ? str(b.trade_date)
        : str(prev?.trade_date || now().slice(0, 10))
    )
      .trim()
      .slice(0, 32);
    const tradeDate = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
      ? rawDate
      : now().slice(0, 10);
    const timeframe = (
      b.timeframe !== undefined ? str(b.timeframe) : str(prev?.timeframe || "")
    )
      .trim()
      .slice(0, 24);
    const setup = (
      b.setup !== undefined ? str(b.setup) : str(prev?.setup || "")
    )
      .trim()
      .slice(0, 80);
    const emotions = (
      b.emotions !== undefined ? str(b.emotions) : str(prev?.emotions || "")
    )
      .trim()
      .slice(0, 40);
    const notes = (
      b.notes !== undefined ? str(b.notes) : str(prev?.notes || "")
    )
      .trim()
      .slice(0, 5000);
    const rawRating =
      b.rating !== undefined ? int(b.rating, 0) : int(prev?.rating, 0);
    const rating = rawRating >= 1 && rawRating <= 5 ? rawRating : 0;
    const accountId = (
      b.account_id !== undefined
        ? str(b.account_id)
        : str(prev?.account_id || "")
    )
      .trim()
      .slice(0, 80);
    const accountLabel = (
      b.account_label !== undefined
        ? str(b.account_label)
        : str(prev?.account_label || "")
    )
      .trim()
      .slice(0, 100);
    const strategyTags =
      b.strategy_tags !== undefined
        ? normalizeJournalTags(b.strategy_tags)
        : normalizeJournalTags(prev?.strategy_tags || []);

    let screenshotUrl = prev?.screenshot_url || "";
    let screenshotAssetId = prev?.screenshot_asset_id || "";
    if (b.screenshot_url !== undefined) {
      const candidate = str(b.screenshot_url).trim();
      if (!candidate) {
        screenshotUrl = "";
        screenshotAssetId = "";
      } else if (candidate.startsWith("data:image/")) {
        const saved = await saveJournalScreenshot(
          candidate,
          b.screenshot_filename || `${symbol}.png`,
          userId,
        );
        screenshotUrl = saved.url;
        screenshotAssetId = saved.id;
      } else if (
        /^\/api\/media\/[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp)$/i.test(
          candidate,
        ) ||
        /^https?:\/\/\S+$/i.test(candidate)
      ) {
        if (candidate.length > 500) fail(422, "Screenshot URL is too long.");
        screenshotUrl = candidate;
        screenshotAssetId = extractJournalMediaId(candidate);
      } else {
        fail(
          422,
          "Screenshot must be an uploaded chart image or valid HTTP(S) URL.",
        );
      }
    }

    return {
      symbol,
      side: rawSide,
      entry_price: +entryPrice.toFixed(2),
      exit_price: exitPrice !== null ? +exitPrice.toFixed(2) : null,
      qty: +qty.toFixed(4),
      pnl: +pnlVal.toFixed(2),
      trade_date: tradeDate,
      timeframe,
      setup,
      emotions,
      rating,
      account_id: accountId,
      account_label: accountLabel,
      notes,
      strategy_tags: strategyTags,
      screenshot_url: screenshotUrl,
      screenshot_asset_id: screenshotAssetId,
    };
  };

  if (is("GET", "/me/journal")) {
    const user = await currentUser();
    const list = (await db.all("journal_entries"))
      .filter((entry) => entry.user_id === user.id)
      .sort(
        (a, b) =>
          str(b.trade_date).localeCompare(str(a.trade_date)) ||
          str(b.created_at).localeCompare(str(a.created_at)),
      );
    return json(list);
  }
  if (is("POST", "/me/journal/screenshot")) {
    const user = await currentUser();
    const b = await body();
    const saved = await saveJournalScreenshot(b.data_url, b.filename, user.id);
    return json(saved);
  }
  if (is("POST", "/me/journal")) {
    const user = await currentUser();
    const b = await body();
    const fields = await normalizeJournalFields(b, user.id, null);
    const ts = now();
    const doc = {
      id: `jrnl_${uuid().replace(/-/g, "").slice(0, 14)}`,
      user_id: user.id,
      ...fields,
      created_at: ts,
      updated_at: ts,
    };
    await db.put("journal_entries", doc);
    return json(doc);
  }
  if (
    (p = is("PUT", "/me/journal/:id")) ||
    (p = is("PATCH", "/me/journal/:id"))
  ) {
    const user = await currentUser();
    const old = await db.get("journal_entries", p.id);
    if (!old || old.user_id !== user.id) fail(404, "Journal entry not found");
    const b = await body();
    const fields = await normalizeJournalFields(b, user.id, old);
    const updated = {
      ...old,
      ...fields,
      id: old.id,
      user_id: old.user_id,
      created_at: old.created_at,
      updated_at: now(),
    };
    await db.put("journal_entries", updated);
    const oldAssetId =
      old.screenshot_asset_id || extractJournalMediaId(old.screenshot_url);
    if (oldAssetId && oldAssetId !== updated.screenshot_asset_id) {
      await cleanupJournalAssetIfUnused(oldAssetId, user.id, updated.id);
    }
    return json(updated);
  }
  if ((p = is("DELETE", "/me/journal/:id"))) {
    const user = await currentUser();
    const old = await db.get("journal_entries", p.id);
    if (!old || old.user_id !== user.id) fail(404, "Journal entry not found");
    await db.del("journal_entries", p.id);
    const oldAssetId =
      old.screenshot_asset_id || extractJournalMediaId(old.screenshot_url);
    if (oldAssetId) {
      await cleanupJournalAssetIfUnused(oldAssetId, user.id, old.id);
    }
    return json({ ok: true, id: p.id });
  }
  if (is("GET", "/me/certificates")) {
    const user = await currentUser();
    const email = user.email.toLowerCase();
    return json(
      (await db.all("certificates")).filter(
        (c) => str(c.trader_email).toLowerCase() === email && c.visible,
      ),
    );
  }
  if (is("GET", "/me/billing")) {
    const user = await currentUser();
    const email = user.email.toLowerCase();
    const orders = await myOrders(email);
    const league = (await db.all("league_registrations")).filter(
      (r) => str(r.email).toLowerCase() === email,
    );
    const items = [
      ...orders.map((o) => ({
        id: o.id,
        kind: "challenge",
        product: o.plan_name || "Challenge",
        amount: o.amount || 0,
        status: o.status || "pending_payment",
        created_at: o.created_at || "",
      })),
      ...league.map((r) => ({
        id: r.id,
        kind: "league",
        product:
          "Trader League" + (r.is_existing_trader ? " (existing)" : " (new)"),
        amount: r.amount || 0,
        status: r.status || "pending_payment",
        created_at: r.created_at || "",
      })),
    ].sort(byDesc("created_at"));
    return json(items);
  }
  if (is("PUT", "/me/profile")) {
    const user = await currentUser();
    const b = await body();
    const updates = {};
    if (typeof b.name === "string" && b.name.trim())
      updates.name = b.name.trim();
    if (typeof b.phone === "string") updates.phone = b.phone.trim();
    if (!Object.keys(updates).length) fail(400, "Nothing to update");
    const { role, ...profile } = user;
    const next = { ...profile, ...updates };
    await db.put("users", next);
    return json({ ...next, role });
  }
  if (is("POST", "/me/password")) {
    const user = await currentUser();
    if (user.role === "admin")
      fail(400, "Admin password cannot be changed from trader settings");
    const b = await body();
    const newPassword = str(b.password);
    if (newPassword.length < 6)
      fail(400, "Password must be at least 6 characters");
    if (sb) {
      const { error } = await sb.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });
      if (error) fail(400, error.message);
    } else {
      await db.put("local_credentials", {
        id: user.id,
        email: str(user.email).toLowerCase(),
        password_hash: hashLocalPassword(newPassword),
        created_at: user.created_at || now(),
        updated_at: now(),
      });
    }
    const { role, ...profile } = user;
    const updatedUser = {
      ...profile,
      login_password: newPassword,
      auth_provider: profile.auth_provider || "email",
      updated_at: now(),
    };
    await db.put("users", updatedUser);
    return json({ ok: true });
  }
  if (is("PUT", "/me/kyc")) {
    const user = await currentUser();
    const b = await body();
    const kyc = {
      full_name: str(b.full_name).trim(),
      aadhaar: str(b.aadhaar).trim(),
      pan: str(b.pan).trim().toUpperCase(),
      upi_id: str(b.upi_id).trim(),
      bank_account_number: str(b.bank_account_number).trim(),
      ifsc: str(b.ifsc).trim().toUpperCase(),
      submitted_at: now(),
      status: "submitted",
    };
    if (!kyc.full_name || !kyc.pan) fail(400, "Full name and PAN are required");
    const { role, ...profile } = user;
    await db.put("users", { ...profile, kyc });
    return json(kyc);
  }

  // ===== Admin users, accounts, KYC & fund management =====
  if (is("GET", "/admin/users")) {
    await currentAdmin();
    let adminIds = new Set();
    if (sb) {
      const { data: admins } = await sb
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      adminIds = new Set((admins || []).map((a) => a.user_id));
    }
    const [users, allAccounts, allTx, allOrders] = await Promise.all([
      db.all("users"),
      db.all("trader_accounts"),
      db.all("fund_transactions"),
      db.all("orders"),
    ]);
    const er = await getEvalRiskSettings();
    const enriched = users
      .filter((u) => !adminIds.has(u.id))
      .sort(byDesc("created_at"))
      .map((u) => {
        const email = str(u.email).toLowerCase();
        const accts = allAccounts
          .filter(
            (a) =>
              a.user_id === u.id || str(a.user_email).toLowerCase() === email,
          )
          .map((a) => mergeAccountWithRules(a, er));
        const tx = allTx.filter(
          (t) =>
            t.user_id === u.id || str(t.user_email).toLowerCase() === email,
        );
        const userOrders = allOrders.filter(
          (o) => str(o.customer_email).toLowerCase() === email,
        );
        const authProvider =
          u.auth_provider || (u.firebase_uid ? "google" : "email");
        return {
          ...u,
          username: u.email || "",
          login_password: u.login_password || "",
          auth_provider: authProvider,
          accounts: accts,
          orders_count: userOrders.length,
          completed_orders_count: userOrders.filter(
            (o) => o.status === "completed",
          ).length,
          total_balance: accts.reduce((s, a) => s + num(a.balance), 0),
          total_capital: accts.reduce((s, a) => s + num(a.starting_capital), 0),
          total_realized_pnl: accts.reduce(
            (s, a) => s + num(a.realized_pnl),
            0,
          ),
          funded_accounts_count: accts.filter((a) => a.status === "Funded")
            .length,
          transactions_count: tx.length,
        };
      });
    return json(enriched);
  }
  if (is("GET", "/admin/accounts")) {
    await currentAdmin();
    const [users, accounts, positions] = await Promise.all([
      db.all("users"),
      db.all("trader_accounts"),
      db.all("virtual_positions"),
    ]);
    const er = await getEvalRiskSettings();
    const byId = new Map(users.map((u) => [u.id, u]));
    const byEmail = new Map(users.map((u) => [str(u.email).toLowerCase(), u]));
    const enriched = accounts.sort(byDesc("updated_at")).map((a) => {
      const owner =
        byId.get(a.user_id) || byEmail.get(str(a.user_email).toLowerCase());
      const openPosCount = positions.filter(
        (pos) => pos.account_id === a.id && pos.qty !== 0,
      ).length;
      return {
        ...mergeAccountWithRules(a, er),
        user_name: owner?.name || "",
        user_phone: owner?.phone || "",
        kyc_status:
          owner?.kyc?.status ||
          (owner?.kyc?.submitted_at ? "submitted" : "pending"),
        open_positions_count: openPosCount,
      };
    });
    return json(enriched);
  }
  if ((p = is("GET", "/admin/users/:id/ledger"))) {
    await currentAdmin();
    const trader = await db.get("users", p.id);
    if (!trader) fail(404, "Trader not found");
    const email = str(trader.email).toLowerCase();
    const er = await getEvalRiskSettings();
    const [allAccts, allTx, allOrders, allVOrders, allVPos, allVTrades] =
      await Promise.all([
        db.all("trader_accounts"),
        db.all("fund_transactions"),
        db.all("orders"),
        db.all("virtual_orders"),
        db.all("virtual_positions"),
        db.all("virtual_trades"),
      ]);
    const accounts = allAccts
      .filter(
        (a) =>
          a.user_id === trader.id || str(a.user_email).toLowerCase() === email,
      )
      .map((a) => mergeAccountWithRules(a, er))
      .sort(byDesc("created_at"));
    const acctIds = new Set(accounts.map((a) => a.id));
    const transactions = allTx
      .filter(
        (t) =>
          t.user_id === trader.id || str(t.user_email).toLowerCase() === email,
      )
      .sort(byDesc("created_at"));
    const orders = allOrders
      .filter((o) => str(o.customer_email).toLowerCase() === email)
      .sort(byDesc("created_at"));
    const virtual_orders = allVOrders
      .filter((o) => o.user_id === trader.id || acctIds.has(o.account_id))
      .sort(byDesc("created_at"))
      .slice(0, 60);
    const virtual_positions = allVPos.filter(
      (pos) =>
        (pos.user_id === trader.id || acctIds.has(pos.account_id)) &&
        pos.qty !== 0,
    );
    const virtual_trades = allVTrades
      .filter((t) => t.user_id === trader.id || acctIds.has(t.account_id))
      .sort(byDesc("created_at"))
      .slice(0, 60);
    return json({
      user: trader,
      accounts,
      transactions,
      orders,
      virtual_orders,
      virtual_positions,
      virtual_trades,
    });
  }
  if ((p = is("PATCH", "/admin/users/:id/kyc"))) {
    await currentAdmin();
    const trader = await db.get("users", p.id);
    if (!trader) fail(404, "Trader not found");
    const b = await body();
    const status = str(b.status).toLowerCase();
    if (!["verified", "submitted", "rejected", "pending"].includes(status)) {
      fail(400, "Invalid KYC status");
    }
    const nextKyc = {
      ...(trader.kyc || {}),
      status,
      admin_note:
        b.admin_note != null
          ? str(b.admin_note).trim()
          : trader.kyc?.admin_note || "",
      reviewed_at: now(),
    };
    const updatedUser = { ...trader, kyc: nextKyc };
    await db.put("users", updatedUser);
    await db.put("user_notifications", {
      id: `nt-${uuid().slice(0, 8)}`,
      user_id: trader.id,
      type: "kyc",
      title: `KYC ${status === "verified" ? "Verified" : status === "rejected" ? "Rejected" : "Updated"}`,
      body: nextKyc.admin_note
        ? `Your KYC status is now ${status}. Note: ${nextKyc.admin_note}`
        : `Your KYC verification status has been updated to ${status}.`,
      time: now().slice(0, 10),
      read: false,
      created_at: now(),
    });
    return json({ user: updatedUser, kyc: nextKyc });
  }
  if ((p = is("POST", "/admin/users/:id/funds"))) {
    const admin = await currentAdmin();
    const trader = await db.get("users", p.id);
    if (!trader) fail(404, "Trader not found");
    const b = await body();
    const amount = num(b.amount);
    const kind = str(b.type).toLowerCase() === "debit" ? "debit" : "credit";
    const note =
      str(b.note).trim() ||
      (kind === "credit" ? "Admin fund credit" : "Admin balance adjustment");
    if (!amount || amount <= 0) fail(400, "Amount must be greater than 0");
    const email = str(trader.email).toLowerCase();
    const userAccts = (await db.all("trader_accounts"))
      .filter(
        (a) =>
          a.user_id === trader.id || str(a.user_email).toLowerCase() === email,
      )
      .sort(byDesc("created_at"));
    let target = b.account_id
      ? userAccts.find((a) => a.id === str(b.account_id))
      : userAccts[0];
    if (!target) {
      const er = await getEvalRiskSettings();
      target = mergeAccountWithRules(
        {
          id: `acct-${uuid().slice(0, 8)}`,
          account_number: `IF-WL-${trader.id.slice(0, 4).toUpperCase()}`,
          user_id: trader.id,
          user_email: email,
          plan_name: "Funded Wallet",
          account_type: "Funded",
          starting_capital: 0,
          balance: 0,
          available_margin: 0,
          used_margin: 0,
          realized_pnl: 0,
          profit_split: int(er.profit_split, 70),
          max_loss_limit: num(er.max_loss_limit, 20),
          daily_loss_limit_pct: num(er.daily_loss_limit_pct, 5),
          trades_per_day: int(er.trades_per_day, 5),
          status: "Funded",
          note: "Created via admin fund credit",
          created_at: now(),
          updated_at: now(),
        },
        er,
      );
    }
    const delta = kind === "credit" ? amount : -amount;
    const nextBalance = Math.max(0, +(num(target.balance) + delta).toFixed(2));
    const nextAvail = Math.max(
      0,
      +(nextBalance - num(target.used_margin)).toFixed(2),
    );
    const nextCap =
      kind === "credit"
        ? +(num(target.starting_capital) + amount).toFixed(2)
        : Math.max(0, +(num(target.starting_capital) - amount).toFixed(2));
    const updated = {
      ...target,
      starting_capital: nextCap,
      balance: nextBalance,
      available_margin: nextAvail,
      updated_at: now(),
    };
    await db.put("trader_accounts", updated);
    const tx = {
      id: uuid(),
      user_id: trader.id,
      user_email: email,
      account_id: updated.id,
      account_number: updated.account_number,
      kind,
      amount,
      balance_after: nextBalance,
      note,
      admin_email: admin.email,
      created_at: now(),
    };
    await db.put("fund_transactions", tx);
    await db.put("user_notifications", {
      id: `nt-${uuid().slice(0, 8)}`,
      user_id: trader.id,
      type: kind === "credit" ? "payout" : "risk",
      title: kind === "credit" ? "Funds Credited" : "Balance Adjusted",
      body: `₹${amount.toLocaleString("en-IN")} ${kind === "credit" ? "credited to" : "debited from"} ${updated.account_number}. ${note}`,
      time: now().slice(0, 10),
      read: false,
      created_at: now(),
    });
    return json({ account: updated, transaction: tx });
  }
  if ((p = is("POST", "/admin/users/:id/password"))) {
    await currentAdmin();
    const trader = await db.get("users", p.id);
    if (!trader) fail(404, "Trader not found");
    const b = await body();
    const newPassword = str(b.password);
    if (newPassword.length < 6)
      fail(400, "Password must be at least 6 characters");
    if (sb) {
      const { error } = await sb.auth.admin.updateUserById(trader.id, {
        password: newPassword,
      });
      if (error) fail(400, error.message);
    } else {
      await db.put("local_credentials", {
        id: trader.id,
        email: str(trader.email).toLowerCase(),
        password_hash: hashLocalPassword(newPassword),
        created_at: trader.created_at || now(),
        updated_at: now(),
      });
    }
    const updatedUser = {
      ...trader,
      login_password: newPassword,
      updated_at: now(),
    };
    await db.put("users", updatedUser);
    return json({ ok: true, user: updatedUser });
  }

  const createChallengeAccountForTrader = async ({
    trader,
    b = {},
    admin,
    order = null,
  }) => {
    const er = await getEvalRiskSettings();
    const fpCfg = await getFundingProductsConfig();
    const allPlans = await db.all("plans");
    const selectedPlan = b.plan_id
      ? allPlans.find((pl) => pl.id === str(b.plan_id))
      : null;

    const reqProductType = str(
      b.product_type || order?.product_type || PRODUCT_TYPES.CLASSIC,
    ).trim();
    const pType = [PRODUCT_TYPES.INSTANT, PRODUCT_TYPES.ONE_STEP].includes(
      reqProductType,
    )
      ? reqProductType
      : PRODUCT_TYPES.CLASSIC;

    const email = str(trader.email).toLowerCase();
    const tsNow = now();
    const istDay = getIstDateKey(tsNow);
    const note =
      str(b.note).trim() ||
      (order
        ? `Assigned from Order ${String(order.id).slice(0, 8)} by ${admin.email}`
        : `Assigned by ${admin.email}`);

    let account;
    if (pType === PRODUCT_TYPES.INSTANT) {
      const ddMode =
        str(
          b.drawdown_mode || order?.drawdown_mode || "intraday",
        ).toLowerCase() === "eod"
          ? "eod"
          : "intraday";
      const cycle =
        str(
          b.payout_cycle || order?.payout_cycle || "biweekly",
        ).toLowerCase() === "monthly"
          ? "monthly"
          : "biweekly";
      const cap =
        num(b.starting_capital) ||
        num(b.account_size) ||
        num(order?.plan_account_size) ||
        100000;
      const resolved = resolveFundingProductSelection(fpCfg, {
        product_type: PRODUCT_TYPES.INSTANT,
        account_size: cap,
        drawdown_mode: ddMode,
        payout_cycle: cycle,
      });
      const r = resolved.ok ? resolved.rules : fpCfg.instant_funding;
      const trailingPct = Math.min(
        50,
        Math.max(
          1,
          num(
            b.trailing_drawdown_pct ?? b.max_loss_limit,
            num(r.trailing_drawdown_pct, 5),
          ),
        ),
      );
      const dailyPct = Math.min(
        25,
        Math.max(
          0.5,
          num(b.daily_loss_limit_pct, num(r.daily_loss_limit_pct, 3)),
        ),
      );
      const split = Math.min(
        95,
        Math.max(
          50,
          int(
            b.profit_split,
            int(r.profit_split, cycle === "monthly" ? 90 : 80),
          ),
        ),
      );
      const bufferPct = num(b.buffer_pct, num(r.buffer_pct, 3));
      const planName =
        str(b.plan_name).trim() ||
        (resolved.ok
          ? resolved.plan_name
          : `Instant Funding ₹${cap.toLocaleString("en-IN")} (${ddMode.toUpperCase()})`);
      account = mergeAccountWithRules(
        {
          id: `acct-${uuid().slice(0, 8)}`,
          order_id: order?.id || undefined,
          account_number: `IF-IF-${Math.floor(1000 + Math.random() * 9000)}`,
          user_id: trader.id,
          user_email: email,
          plan_id: resolved.ok
            ? resolved.plan_id
            : str(b.plan_id || order?.plan_id || ""),
          plan_name: planName,
          account_type: "Funded",
          product_type: PRODUCT_TYPES.INSTANT,
          drawdown_mode: ddMode,
          payout_cycle: cycle,
          payout_interval_days: cycle === "monthly" ? 30 : 14,
          starting_capital: cap,
          balance: cap,
          current_equity: cap,
          open_pnl: 0,
          available_margin: cap,
          used_margin: 0,
          realized_pnl: 0,
          daily_starting_balance: cap,
          current_trading_day: istDay,
          daily_loss: 0,
          daily_loss_floor: +(cap * (1 - dailyPct / 100)).toFixed(2),
          overall_drawdown: 0,
          highest_recorded_equity: cap,
          eod_high_watermark: cap,
          intraday_peak_equity: cap,
          trailing_drawdown_floor: +(cap * (1 - trailingPct / 100)).toFixed(2),
          daily_loss_limit_pct: dailyPct,
          trailing_drawdown_pct: trailingPct,
          max_loss_limit: trailingPct,
          buffer_pct: bufferPct,
          buffer_amount: +((cap * bufferPct) / 100).toFixed(2),
          buffer_satisfied: false,
          withdrawable_profit: 0,
          payout_eligible: false,
          profit_target_pct: 0,
          min_trading_days: 0,
          total_trading_days: 0,
          no_time_limit: true,
          trades_per_day:
            b.trades_per_day != null
              ? int(b.trades_per_day)
              : int(r.trades_per_day, 0),
          profit_split: split,
          breach_policy: "close_all_and_fail",
          automation_enabled: true,
          automation_started_at: tsNow,
          assigned_by: admin.email,
          status: "Funded",
          trading_enabled: true,
          note,
          created_at: tsNow,
          updated_at: tsNow,
        },
        er,
      );
    } else if (pType === PRODUCT_TYPES.ONE_STEP) {
      const cap =
        num(b.starting_capital) ||
        num(b.account_size) ||
        num(order?.plan_account_size) ||
        100000;
      const resolved = resolveFundingProductSelection(fpCfg, {
        product_type: PRODUCT_TYPES.ONE_STEP,
        account_size: cap,
      });
      const r = resolved.ok ? resolved.rules : fpCfg.one_step;
      const targetPct = Math.max(
        1,
        num(b.profit_target_pct, num(r.profit_target_pct, 10)),
      );
      const dailyPct = Math.min(
        25,
        Math.max(
          0.5,
          num(b.daily_loss_limit_pct, num(r.daily_loss_limit_pct, 3)),
        ),
      );
      const overallPct = Math.min(
        50,
        Math.max(
          1,
          num(
            b.max_loss_limit ?? b.overall_loss_limit_pct,
            num(r.overall_loss_limit_pct, 6),
          ),
        ),
      );
      const minDays = Math.max(
        0,
        int(b.min_trading_days, int(r.min_trading_days, 3)),
      );
      const split = Math.min(
        95,
        Math.max(50, int(b.profit_split, int(r.profit_split, 80))),
      );
      const accountType =
        str(b.account_type) === "Funded" ? "Funded" : "Challenge";
      const planName =
        str(b.plan_name).trim() ||
        (resolved.ok
          ? resolved.plan_name
          : `1-Step Challenge ₹${cap.toLocaleString("en-IN")}`);
      account = mergeAccountWithRules(
        {
          id: `acct-${uuid().slice(0, 8)}`,
          order_id: order?.id || undefined,
          account_number: `${accountType === "Funded" ? "IF-1F" : "IF-1S"}-${Math.floor(1000 + Math.random() * 9000)}`,
          user_id: trader.id,
          user_email: email,
          plan_id: resolved.ok
            ? resolved.plan_id
            : str(b.plan_id || order?.plan_id || ""),
          plan_name: planName,
          account_type: accountType,
          product_type:
            accountType === "Funded"
              ? PRODUCT_TYPES.ONE_STEP_FUNDED
              : PRODUCT_TYPES.ONE_STEP,
          starting_capital: cap,
          balance: cap,
          current_equity: cap,
          open_pnl: 0,
          available_margin: cap,
          used_margin: 0,
          realized_pnl: 0,
          daily_starting_balance: cap,
          current_trading_day: istDay,
          daily_loss: 0,
          daily_loss_floor: +(cap * (1 - dailyPct / 100)).toFixed(2),
          overall_drawdown: 0,
          highest_recorded_equity: cap,
          eod_high_watermark: cap,
          intraday_peak_equity: cap,
          trailing_drawdown_floor: +(cap * (1 - overallPct / 100)).toFixed(2),
          profit_target_pct: accountType === "Funded" ? 0 : targetPct,
          daily_loss_limit_pct: dailyPct,
          overall_loss_limit_pct: overallPct,
          max_loss_limit: overallPct,
          min_trading_days: accountType === "Funded" ? 0 : minDays,
          total_trading_days: 0,
          no_time_limit: true,
          trades_per_day:
            b.trades_per_day != null
              ? int(b.trades_per_day)
              : int(r.trades_per_day, 0),
          profit_split: split,
          auto_activate_funded:
            b.auto_activate_funded !== undefined
              ? Boolean(b.auto_activate_funded)
              : true,
          breach_policy: "close_all_and_fail",
          automation_enabled: true,
          automation_started_at: tsNow,
          assigned_by: admin.email,
          status: accountType === "Funded" ? "Funded" : "Active",
          trading_enabled: true,
          note,
          created_at: tsNow,
          updated_at: tsNow,
        },
        er,
      );
    } else {
      const cap =
        num(b.starting_capital) ||
        num(b.account_size) ||
        num(selectedPlan?.account_size) ||
        num(order?.plan_account_size);
      if (!cap || cap <= 0) fail(400, "Account capital must be greater than 0");
      const accountType =
        str(b.account_type) === "Funded" ? "Funded" : "Challenge";
      const planName =
        str(b.plan_name).trim() ||
        selectedPlan?.name ||
        order?.plan_name ||
        (accountType === "Funded" ? "IndiFunded Pro" : "IndiFunded Standard");
      const profitSplit = Math.min(
        95,
        Math.max(50, int(b.profit_split, int(er.profit_split, 70))),
      );
      const maxLoss = Math.min(
        50,
        Math.max(1, num(b.max_loss_limit, num(er.max_loss_limit, 20))),
      );
      const dailyLoss = Math.min(
        25,
        Math.max(
          0.5,
          num(b.daily_loss_limit_pct, num(er.daily_loss_limit_pct, 5)),
        ),
      );
      const profitTargetPct = Math.max(
        0,
        num(
          b.profit_target_pct,
          accountType === "Funded" ? 0 : num(er.profit_target_pct, 8),
        ),
      );
      const minDays = Math.max(
        0,
        int(
          b.min_trading_days,
          accountType === "Funded" ? 0 : int(er.min_trading_days, 10),
        ),
      );
      const totalDays = Math.max(
        0,
        int(b.total_trading_days, int(er.total_trading_days, 30)),
      );
      const tradesPerDay = Math.max(
        0,
        int(b.trades_per_day, int(er.trades_per_day, 5)),
      );
      const prefix = accountType === "Funded" ? "IF-FD" : "IF-CH";
      account = mergeAccountWithRules(
        {
          id: `acct-${uuid().slice(0, 8)}`,
          order_id: order?.id || undefined,
          account_number: `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`,
          user_id: trader.id,
          user_email: email,
          plan_id: selectedPlan?.id || str(b.plan_id || order?.plan_id || ""),
          plan_name: planName,
          account_type: accountType,
          product_type: PRODUCT_TYPES.CLASSIC,
          starting_capital: cap,
          balance: cap,
          current_equity: cap,
          open_pnl: 0,
          available_margin: cap,
          used_margin: 0,
          realized_pnl: 0,
          daily_starting_balance: cap,
          current_trading_day: istDay,
          daily_loss: 0,
          daily_loss_floor: +(cap * (1 - dailyLoss / 100)).toFixed(2),
          overall_drawdown: 0,
          trailing_drawdown_floor: +(cap * (1 - maxLoss / 100)).toFixed(2),
          profit_target_pct: profitTargetPct,
          profit_split: profitSplit,
          max_loss_limit: maxLoss,
          daily_loss_limit_pct: dailyLoss,
          min_trading_days: minDays,
          total_trading_days: totalDays,
          trades_per_day: tradesPerDay,
          auto_activate_funded:
            b.auto_activate_funded !== undefined
              ? Boolean(b.auto_activate_funded)
              : true,
          automation_enabled: true,
          automation_started_at: tsNow,
          assigned_by: admin.email,
          status: accountType === "Funded" ? "Funded" : "Active",
          trading_enabled: true,
          note,
          created_at: tsNow,
          updated_at: tsNow,
        },
        er,
      );
    }

    await db.put("trader_accounts", account);
    const evalRes = await evaluateAccountRisk({
      db,
      account,
      origin: url.origin,
      appendEmailLog,
    }).catch(() => ({ account }));
    const savedAccount = evalRes?.account || account;

    const tx = {
      id: uuid(),
      user_id: trader.id,
      user_email: email,
      account_id: savedAccount.id,
      account_number: savedAccount.account_number,
      kind: savedAccount.status === "Funded" ? "funded_allocation" : "credit",
      amount: savedAccount.starting_capital,
      balance_after: savedAccount.balance,
      note: `${savedAccount.plan_name} (${savedAccount.account_type}) — ${note}`,
      admin_email: admin.email,
      created_at: tsNow,
    };
    await db.put("fund_transactions", tx);
    await db.put("risk_events", {
      id: `re-${uuid().slice(0, 8)}`,
      account_id: savedAccount.id,
      account_number: savedAccount.account_number,
      user_id: trader.id,
      user_email: email,
      product_type: getAccountProductType(savedAccount),
      event_type: "CHALLENGE_ASSIGNED",
      title: `Challenge Assigned & Automation Started (${savedAccount.account_number})`,
      detail: `${savedAccount.plan_name} (₹${num(savedAccount.starting_capital).toLocaleString("en-IN")}) assigned by ${admin.email}. Automated rules active.`,
      metrics: {
        starting_capital: savedAccount.starting_capital,
        profit_target_pct: savedAccount.profit_target_pct,
        daily_loss_limit_pct: savedAccount.daily_loss_limit_pct,
        max_loss_limit: savedAccount.max_loss_limit,
        trades_per_day: savedAccount.trades_per_day,
        profit_split: savedAccount.profit_split,
      },
      created_at: tsNow,
    });
    await db.put("user_notifications", {
      id: `nt-${uuid().slice(0, 8)}`,
      user_id: trader.id,
      type: "progress",
      title: `Challenge Assigned: ${savedAccount.account_number}`,
      body: `${savedAccount.plan_name} is now live with ₹${num(savedAccount.starting_capital).toLocaleString("en-IN")} capital. Automated risk rules and tracking are active.`,
      time: tsNow.slice(0, 10),
      read: false,
      created_at: tsNow,
    });
    return { account: savedAccount, transaction: tx };
  };

  if ((p = is("POST", "/admin/users/:id/accounts"))) {
    const admin = await currentAdmin();
    const trader = await db.get("users", p.id);
    if (!trader) fail(404, "Trader not found");
    const b = await body();
    const res = await createChallengeAccountForTrader({ trader, b, admin });
    return json(res);
  }
  if ((p = is("POST", "/admin/orders/:id/assign-challenge"))) {
    const admin = await currentAdmin();
    const order = await db.get("orders", p.id);
    if (!order) fail(404, "Order not found");
    const b = await body().catch(() => ({}));
    const email = str(b.customer_email || order.customer_email)
      .trim()
      .toLowerCase();
    if (!email) fail(400, "Order customer email is missing");

    let trader =
      (order.user_id
        ? await db.get("users", order.user_id).catch(() => null)
        : null) ||
      (await db.findOne(
        "users",
        (u) => str(u.email).trim().toLowerCase() === email,
      ));
    if (!trader) {
      const name =
        str(b.customer_name || order.customer_name).trim() ||
        email.split("@")[0];
      const first = (name.split(" ")[0] || "TRADER").toUpperCase();
      const tempPw = `${first}@1234`;
      let userId = uuid();
      if (sb) {
        const { data } = await sb.auth.admin
          .createUser({
            email,
            password: tempPw,
            email_confirm: true,
            user_metadata: { name, phone: str(order.customer_phone) },
          })
          .catch(() => ({ data: null }));
        if (data?.user?.id) userId = data.user.id;
      } else {
        await db.put("local_credentials", {
          id: userId,
          email,
          password_hash: hashLocalPassword(tempPw),
          created_at: now(),
        });
      }
      trader = {
        id: userId,
        email,
        name,
        phone: str(order.customer_phone),
        apk_username: email,
        apk_password: tempPw,
        login_password: tempPw,
        kyc: {},
        created_at: now(),
      };
      await db.put("users", trader);
    }

    const existingAcct = await db.findOne(
      "trader_accounts",
      (a) => a.order_id === order.id,
    );
    let account;
    let transaction = null;
    if (existingAcct && !b.replace_existing) {
      const er = await getEvalRiskSettings();
      const nextAccount = {
        ...existingAcct,
        ...(b.starting_capital
          ? {
              starting_capital: num(b.starting_capital),
              balance: num(b.starting_capital),
              available_margin: num(b.starting_capital),
            }
          : {}),
        ...(b.plan_name ? { plan_name: str(b.plan_name).trim() } : {}),
        ...(b.profit_target_pct != null
          ? { profit_target_pct: num(b.profit_target_pct) }
          : {}),
        ...(b.daily_loss_limit_pct != null
          ? { daily_loss_limit_pct: num(b.daily_loss_limit_pct) }
          : {}),
        ...(b.max_loss_limit != null
          ? {
              max_loss_limit: num(b.max_loss_limit),
              overall_loss_limit_pct: num(b.max_loss_limit),
              trailing_drawdown_pct: num(b.max_loss_limit),
            }
          : {}),
        ...(b.min_trading_days != null
          ? { min_trading_days: int(b.min_trading_days) }
          : {}),
        ...(b.total_trading_days != null
          ? { total_trading_days: int(b.total_trading_days) }
          : {}),
        ...(b.trades_per_day != null
          ? { trades_per_day: int(b.trades_per_day) }
          : {}),
        ...(b.profit_split != null
          ? { profit_split: int(b.profit_split) }
          : {}),
        automation_enabled: true,
        automation_started_at: existingAcct.automation_started_at || now(),
        assigned_by: admin.email,
        trading_enabled: !["Failed", "Passed"].includes(
          str(existingAcct.status),
        ),
        updated_at: now(),
      };
      const merged = mergeAccountWithRules(nextAccount, er);
      await db.put("trader_accounts", merged);
      const evalRes = await evaluateAccountRisk({
        db,
        account: merged,
        origin: url.origin,
        appendEmailLog,
      }).catch(() => ({ account: merged }));
      account = evalRes?.account || merged;
    } else {
      const created = await createChallengeAccountForTrader({
        trader,
        b: {
          account_type: "Challenge",
          ...b,
        },
        admin,
        order,
      });
      account = created.account;
      transaction = created.transaction;
    }

    const updatedOrder = {
      ...order,
      user_id: trader.id,
      status: "completed",
      assigned_challenge_at: now(),
      assigned_by: admin.email,
      assigned_account_id: account.id,
      assigned_account_number: account.account_number,
      assigned_plan_name: account.plan_name,
      updated_at: now(),
    };
    await db.put("orders", updatedOrder);
    return json({
      order: updatedOrder,
      account,
      transaction,
      automation_started: true,
    });
  }
  if ((p = is("PATCH", "/admin/accounts/:id"))) {
    const admin = await currentAdmin();
    const old = await db.get("trader_accounts", p.id);
    if (!old) fail(404, "Account not found");
    const b = await body();
    const upd = { ...old };
    if (
      b.status &&
      ["Active", "Funded", "Passed", "Completed", "Failed"].includes(
        str(b.status),
      )
    ) {
      upd.status = str(b.status);
    }
    if (
      b.account_type &&
      ["Challenge", "Funded"].includes(str(b.account_type))
    ) {
      upd.account_type = str(b.account_type);
    }
    if (b.plan_name != null && str(b.plan_name).trim()) {
      upd.plan_name = str(b.plan_name).trim().slice(0, 80);
    }
    if (b.note != null) upd.note = str(b.note).trim().slice(0, 300);
    if (
      b.starting_capital != null &&
      Number.isFinite(Number(b.starting_capital))
    ) {
      upd.starting_capital = Math.max(
        0,
        +Number(b.starting_capital).toFixed(2),
      );
    }
    if (b.balance != null && Number.isFinite(Number(b.balance))) {
      const nextBal = Math.max(0, +Number(b.balance).toFixed(2));
      const diff = +(nextBal - num(old.balance)).toFixed(2);
      upd.balance = nextBal;
      upd.available_margin = Math.max(
        0,
        +(nextBal - num(upd.used_margin)).toFixed(2),
      );
      if (diff !== 0) {
        await db.put("fund_transactions", {
          id: uuid(),
          user_id: old.user_id,
          user_email: old.user_email,
          account_id: old.id,
          account_number: old.account_number,
          kind: diff > 0 ? "credit" : "debit",
          amount: Math.abs(diff),
          balance_after: nextBal,
          note: str(b.note).trim() || "Admin direct balance update",
          admin_email: admin.email,
          created_at: now(),
        });
      }
    }
    if (b.realized_pnl != null && Number.isFinite(Number(b.realized_pnl))) {
      upd.realized_pnl = +Number(b.realized_pnl).toFixed(2);
    }
    if (b.profit_target_pct != null)
      upd.profit_target_pct = Math.max(
        isClassicProduct(upd) ? 1 : 0,
        num(b.profit_target_pct),
      );
    if (b.max_loss_limit != null)
      upd.max_loss_limit = Math.max(1, Math.min(50, num(b.max_loss_limit)));
    if (b.daily_loss_limit_pct != null)
      upd.daily_loss_limit_pct = Math.max(
        0.5,
        Math.min(25, num(b.daily_loss_limit_pct)),
      );
    if (b.min_trading_days != null)
      upd.min_trading_days = Math.max(0, int(b.min_trading_days));
    if (b.total_trading_days != null)
      upd.total_trading_days = Math.max(
        isClassicProduct(upd) ? 1 : 0,
        int(b.total_trading_days),
      );
    if (b.trades_per_day != null)
      upd.trades_per_day = Math.max(
        isClassicProduct(upd) ? 1 : 0,
        int(b.trades_per_day),
      );
    if (b.profit_accuracy_pct != null)
      upd.profit_accuracy_pct = Math.max(
        1,
        Math.min(100, num(b.profit_accuracy_pct)),
      );
    if (b.profit_split != null)
      upd.profit_split = Math.max(50, Math.min(95, int(b.profit_split)));
    if (b.trading_days_done != null)
      upd.trading_days_done = Math.max(0, int(b.trading_days_done));
    if (b.days_elapsed != null)
      upd.days_elapsed = Math.max(0, int(b.days_elapsed));
    if (b.status) {
      upd.trading_enabled = !["Failed", "Passed", "Completed"].includes(
        upd.status,
      );
    }
    upd.updated_at = now();
    await db.put("trader_accounts", upd);
    return json(upd);
  }
  if ((p = is("POST", "/admin/accounts/:id/reset"))) {
    const admin = await currentAdmin();
    const acct = await db.get("trader_accounts", p.id);
    if (!acct) fail(404, "Account not found");
    const openPositions = (await db.all("virtual_positions")).filter(
      (pos) => pos.account_id === acct.id && pos.qty !== 0,
    );
    for (const pos of openPositions) {
      await db.put("virtual_positions", {
        ...pos,
        qty: 0,
        margin_used: 0,
        status: "Reset",
        updated_at: now(),
      });
    }
    const cap = num(acct.starting_capital) || 100000;
    const resetFloorPct = num(
      acct.trailing_drawdown_pct,
      num(acct.max_loss_limit, 5),
    );
    const resetAcct = {
      ...acct,
      starting_capital: cap,
      balance: cap,
      current_equity: cap,
      open_pnl: 0,
      available_margin: cap,
      used_margin: 0,
      realized_pnl: 0,
      daily_starting_balance: cap,
      current_trading_day: getIstDateKey(now()),
      daily_loss: 0,
      overall_drawdown: 0,
      highest_recorded_equity: cap,
      eod_high_watermark: cap,
      intraday_peak_equity: cap,
      trailing_drawdown_floor: +(cap * (1 - resetFloorPct / 100)).toFixed(2),
      trading_days_done: 0,
      profitable_days_done: 0,
      days_elapsed: 0,
      buffer_satisfied: false,
      withdrawable_profit: 0,
      payout_eligible: false,
      trading_enabled: true,
      breached_at: null,
      breach_code: null,
      breach_reason: null,
      status: acct.account_type === "Funded" ? "Funded" : "Active",
      updated_at: now(),
    };
    await db.put("trader_accounts", resetAcct);
    await db.put("fund_transactions", {
      id: uuid(),
      user_id: acct.user_id,
      user_email: acct.user_email,
      account_id: acct.id,
      account_number: acct.account_number,
      kind: "reset",
      amount: cap,
      balance_after: cap,
      note: `Account reset by admin (${admin.email})`,
      admin_email: admin.email,
      created_at: now(),
    });
    return json({
      account: resetAcct,
      cleared_positions: openPositions.length,
    });
  }
  if ((p = is("POST", "/admin/accounts/:id/positions/:posId/close"))) {
    const admin = await currentAdmin();
    const acct = await db.get("trader_accounts", p.id);
    if (!acct) fail(404, "Account not found");
    const pos = await db.get("virtual_positions", p.posId);
    if (!pos || pos.account_id !== acct.id || pos.qty === 0)
      fail(404, "Open position not found");
    const { getQuotes, resolveInstrument } = await import("./market-data");
    const inst = resolveInstrument(pos.symbol);
    const qRes = await getQuotes([inst.symbol]);
    const quotePrice = num(qRes.quotes?.[0]?.ltp);
    if (!quotePrice)
      fail(
        503,
        "A verified market price is unavailable. Please try again later.",
      );
    const exitPrice = +quotePrice.toFixed(2);
    const absQty = Math.abs(pos.qty);
    const isLong = pos.qty > 0;
    const pnl = +(
      (isLong ? exitPrice - num(pos.avg) : num(pos.avg) - exitPrice) * absQty
    ).toFixed(2);
    const tradeDoc = {
      id: uuid(),
      user_id: acct.user_id,
      account_id: acct.id,
      symbol: pos.symbol,
      exchange: pos.exchange || inst.exchange,
      side: isLong ? "BUY" : "SELL",
      qty: absQty,
      entry: pos.avg,
      exit: exitPrice,
      pnl,
      pts: +(
        isLong ? exitPrice - num(pos.avg) : num(pos.avg) - exitPrice
      ).toFixed(2),
      note: `Squared off by admin (${admin.email})`,
      in: str(pos.created_at || now()).slice(11, 16) || "09:15",
      out: now().slice(11, 16) || "15:30",
      created_at: now(),
    };
    await db.put("virtual_trades", tradeDoc);
    await db.put("virtual_positions", {
      ...pos,
      qty: 0,
      margin_used: 0,
      status: "Closed",
      updated_at: now(),
    });
    const nextBalance = +(num(acct.balance) + pnl).toFixed(2);
    const nextUsed = Math.max(
      0,
      +(num(acct.used_margin) - num(pos.margin_used)).toFixed(2),
    );
    const nextAvail = Math.max(0, +(nextBalance - nextUsed).toFixed(2));
    const updatedAcct = {
      ...acct,
      balance: nextBalance,
      used_margin: nextUsed,
      available_margin: nextAvail,
      realized_pnl: +(num(acct.realized_pnl) + pnl).toFixed(2),
      updated_at: now(),
    };
    await db.put("trader_accounts", updatedAcct);
    return json({ account: updatedAcct, trade: tradeDoc });
  }
  if ((p = is("POST", "/admin/users/:id/send-welcome"))) {
    await currentAdmin();
    const trader = await db.get("users", p.id);
    if (!trader || !trader.email) fail(404, "Trader not found");
    const stored = await db.get("settings", "email_config");
    const { resolveEmailConfig } = await import("./mailer");
    const cfg = resolveEmailConfig(stored);
    if (!cfg.smtp_user || !cfg.smtp_password) {
      fail(
        400,
        "Business Gmail is not configured yet. Save Gmail credentials in /admin/email first.",
      );
    }
    const res = await triggerWelcomeEmailOnce(trader, { force: true });
    if (!res?.sent) {
      fail(400, res?.reason || "Failed to send welcome email");
    }
    return json({
      ok: true,
      to: trader.email,
      from: res.from || cfg.from_email || cfg.smtp_user,
      messageId: res.messageId,
      accepted: res.accepted || [trader.email],
      response: res.response || "",
    });
  }
  if ((p = is("DELETE", "/admin/users/:id"))) {
    await currentAdmin();
    if (sb) {
      const { data: isAdm } = await sb
        .from("user_roles")
        .select("id")
        .eq("user_id", p.id)
        .eq("role", "admin");
      if (isAdm && isAdm.length) fail(403, "Cannot delete an admin user");
      await sb.auth.admin.deleteUser(p.id).catch(() => null);
    }
    const trader = await db.get("users", p.id);
    const email = str(trader?.email).toLowerCase();
    await db.del("users", p.id);
    await db.del("local_credentials", p.id).catch(() => null);
    const accts = (await db.all("trader_accounts")).filter(
      (a) =>
        a.user_id === p.id ||
        (email && str(a.user_email).toLowerCase() === email),
    );
    for (const a of accts)
      await db.del("trader_accounts", a.id).catch(() => null);
    const positions = (await db.all("virtual_positions")).filter(
      (pos) => pos.user_id === p.id,
    );
    for (const pos of positions)
      await db.del("virtual_positions", pos.id).catch(() => null);
    const notifs = (await db.all("user_notifications")).filter(
      (n) => n.user_id === p.id,
    );
    for (const n of notifs)
      await db.del("user_notifications", n.id).catch(() => null);
    return json({ ok: true });
  }

  // ===== Generic admin CRUD collections =====
  // Plans
  if (is("GET", "/plans")) {
    const plansList = await db.all("plans");
    const effective = plansList.length > 0 ? plansList : DEFAULT_PLANS;
    return json([...effective].sort(byNum("order")));
  }
  if ((p = is("GET", "/plans/:id"))) {
    let pl = await db.get("plans", p.id);
    if (!pl && (await db.all("plans")).length === 0) {
      pl = DEFAULT_PLANS.find((item) => item.id === p.id) || null;
    }
    if (!pl) fail(404, "Plan not found");
    return json(pl);
  }
  if (is("POST", "/plans")) {
    await currentAdmin();
    const doc = await db.put("plans", {
      id: uuid(),
      ...planFields(await body()),
      created_at: now(),
    });
    bumpSync("plans");
    return json(doc);
  }
  if ((p = is("PUT", "/plans/:id"))) {
    await currentAdmin();
    const old = await db.get("plans", p.id);
    if (!old) fail(404, "Plan not found");
    const doc = await db.put("plans", { ...old, ...planFields(await body()) });
    bumpSync("plans");
    return json(doc);
  }
  if ((p = is("DELETE", "/plans/:id"))) {
    await currentAdmin();
    await db.del("plans", p.id);
    bumpSync("plans");
    return json({ ok: true });
  }

  // Blogs
  if (is("GET", "/blogs"))
    return json(
      (await db.all("blogs"))
        .filter((b) => b.published)
        .sort(byDesc("created_at")),
    );
  if (is("GET", "/blogs/all")) {
    await currentAdmin();
    return json((await db.all("blogs")).sort(byDesc("created_at")));
  }
  if ((p = is("GET", "/blogs/:slug"))) {
    const b = await db.findOne("blogs", (x) => x.slug === p.slug);
    if (!b) fail(404, "Blog not found");
    if (!b.published) {
      const adm = await currentAdmin().catch(() => null);
      if (!adm) fail(404, "Blog not found");
    }
    return json(b);
  }
  if (is("POST", "/blogs")) {
    await currentAdmin();
    const f = blogFields(await body());
    if (await db.findOne("blogs", (x) => x.slug === f.slug))
      fail(400, "Slug already exists");
    const doc = await db.put("blogs", { id: uuid(), ...f, created_at: now() });
    bumpSync("blogs");
    return json(doc);
  }
  if ((p = is("PUT", "/blogs/:id"))) {
    await currentAdmin();
    const old = await db.get("blogs", p.id);
    if (!old) fail(404, "Blog not found");
    const doc = await db.put("blogs", { ...old, ...blogFields(await body()) });
    bumpSync("blogs");
    return json(doc);
  }
  if ((p = is("DELETE", "/blogs/:id"))) {
    await currentAdmin();
    await db.del("blogs", p.id);
    bumpSync("blogs");
    return json({ ok: true });
  }

  // Leads
  if (is("POST", "/leads")) {
    const b = await body();
    if (!str(b.first_name)) fail(422, "first_name is required");
    const lead = {
      id: uuid(),
      first_name: str(b.first_name).slice(0, 200),
      last_name: str(b.last_name).slice(0, 200),
      email: requireEmail(b.email),
      phone: str(b.phone).slice(0, 50),
      city: str(b.city).slice(0, 200),
      challenge_type: str(b.challenge_type).slice(0, 200),
      platform: str(b.platform).slice(0, 200),
      message: str(b.message).slice(0, 5000),
      created_at: now(),
    };
    return json(await db.put("leads", lead));
  }
  if (is("GET", "/leads")) {
    await currentAdmin();
    return json((await db.all("leads")).sort(byDesc("created_at")));
  }
  if ((p = is("DELETE", "/leads/:id"))) {
    await currentAdmin();
    await db.del("leads", p.id);
    return json({ ok: true });
  }

  // Trader stories: signed-in traders submit, admin approves, public sees approved only
  if (is("GET", "/stories")) {
    const all = (await db.all("stories"))
      .filter((s) => s.status === "approved")
      .sort(byDesc("created_at"));
    return json(all.map(({ email, ...rest }) => rest));
  }
  if (is("POST", "/stories")) {
    const user = await currentUser();
    const b = await body();
    const story = str(b.story).trim().slice(0, 2000);
    if (story.length < 20) fail(422, "Story must be at least 20 characters");
    const rating = Math.min(5, Math.max(1, int(b.rating) || 5));
    return json(
      await db.put("stories", {
        id: uuid(),
        name: str(b.name || user.name).slice(0, 80),
        city: str(b.city).slice(0, 60),
        title: str(b.title).slice(0, 120),
        story,
        rating,
        video_url: str(b.video_url).slice(0, 300),
        payout_amount: num(b.payout_amount),
        email: user.email,
        status: "pending",
        created_at: now(),
      }),
    );
  }
  if (is("GET", "/admin/stories")) {
    await currentAdmin();
    return json((await db.all("stories")).sort(byDesc("created_at")));
  }
  if (is("POST", "/admin/stories")) {
    const admin = await currentAdmin();
    const b = await body();
    const story = str(b.story).trim().slice(0, 2000);
    const name = str(b.name).trim().slice(0, 80);
    if (!name) fail(422, "Trader name is required");
    if (story.length < 15) fail(422, "Story must be at least 15 characters");
    const rating = Math.min(5, Math.max(1, int(b.rating) || 5));
    const st = ["approved", "rejected", "pending"].includes(str(b.status))
      ? str(b.status)
      : "approved";
    const doc = await db.put("stories", {
      id: uuid(),
      name,
      city: str(b.city).trim().slice(0, 60),
      title: str(b.title).trim().slice(0, 120),
      story,
      rating,
      video_url: str(b.video_url).trim().slice(0, 500),
      payout_amount: num(b.payout_amount),
      email: str(b.email || admin.email).slice(0, 120),
      status: st,
      posted_by_admin: true,
      created_at: now(),
    });
    bumpSync("stories");
    return json(doc);
  }
  if ((p = is("PUT", "/admin/stories/:id"))) {
    await currentAdmin();
    const old = await db.get("stories", p.id);
    if (!old) fail(404, "Not found");
    const b = await body();
    const next = { ...old };
    if (b.status != null) {
      const st = str(b.status);
      if (!["approved", "rejected", "pending"].includes(st))
        fail(422, "Invalid status");
      next.status = st;
    }
    if (b.name != null) next.name = str(b.name).trim().slice(0, 80);
    if (b.city != null) next.city = str(b.city).trim().slice(0, 60);
    if (b.title != null) next.title = str(b.title).trim().slice(0, 120);
    if (b.story != null) next.story = str(b.story).trim().slice(0, 2000);
    if (b.rating != null)
      next.rating = Math.min(5, Math.max(1, int(b.rating) || 5));
    if (b.video_url != null)
      next.video_url = str(b.video_url).trim().slice(0, 500);
    if (b.payout_amount != null) next.payout_amount = num(b.payout_amount);
    const doc = await db.put("stories", next);
    bumpSync("stories");
    return json(doc);
  }
  if ((p = is("DELETE", "/admin/stories/:id"))) {
    await currentAdmin();
    await db.del("stories", p.id);
    bumpSync("stories");
    return json({ ok: true });
  }

  // Public trust stats + payout verification (no private fields returned)
  if (is("GET", "/public/stats")) {
    const [users, certs, payouts] = await Promise.all([
      db.all("users"),
      db.all("certificates"),
      db.all("payout_requests"),
    ]);
    return json({
      traders: users.length,
      certificates: certs.filter((c) => c.visible).length,
      payouts:
        payouts.filter((x) =>
          ["paid", "approved", "completed"].includes(
            str(x.status).toLowerCase(),
          ),
        ).length + certs.filter((c) => c.visible).length,
    });
  }
  if (is("GET", "/public/verify-payout")) {
    const q = str(url.searchParams.get("q")).trim().toLowerCase().slice(0, 120);
    if (q.length < 2) fail(404, "Not found");
    const certs = (await db.all("certificates")).filter((c) => c.visible);
    const exactHits = certs.filter(
      (c) =>
        str(c.id).toLowerCase() === q ||
        str(c.certificate_code).toLowerCase() === q ||
        str(c.payout_id).toLowerCase() === q,
    );
    const hits = exactHits.length
      ? exactHits
      : certs.filter((c) => str(c.trader_name).toLowerCase().includes(q));
    if (!hits.length) fail(404, "Not found");
    return json(
      hits.slice(0, 20).map((c) => ({
        id: c.id,
        certificate_code: c.certificate_code || "",
        payout_id: c.payout_id || "",
        trader_name: c.trader_name,
        amount: c.amount,
        plan: c.plan || "",
        account_size: c.account_size || 0,
        date: c.payout_date,
        image_url: c.image_url || "",
        verification_url: c.verification_url || "",
        utr_last4: c.utr_last4 || "",
      })),
    );
  }

  // Certificates & Reusable Certificate Design Template
  if (is("GET", "/admin/certificate-template")) {
    await currentAdmin();
    const doc = await db.get("settings", "cert_template");
    return json(doc || { id: "cert_template", design_url: "", layout: null });
  }
  if (is("PUT", "/admin/certificate-template")) {
    await currentAdmin();
    const b = await body();
    const doc = {
      id: "cert_template",
      design_url: str(b.design_url),
      layout: b.layout && typeof b.layout === "object" ? b.layout : null,
      updated_at: now(),
    };
    return json(await db.put("settings", doc));
  }
  if (is("GET", "/certificates"))
    return json(
      (await db.all("certificates"))
        .filter((c) => c.visible)
        .sort(byNum("order")),
    );
  if (is("GET", "/certificates/all")) {
    await currentAdmin();
    return json((await db.all("certificates")).sort(byNum("order")));
  }
  if (is("POST", "/certificates")) {
    await currentAdmin();
    const doc = await db.put("certificates", {
      id: uuid(),
      ...certFields(await body()),
      created_at: now(),
    });
    bumpSync("certificates");
    return json(doc);
  }
  if ((p = is("PUT", "/certificates/:id"))) {
    await currentAdmin();
    const old = await db.get("certificates", p.id);
    if (!old) fail(404, "Certificate not found");
    const doc = await db.put("certificates", {
      ...old,
      ...certFields(await body(), old.certificate_code),
    });
    bumpSync("certificates");
    return json(doc);
  }
  if ((p = is("DELETE", "/certificates/:id"))) {
    await currentAdmin();
    await db.del("certificates", p.id);
    bumpSync("certificates");
    return json({ ok: true });
  }

  // Payout requests
  if (is("POST", "/payout-requests")) {
    const b = await body();
    const amount = num(b.amount);
    const methodName = str(b.method) || "upi";
    if (!str(b.full_name) || !str(b.phone))
      fail(422, "Name and phone are required");
    if (amount <= 0) fail(400, "Amount must be greater than 0");
    if (!["upi", "bank"].includes(methodName))
      fail(400, "Invalid payout method");
    if (methodName === "upi" && !str(b.upi_id).trim())
      fail(400, "UPI ID is required for UPI payouts");
    if (
      methodName === "bank" &&
      !(str(b.account_number).trim() && str(b.ifsc).trim())
    )
      fail(400, "Bank account number and IFSC are required for bank payouts");
    const req = {
      id: uuid(),
      full_name: str(b.full_name),
      email: requireEmail(b.email),
      phone: str(b.phone),
      account_id: str(b.account_id),
      plan: str(b.plan),
      amount,
      method: methodName,
      upi_id: str(b.upi_id),
      bank_name: str(b.bank_name),
      account_number: str(b.account_number),
      ifsc: str(b.ifsc),
      account_holder: str(b.account_holder),
      notes: str(b.notes),
      status: "pending",
      admin_note: "",
      created_at: now(),
    };
    return json(await db.put("payout_requests", req));
  }
  if (is("GET", "/payout-requests")) {
    await currentAdmin();
    return json((await db.all("payout_requests")).sort(byDesc("created_at")));
  }
  if ((p = is("PATCH", "/payout-requests/:id"))) {
    await currentAdmin();
    const b = await body();
    const old = await db.get("payout_requests", p.id);
    if (!old) fail(404, "Payout request not found");
    const upd = {};
    if (b.status != null) {
      if (!["pending", "approved", "paid", "rejected"].includes(b.status))
        fail(400, "Invalid status");
      upd.status = b.status;
    }
    if (b.admin_note != null) upd.admin_note = str(b.admin_note);
    return json(await db.put("payout_requests", { ...old, ...upd }));
  }
  if ((p = is("DELETE", "/payout-requests/:id"))) {
    await currentAdmin();
    await db.del("payout_requests", p.id);
    return json({ ok: true });
  }

  // Uploads & Media Streaming
  if (is("POST", "/uploads/image")) {
    await currentAdmin();
    const b = await body();
    const d = str(b.data_url);
    if (!d.startsWith("data:image/")) fail(400, "Not a valid image data URL");
    if (d.length > 8 * 1024 * 1024) fail(413, "Image too large (max ~6MB)");
    return json({ url: d });
  }
  if (is("POST", "/admin/media")) {
    await currentAdmin();
    const saveUploadedAsset = async ({
      id,
      contentType,
      filename,
      base64Data,
      byteLength,
    }) => {
      const isVideo = contentType.startsWith("video/");
      const maxBytes = isVideo ? 18 * 1024 * 1024 : 6 * 1024 * 1024;
      if (byteLength > maxBytes) {
        fail(
          413,
          isVideo
            ? "Video file is too large. Keep short videos under 18 MB."
            : "Image file is too large. Keep images under 6 MB.",
        );
      }
      const ext = MEDIA_MIME_TO_EXT[contentType] || "mp4";
      const cleanId = id || `vid_${uuid().replace(/-/g, "").slice(0, 14)}`;
      if (isNetlifyRuntime()) {
        const { getStore } = await import("@netlify/blobs");
        await getStore({ name: "review-media", consistency: "strong" }).set(
          cleanId,
          Buffer.from(base64Data, "base64"),
        );
      } else {
        const asset = {
          id: cleanId,
          ext,
          filename: str(filename).slice(0, 120) || `${cleanId}.${ext}`,
          content_type: contentType,
          data_base64: base64Data,
          size: byteLength,
          created_at: now(),
        };
        const savedLocal = writeLocalMediaAsset(asset);
        try {
          await db.put("media_assets", asset);
        } catch (dbErr) {
          if (!savedLocal) throw dbErr;
        }
      }
      return {
        id: cleanId,
        url: `/api/media/${cleanId}.${ext}`,
        content_type: contentType,
        size: byteLength,
      };
    };

    const reqContentType = str(
      request.headers.get("content-type"),
    ).toLowerCase();
    if (reqContentType.includes("multipart/form-data")) {
      let form;
      try {
        form = await request.formData();
      } catch {
        fail(400, "Invalid multipart upload");
      }
      const file = form.get("file");
      if (!file || typeof file.arrayBuffer !== "function") {
        fail(400, "No media file included in upload");
      }
      const normalizedType = normalizeMediaMime(file.type, file.name);
      if (!normalizedType) {
        fail(
          400,
          "Unsupported media format. Upload MP4, WebM, MOV, JPG, PNG, or WebP.",
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      if (!buf.length) fail(400, "Uploaded file is empty");
      return json(
        await saveUploadedAsset({
          contentType: normalizedType,
          filename: file.name,
          base64Data: buf.toString("base64"),
          byteLength: buf.length,
        }),
      );
    }

    const b = await body();
    if (b.upload_id) {
      const uploadId = str(b.upload_id);
      const index = Number(b.index);
      const total = Number(b.total);
      const contentType = normalizeMediaMime(b.content_type, b.filename);
      const chunkStr = str(b.chunk);
      if (
        !/^[a-zA-Z0-9_-]{8,64}$/.test(uploadId) ||
        !Number.isInteger(index) ||
        !Number.isInteger(total) ||
        total < 1 ||
        total > 64 ||
        index < 0 ||
        index >= total ||
        !contentType ||
        !chunkStr ||
        !/^[A-Za-z0-9+/=]+$/.test(chunkStr) ||
        chunkStr.length > 2097152
      ) {
        fail(400, "Invalid media upload");
      }
      if (isNetlifyRuntime()) {
        const { getStore } = await import("@netlify/blobs");
        const mediaStore = getStore({
          name: "review-media",
          consistency: "strong",
        });
        await mediaStore.set(`parts/${uploadId}/${index}`, chunkStr);
        if (index < total - 1) return json({ ok: true, index, total });
        const parts = await Promise.all(
          Array.from({ length: total }, (_, part) =>
            mediaStore.get(`parts/${uploadId}/${part}`, { type: "text" }),
          ),
        );
        if (parts.some((part) => !part)) fail(400, "Upload is incomplete");
        const fullBase64 = parts.join("");
        const buffer = Buffer.from(fullBase64, "base64");
        if (buffer.length > 18 * 1024 * 1024) {
          fail(413, "Video file is too large");
        }
        const id = `vid_${uploadId.replace(/-/g, "")}`;
        await mediaStore.set(id, buffer);
        await Promise.all(
          parts.map((_, part) =>
            mediaStore.delete(`parts/${uploadId}/${part}`),
          ),
        );
        const ext = MEDIA_MIME_TO_EXT[contentType] || "mp4";
        return json({
          id,
          url: `/api/media/${id}.${ext}`,
          content_type: contentType,
          size: buffer.length,
        });
      }

      storeMediaChunkLocal(uploadId, index, chunkStr);
      if (index < total - 1) return json({ ok: true, index, total });
      const joinedBase64 = assembleMediaChunksLocal(uploadId, total);
      if (!joinedBase64) fail(400, "Upload is incomplete");
      const buffer = Buffer.from(joinedBase64, "base64");
      const id = `vid_${uploadId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20)}`;
      return json(
        await saveUploadedAsset({
          id,
          contentType,
          filename: b.filename,
          base64Data: joinedBase64,
          byteLength: buffer.length,
        }),
      );
    }

    const dataUrl = str(b.data_url);
    const m = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i);
    if (!m) {
      fail(
        400,
        "Unsupported media format. Upload MP4, WebM, or MOV short videos.",
      );
    }
    const contentType = normalizeMediaMime(m[1], b.filename);
    if (!contentType) {
      fail(
        400,
        "Unsupported media format. Upload MP4, WebM, or MOV short videos.",
      );
    }
    const base64Data = m[2].replace(/\s+/g, "");
    const byteLength = Buffer.from(base64Data, "base64").length;
    return json(
      await saveUploadedAsset({
        contentType,
        filename: b.filename,
        base64Data,
        byteLength,
      }),
    );
  }
  if ((p = is("GET", "/media/:filename")) || (p = is("HEAD", "/media/:filename"))) {
    const assetId = str(p.filename).replace(
      /\.(?:mp4|m4v|webm|mov|jpg|jpeg|png|webp)$/i,
      "",
    );
    let asset = null;
    try {
      asset = await db.get("media_assets", assetId);
    } catch {
      asset = null;
    }
    if (!asset) {
      asset = readLocalMediaAsset(assetId);
    }
    if (!asset && isNetlifyRuntime()) {
      const { getStore } = await import("@netlify/blobs");
      const blob = await getStore({
        name: "review-media",
        consistency: "strong",
      }).get(assetId, { type: "arrayBuffer" });
      if (blob) {
        const ext = str(p.filename).split(".").pop()?.toLowerCase() || "mp4";
        asset = {
          data_base64: Buffer.from(blob).toString("base64"),
          content_type: MEDIA_EXT_TO_MIME[ext] || "video/mp4",
        };
      }
    }
    if (!asset || !asset.data_base64) fail(404, "Media not found");
    const buf = Buffer.from(asset.data_base64, "base64");
    const total = buf.length;
    const range = request.headers.get("range");
    const mime =
      normalizeMediaMime(asset.content_type, p.filename) || "video/mp4";
    if (method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: {
          "content-type": mime,
          "accept-ranges": "bytes",
          "content-length": String(total),
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        const start = Math.min(total - 1, Number(m[1]) || 0);
        const end = Math.min(
          total - 1,
          start + 2 * 1024 * 1024 - 1,
          m[2] ? Number(m[2]) : total - 1,
        );
        const chunk = buf.subarray(start, end + 1);
        return new Response(chunk, {
          status: 206,
          headers: {
            "content-type": mime,
            "content-range": `bytes ${start}-${end}/${total}`,
            "accept-ranges": "bytes",
            "content-length": String(chunk.length),
            "cache-control": "public, max-age=31536000, immutable",
          },
        });
      }
    }
    return new Response(buf, {
      status: 200,
      headers: {
        "content-type": mime,
        "accept-ranges": "bytes",
        "content-length": String(total),
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Admin Business Email (Gmail / Titan / Custom SMTP)
  const buildEmailDraft = (b, old, EMAIL_PROVIDERS, normalizeSmtpPassword) => {
    const provider = EMAIL_PROVIDERS[str(b.provider)]
      ? str(b.provider)
      : old.provider || "gmail";
    const preset = EMAIL_PROVIDERS[provider] || EMAIL_PROVIDERS.gmail;
    const port =
      int(b.smtp_port, old.smtp_port || preset.smtp_port || 465) || 465;
    const smtpSecure =
      port === 465
        ? true
        : port === 587
          ? false
          : b.smtp_secure !== undefined
            ? Boolean(b.smtp_secure)
            : old.smtp_secure !== undefined
              ? Boolean(old.smtp_secure)
              : true;
    const hasIncomingUser = b.smtp_user !== undefined;
    const smtpUser = hasIncomingUser
      ? str(b.smtp_user).trim()
      : str(old.smtp_user).trim();
    const rawFrom =
      b.from_email !== undefined
        ? str(b.from_email).trim()
        : str(old.from_email).trim();
    const fromEmail = rawFrom || smtpUser;
    const rawReplyTo =
      b.reply_to !== undefined
        ? str(b.reply_to).trim()
        : str(old.reply_to).trim();
    const replyTo = rawReplyTo || fromEmail;
    return {
      provider,
      preset,
      draft: {
        ...old,
        provider,
        smtp_host:
          str(b.smtp_host).trim() ||
          old.smtp_host ||
          preset.smtp_host ||
          "smtp.gmail.com",
        smtp_port: port,
        smtp_secure: smtpSecure,
        smtp_user: smtpUser,
        smtp_password: normalizeSmtpPassword(
          provider,
          str(b.smtp_password) || str(old.smtp_password),
        ),
        from_name: str(b.from_name).trim() || old.from_name || "IndiFunded",
        from_email: fromEmail,
        reply_to: replyTo,
        welcome_subject: str(b.welcome_subject).trim() || old.welcome_subject,
        welcome_body: str(b.welcome_body) || old.welcome_body,
        login_welcome_subject:
          str(b.login_welcome_subject).trim() || old.login_welcome_subject,
        login_welcome_body: str(b.login_welcome_body) || old.login_welcome_body,
      },
    };
  };

  if (is("GET", "/admin/email")) {
    await currentAdmin();
    const { sanitizeEmailConfigForAdmin } = await import("./mailer");
    const stored = await db.get("settings", "email_config");
    return json(sanitizeEmailConfigForAdmin(stored));
  }
  if (is("PUT", "/admin/email")) {
    await currentAdmin();
    const b = await body();
    const {
      DEFAULT_EMAIL_CONFIG,
      EMAIL_PROVIDERS,
      normalizeSmtpPassword,
      resolveEmailConfig,
      sanitizeEmailConfigForAdmin,
    } = await import("./mailer");
    const old = resolveEmailConfig(await db.get("settings", "email_config"));
    const provider = EMAIL_PROVIDERS[str(b.provider)]
      ? str(b.provider)
      : old.provider || "gmail";
    const preset = EMAIL_PROVIDERS[provider] || EMAIL_PROVIDERS.gmail;
    const port =
      int(b.smtp_port, preset.smtp_port || 465) || preset.smtp_port || 465;
    const rawPass = str(b.smtp_password);
    const nextPassword =
      rawPass !== ""
        ? normalizeSmtpPassword(provider, rawPass)
        : b.clear_password
          ? ""
          : normalizeSmtpPassword(provider, old.smtp_password);
    const nextUser = str(b.smtp_user).trim();
    const nextFromEmail = str(b.from_email).trim() || nextUser;
    const smtpSecure =
      port === 465
        ? true
        : port === 587
          ? false
          : b.smtp_secure !== undefined
            ? Boolean(b.smtp_secure)
            : true;
    const next = {
      ...DEFAULT_EMAIL_CONFIG,
      ...old,
      id: "email_config",
      provider,
      smtp_host:
        str(b.smtp_host).trim() || preset.smtp_host || "smtp.gmail.com",
      smtp_port: port,
      smtp_secure: smtpSecure,
      smtp_user: nextUser,
      smtp_password: nextPassword,
      from_name: str(b.from_name).trim() || "IndiFunded",
      from_email: nextFromEmail,
      reply_to: str(b.reply_to).trim() || nextFromEmail,
      welcome_enabled: bool(b.welcome_enabled, true),
      welcome_subject:
        str(b.welcome_subject).trim() || DEFAULT_EMAIL_CONFIG.welcome_subject,
      welcome_body: str(b.welcome_body) || DEFAULT_EMAIL_CONFIG.welcome_body,
      login_welcome_enabled: bool(b.login_welcome_enabled, true),
      login_welcome_subject:
        str(b.login_welcome_subject).trim() ||
        DEFAULT_EMAIL_CONFIG.login_welcome_subject,
      login_welcome_body:
        str(b.login_welcome_body) || DEFAULT_EMAIL_CONFIG.login_welcome_body,
      updated_at: now(),
    };
    await db.put("settings", next);
    return json(sanitizeEmailConfigForAdmin(next));
  }
  if (is("POST", "/admin/email/test")) {
    await currentAdmin();
    const b = await body();
    const to = requireEmail(b.to, "recipient email");
    const templateType = ["welcome", "login", "test"].includes(
      str(b.template_type),
    )
      ? str(b.template_type)
      : "test";
    const {
      EMAIL_PROVIDERS,
      normalizeSmtpPassword,
      resolveEmailConfig,
      sendTestEmail,
    } = await import("./mailer");
    const old = resolveEmailConfig(await db.get("settings", "email_config"));
    const { provider, draft } = buildEmailDraft(
      b,
      old,
      EMAIL_PROVIDERS,
      normalizeSmtpPassword,
    );
    try {
      const info = await sendTestEmail({
        to,
        name: str(b.name).trim(),
        config: draft,
        origin: url.origin,
        templateType,
      });
      await appendEmailLog({
        trigger: templateType === "test" ? "test" : `test_${templateType}`,
        from: info.from || draft.from_email || draft.smtp_user,
        to,
        subject:
          info.subject ||
          `IndiFunded ${EMAIL_PROVIDERS[provider]?.label || "Email"} — Automated Welcome Test Passed`,
        provider,
        status: "sent",
        message_id: info.messageId || "",
        accepted: info.accepted || [to],
      });
      return json({
        ok: true,
        messageId: info.messageId,
        accepted: info.accepted || [to],
        from: info.from || draft.from_email || draft.smtp_user,
        response: info.response || "",
        provider,
        port_used: info.portUsed,
      });
    } catch (err) {
      await appendEmailLog({
        trigger: templateType === "test" ? "test" : `test_${templateType}`,
        from: draft.from_email || draft.smtp_user,
        to,
        subject: "SMTP Test",
        provider,
        status: "failed",
        error: err?.message || "SMTP connection failed",
      });
      fail(400, err?.message || "SMTP connection failed");
    }
  }
  if (is("POST", "/admin/email/send")) {
    await currentAdmin();
    const b = await body();
    const subject = str(b.subject).trim();
    const message = str(b.message).trim();
    if (!subject) fail(422, "Email subject is required");
    if (!message) fail(422, "Email message is required");

    const {
      EMAIL_PROVIDERS,
      normalizeSmtpPassword,
      resolveEmailConfig,
      sendDirectAdminEmail,
    } = await import("./mailer");
    const old = resolveEmailConfig(await db.get("settings", "email_config"));
    const { provider, draft } = buildEmailDraft(
      b,
      old,
      EMAIL_PROVIDERS,
      normalizeSmtpPassword,
    );
    if (!draft.smtp_user || !draft.smtp_password) {
      fail(
        400,
        "Business Gmail / SMTP credentials are required. Enter and save your Gmail & App Password first.",
      );
    }

    const audience = str(b.audience).trim();
    const rawTargets = [];
    if (audience === "all_traders") {
      const users = await db.all("users");
      for (const u of users) {
        if (u?.role !== "admin" && isEmail(u?.email)) {
          rawTargets.push({
            email: str(u.email).trim().toLowerCase(),
            name: str(u.name).trim(),
          });
        }
      }
    } else if (Array.isArray(b.recipients) && b.recipients.length > 0) {
      for (const r of b.recipients) {
        const em = typeof r === "string" ? r : r?.email;
        if (isEmail(em)) {
          rawTargets.push({
            email: str(em).trim().toLowerCase(),
            name: typeof r === "object" ? str(r?.name).trim() : "",
          });
        }
      }
    } else {
      const parts = str(b.to)
        .split(/[\s,;]+/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      for (const em of parts) {
        if (!isEmail(em)) fail(422, `Invalid recipient email: ${em}`);
        rawTargets.push({ email: em, name: str(b.name).trim() });
      }
    }

    const seen = new Set();
    const targets = rawTargets.filter((t) => {
      if (!t.email || seen.has(t.email)) return false;
      seen.add(t.email);
      return true;
    });
    if (targets.length === 0) {
      fail(422, "Enter at least one valid recipient email address");
    }

    const ctaLabel = str(b.cta_label).trim();
    const ctaUrl = str(b.cta_url).trim();
    const sentList = [];
    const failedList = [];

    for (const target of targets.slice(0, 100)) {
      const res = await sendDirectAdminEmail({
        to: target.email,
        name: target.name || target.email.split("@")[0],
        subject,
        message,
        ctaLabel,
        ctaUrl,
        config: draft,
        origin: url.origin,
      });
      await appendEmailLog({
        trigger:
          audience === "all_traders" ? "admin_broadcast" : "admin_direct",
        from: res.from || draft.from_email || draft.smtp_user,
        to: target.email,
        subject: res.subject || subject,
        provider,
        status: res.sent ? "sent" : "failed",
        message_id: res.messageId || "",
        accepted: res.accepted || [],
        error: res.sent ? "" : res.reason || "Failed to send email",
      });
      if (res.sent) {
        sentList.push({
          email: target.email,
          messageId: res.messageId || "",
          from: res.from || draft.from_email || draft.smtp_user,
          portUsed: res.portUsed,
        });
      } else {
        failedList.push({
          email: target.email,
          error: res.reason || "Failed to send",
        });
      }
    }

    if (sentList.length === 0) {
      fail(400, failedList[0]?.error || "Could not send email");
    }

    return json({
      ok: true,
      sent_count: sentList.length,
      failed_count: failedList.length,
      accepted: sentList.map((s) => s.email),
      failures: failedList,
      from: sentList[0].from,
      messageId: sentList[0].messageId,
      provider,
      port_used: sentList[0].portUsed,
    });
  }
  if (is("GET", "/admin/email/logs")) {
    await currentAdmin();
    const logDoc = await db.get("settings", "email_logs");
    return json({ items: Array.isArray(logDoc?.items) ? logDoc.items : [] });
  }

  // Settings (strip any secret fields from public payload)
  const stripSecrets = (doc) => {
    const merged = doc
      ? mergeSettings(DEFAULT_SETTINGS, doc)
      : DEFAULT_SETTINGS;
    const { email_config: _ec, smtp_password: _sp, ...safe } = merged;
    return safe;
  };
  if (is("GET", "/settings")) {
    const doc = await db.get("settings", "site");
    return json(stripSecrets(doc), 200, {
      "x-settings-saved": doc ? "true" : "false",
    });
  }
  if (is("PUT", "/settings")) {
    await currentAdmin();
    const b = await body();
    delete b._id;
    delete b.email_config;
    delete b.smtp_password;
    const old = (await db.get("settings", "site")) || {};
    const next = { ...old, ...b, id: "site" };
    await db.put("settings", next);
    if (b.evaluation_risk && typeof b.evaluation_risk === "object") {
      const er = { ...DEFAULT_SETTINGS.evaluation_risk, ...b.evaluation_risk };
      const allAccts = await db.all("trader_accounts");
      for (const acct of allAccts) {
        if (!isClassicProduct(acct)) continue;
        await db.put("trader_accounts", {
          ...acct,
          profit_target_pct: num(er.profit_target_pct, 8),
          max_loss_limit: num(er.max_loss_limit, 20),
          daily_loss_limit_pct: num(er.daily_loss_limit_pct, 5),
          min_trading_days: int(er.min_trading_days, 10),
          total_trading_days: int(er.total_trading_days, 30),
          trades_per_day: int(er.trades_per_day, 5),
          profit_accuracy_pct: num(er.profit_accuracy_pct, 70),
          profit_split: int(er.profit_split, 70),
          updated_at: now(),
        });
      }
    }
    bumpSync("settings");
    return json(stripSecrets(next));
  }
  if (is("DELETE", "/settings")) {
    await currentAdmin();
    await db.delAll("settings");
    bumpSync("settings");
    return json({ ok: true });
  }

  // ===== Admin AI Site Editor (Gemini A-to-Z CMS) =====
  if (is("POST", "/admin/ai-edit")) {
    await currentAdmin();
    const b = await body();
    const { generateAiSiteEdit, collectSettingsDiffs, AiEditorError } =
      await import("./ai-site-editor");
    const currentSettings = stripSecrets(await db.get("settings", "site"));
    const [plans, blogs, coupons] = await Promise.all([
      db.all("plans"),
      db.all("blogs"),
      db.all("coupons"),
    ]);
    try {
      const editPlan = await generateAiSiteEdit({
        prompt: str(b.prompt),
        history: Array.isArray(b.history) ? b.history : [],
        currentSettings,
        plans,
        blogs,
        coupons,
      });
      const diffs = collectSettingsDiffs(
        currentSettings,
        editPlan.settings_patch || {},
      );
      return json({
        ...editPlan,
        diffs,
      });
    } catch (err) {
      if (err instanceof AiEditorError) fail(err.status, err.message);
      throw err;
    }
  }

  if (is("POST", "/admin/ai-apply")) {
    await currentAdmin();
    const b = await body();
    const { deepMergeObjects } = await import("./ai-site-editor");

    const oldStored = (await db.get("settings", "site")) || {};
    const prevSnapshot = stripSecrets(oldStored);
    const plansPrev = await db.all("plans");
    const blogsPrev = await db.all("blogs");
    const couponsPrev = await db.all("coupons");

    const revId = `rev-${Date.now().toString(36)}`;
    await db.put("ai_revisions", {
      id: revId,
      label: str(b.label || "AI Site Update").slice(0, 140),
      settings_snapshot: prevSnapshot,
      plans_snapshot: plansPrev,
      blogs_snapshot: blogsPrev,
      coupons_snapshot: couponsPrev,
      created_at: now(),
    });
    const allRevs = (await db.all("ai_revisions")).sort(byDesc("created_at"));
    for (const stale of allRevs.slice(12)) {
      await db.del("ai_revisions", stale.id);
    }

    const patch =
      b.settings_patch &&
      typeof b.settings_patch === "object" &&
      !Array.isArray(b.settings_patch)
        ? { ...b.settings_patch }
        : {};
    delete patch._id;
    delete patch.id;
    delete patch.email_config;
    delete patch.smtp_password;

    const mergedSettings = {
      ...deepMergeObjects(prevSnapshot, patch),
      id: "site",
    };
    await db.put("settings", mergedSettings);

    if (patch.evaluation_risk && typeof patch.evaluation_risk === "object") {
      const er = {
        ...DEFAULT_SETTINGS.evaluation_risk,
        ...mergedSettings.evaluation_risk,
      };
      const allAccts = await db.all("trader_accounts");
      for (const acct of allAccts) {
        if (!isClassicProduct(acct)) continue;
        await db.put("trader_accounts", {
          ...acct,
          profit_target_pct: num(er.profit_target_pct, 8),
          max_loss_limit: num(er.max_loss_limit, 20),
          daily_loss_limit_pct: num(er.daily_loss_limit_pct, 5),
          min_trading_days: int(er.min_trading_days, 10),
          total_trading_days: int(er.total_trading_days, 30),
          trades_per_day: int(er.trades_per_day, 5),
          profit_accuracy_pct: num(er.profit_accuracy_pct, 70),
          profit_split: int(er.profit_split, 70),
          updated_at: now(),
        });
      }
    }

    const appliedSummary = {
      settings: Object.keys(patch).length > 0,
      plans: 0,
      blogs: 0,
      coupons: 0,
    };

    for (const act of Array.isArray(b.plan_actions) ? b.plan_actions : []) {
      const d = act.data || {};
      if (act.action === "delete" && act.id) {
        await db.del("plans", act.id);
        appliedSummary.plans++;
      } else if (act.action === "update" && act.id) {
        const cur = await db.get("plans", act.id);
        if (cur) {
          await db.put("plans", { ...cur, ...d, id: cur.id });
          appliedSummary.plans++;
        }
      } else if (act.action === "create") {
        const id = d.id || `plan-${uuid().slice(0, 8)}`;
        await db.put("plans", {
          id,
          name: str(d.name || "Custom Plan"),
          account_size: num(d.account_size, 100000),
          challenge_fee: num(d.challenge_fee, 4999),
          original_price:
            d.original_price != null ? num(d.original_price) : null,
          profit_target_points: int(d.profit_target_points, 650),
          profit_share: int(d.profit_share, 70),
          max_loss_limit: num(d.max_loss_limit, 20),
          min_trading_days: int(d.min_trading_days, 10),
          total_trading_days: int(d.total_trading_days, 15),
          trades_per_day: int(d.trades_per_day, 5),
          description: str(d.description || ""),
          features: Array.isArray(d.features) ? d.features : [],
          popular: Boolean(d.popular),
          order: int(d.order, 10),
          created_at: now(),
        });
        appliedSummary.plans++;
      }
    }

    for (const act of Array.isArray(b.blog_actions) ? b.blog_actions : []) {
      const d = act.data || {};
      if (act.action === "delete" && act.id) {
        await db.del("blogs", act.id);
        appliedSummary.blogs++;
      } else if (act.action === "update" && act.id) {
        const cur = await db.get("blogs", act.id);
        if (cur) {
          await db.put("blogs", { ...cur, ...d, id: cur.id });
          appliedSummary.blogs++;
        }
      } else if (act.action === "create") {
        const title = str(d.title || "Untitled Article");
        const slug =
          str(d.slug) ||
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        await db.put("blogs", {
          id: `blog-${uuid().slice(0, 8)}`,
          slug,
          title,
          excerpt: str(d.excerpt || ""),
          content: str(d.content || ""),
          cover_image: str(d.cover_image || ""),
          author: str(d.author || "IndiFunded Team"),
          published: d.published !== false,
          created_at: now(),
        });
        appliedSummary.blogs++;
      }
    }

    for (const act of Array.isArray(b.coupon_actions) ? b.coupon_actions : []) {
      const d = act.data || {};
      if (act.action === "delete" && act.id) {
        await db.del("coupons", act.id);
        appliedSummary.coupons++;
      } else if (act.action === "update" && act.id) {
        const cur = await db.get("coupons", act.id);
        if (cur) {
          await db.put("coupons", {
            ...cur,
            ...d,
            code: d.code ? str(d.code).trim().toUpperCase() : cur.code,
            id: cur.id,
          });
          appliedSummary.coupons++;
        }
      } else if (act.action === "create") {
        const code = str(d.code || "PROMO10")
          .trim()
          .toUpperCase();
        await db.put("coupons", {
          id: `coupon-${code.toLowerCase()}-${uuid().slice(0, 4)}`,
          code,
          discount_percent: num(d.discount_percent, 10),
          active: d.active !== false,
          description: str(
            d.description ||
              `${num(d.discount_percent, 10)}% promotional discount`,
          ),
          max_uses: d.max_uses != null ? int(d.max_uses) : null,
          used_count: 0,
          expires_at: d.expires_at || null,
          created_at: now(),
        });
        appliedSummary.coupons++;
      }
    }

    bumpSync("all");
    return json({
      ok: true,
      revision_id: revId,
      applied: appliedSummary,
      settings: stripSecrets(mergedSettings),
    });
  }

  if (is("GET", "/admin/ai-revisions")) {
    await currentAdmin();
    const list = (await db.all("ai_revisions"))
      .sort(byDesc("created_at"))
      .map((r) => ({ id: r.id, label: r.label, created_at: r.created_at }));
    return json(list);
  }

  if ((p = is("POST", "/admin/ai-rollback/:id"))) {
    await currentAdmin();
    const rev = await db.get("ai_revisions", p.id);
    if (!rev) fail(404, "Revision not found");
    if (rev.settings_snapshot) {
      await db.put("settings", { ...rev.settings_snapshot, id: "site" });
      if (rev.settings_snapshot.evaluation_risk) {
        const er = {
          ...DEFAULT_SETTINGS.evaluation_risk,
          ...rev.settings_snapshot.evaluation_risk,
        };
        for (const acct of await db.all("trader_accounts")) {
          if (!isClassicProduct(acct)) continue;
          await db.put("trader_accounts", {
            ...acct,
            profit_target_pct: num(er.profit_target_pct, 8),
            max_loss_limit: num(er.max_loss_limit, 20),
            daily_loss_limit_pct: num(er.daily_loss_limit_pct, 5),
            min_trading_days: int(er.min_trading_days, 10),
            total_trading_days: int(er.total_trading_days, 30),
            trades_per_day: int(er.trades_per_day, 5),
            profit_accuracy_pct: num(er.profit_accuracy_pct, 70),
            profit_split: int(er.profit_split, 70),
            updated_at: now(),
          });
        }
      }
    }
    if (Array.isArray(rev.plans_snapshot)) {
      await db.delAll("plans");
      for (const item of rev.plans_snapshot) await db.put("plans", item);
    }
    if (Array.isArray(rev.blogs_snapshot)) {
      await db.delAll("blogs");
      for (const item of rev.blogs_snapshot) await db.put("blogs", item);
    }
    if (Array.isArray(rev.coupons_snapshot)) {
      await db.delAll("coupons");
      for (const item of rev.coupons_snapshot) await db.put("coupons", item);
    }
    bumpSync("all");
    return json({ ok: true, restored: rev.id });
  }

  // ===== Orders / pricing =====
  const computePricing = async (plan, couponCode, referralCode) => {
    const base = num(plan.challenge_fee);
    let final = base;
    let discount = 0;
    let ccode = null;
    if (couponCode) {
      const up = str(couponCode).trim().toUpperCase();
      const c = await db.findOne("coupons", (x) => x.code === up);
      if (couponUsable(c)) {
        discount = Math.round(base * num(c.discount_percent)) / 100;
        final = Math.max(0, Math.round((base - discount) * 100) / 100);
        ccode = up;
        await db.put("coupons", { ...c, used_count: (c.used_count || 0) + 1 });
      }
    }
    let rcode = null;
    if (referralCode) {
      const rc = str(referralCode).trim().toUpperCase();
      const r = await db.findOne("referrals", (x) => x.code === rc);
      if (r) {
        rcode = rc;
        await db.put("referrals", {
          ...r,
          referrals_count: (r.referrals_count || 0) + 1,
          earnings: (r.earnings || 0) + Math.trunc(final * 0.05),
        });
      }
    }
    return { base, final, discount, ccode, rcode };
  };
  const orderCustomer = (b) => {
    if (!str(b.customer_name) || !str(b.customer_phone))
      fail(422, "Name and phone are required");
    return {
      customer_name: str(b.customer_name),
      customer_email: requireEmail(b.customer_email, "customer_email"),
      customer_phone: str(b.customer_phone),
      notes: str(b.notes),
    };
  };

  // ===== Funding Products (Instant Funding & 1-Step Challenge) =====
  if (is("GET", "/funding-products")) {
    return json(await getFundingProductsConfig());
  }
  if (is("GET", "/admin/funding-products")) {
    await currentAdmin();
    return json(await getFundingProductsConfig());
  }
  if (is("PUT", "/admin/funding-products")) {
    await currentAdmin();
    const b = await body();
    const current = await getFundingProductsConfig();
    const merged = normalizeFundingProductsConfig({
      ...current,
      ...b,
      instant_funding: {
        ...current.instant_funding,
        ...(b.instant_funding || {}),
      },
      one_step: {
        ...current.one_step,
        ...(b.one_step || {}),
      },
      updated_at: now(),
    });
    await db.put("settings", merged);
    bumpSync("funding_products");
    return json(merged);
  }
  if (is("GET", "/admin/funding-accounts")) {
    await currentAdmin();
    const [users, accounts, breaches, events, positions] = await Promise.all([
      db.all("users"),
      db.all("trader_accounts"),
      db.all("risk_breaches"),
      db.all("risk_events"),
      db.all("virtual_positions"),
    ]);
    const er = await getEvalRiskSettings();
    const byId = new Map(users.map((u) => [u.id, u]));
    const byEmail = new Map(users.map((u) => [str(u.email).toLowerCase(), u]));
    const enriched = accounts
      .map((a) => {
        const owner =
          byId.get(a.user_id) || byEmail.get(str(a.user_email).toLowerCase());
        const openPos = positions.filter(
          (pos) => pos.account_id === a.id && pos.qty !== 0,
        );
        return {
          ...mergeAccountWithRules(a, er),
          user_name: owner?.name || "",
          user_phone: owner?.phone || "",
          open_positions_count: openPos.length,
        };
      })
      .sort(byDesc("updated_at"));
    return json({
      accounts: enriched,
      breaches: breaches.sort(byDesc("created_at")),
      events: events.sort(byDesc("created_at")),
    });
  }
  if ((p = is("GET", "/admin/funding-accounts/:id/history"))) {
    await currentAdmin();
    const acct = await db.get("trader_accounts", p.id);
    if (!acct) fail(404, "Account not found");
    const er = await getEvalRiskSettings();
    const [allVOrders, allVTrades, allVPos, allEvents, allBreaches, allTx] =
      await Promise.all([
        db.all("virtual_orders"),
        db.all("virtual_trades"),
        db.all("virtual_positions"),
        db.all("risk_events"),
        db.all("risk_breaches"),
        db.all("fund_transactions"),
      ]);
    return json({
      account: mergeAccountWithRules(acct, er),
      orders: allVOrders
        .filter((o) => o.account_id === acct.id)
        .sort(byDesc("created_at")),
      trades: allVTrades
        .filter((t) => t.account_id === acct.id)
        .sort(byDesc("created_at")),
      positions: allVPos.filter(
        (pos) => pos.account_id === acct.id && pos.qty !== 0,
      ),
      events: allEvents
        .filter((e) => e.account_id === acct.id)
        .sort(byDesc("created_at")),
      breaches: allBreaches
        .filter((b) => b.account_id === acct.id)
        .sort(byDesc("created_at")),
      transactions: allTx
        .filter((t) => t.account_id === acct.id)
        .sort(byDesc("created_at")),
    });
  }
  if (is("POST", "/admin/risk/evaluate")) {
    await currentAdmin();
    const b = await body().catch(() => ({}));
    const allAccts = await db.all("trader_accounts");
    const targetAccts = b.account_id
      ? allAccts.filter((a) => a.id === str(b.account_id))
      : allAccts;
    const res = await evaluateAccountsBatch({
      db,
      accounts: targetAccts,
      quoteMap: b.quote_overrides || undefined,
      nowIso: b.now_iso || undefined,
      settleEod: Boolean(b.settle_eod),
      origin: url.origin,
      appendEmailLog,
    });
    return json(res);
  }

  const resolveOrderProduct = async (b) => {
    const pType = str(b.product_type).trim();
    if (pType === PRODUCT_TYPES.INSTANT || pType === PRODUCT_TYPES.ONE_STEP) {
      const cfg = await getFundingProductsConfig();
      const sel = resolveFundingProductSelection(cfg, {
        product_type: pType,
        account_size: b.account_size,
        drawdown_mode: b.drawdown_mode,
        payout_cycle: b.payout_cycle,
      });
      if (!sel.ok) fail(400, sel.error);
      return {
        id: sel.plan_id,
        name: sel.plan_name,
        account_size: sel.account_size,
        challenge_fee: sel.challenge_fee,
        product_type: sel.product_type,
        drawdown_mode: sel.drawdown_mode,
        payout_cycle: sel.payout_cycle,
        product_config_snapshot: sel.rules,
      };
    }
    let plan = await db.get("plans", str(b.plan_id));
    if (!plan) {
      const existingPlans = await db.all("plans");
      if (existingPlans.length === 0) {
        plan = DEFAULT_PLANS.find((p) => p.id === str(b.plan_id)) || null;
      }
    }
    if (!plan) fail(404, "Plan not found");
    return {
      ...plan,
      product_type: PRODUCT_TYPES.CLASSIC,
      drawdown_mode: null,
      payout_cycle: null,
      product_config_snapshot: null,
    };
  };

  if (is("POST", "/orders/upi")) {
    const b = await body();
    const cust = orderCustomer(b);
    const utr = str(b.utr).trim();
    if (!utr) fail(422, "UTR is required");
    const site = await db.get("settings", "site");
    const upiId = str(site?.contact?.upi_id).trim() || "indifunded@upi";
    const existingOrderId = str(b.order_id).trim();
    if (existingOrderId) {
      const existingOrder = await db.get("orders", existingOrderId);
      if (
        existingOrder &&
        existingOrder.status === "pending_payment" &&
        existingOrder.customer_email === cust.customer_email
      ) {
        const updatedOrder = {
          ...existingOrder,
          payment_method: "upi",
          upi_id: existingOrder.upi_id || upiId,
          utr,
          status: "pending_verification",
          updated_at: now(),
        };
        return json(await db.put("orders", updatedOrder));
      }
    }
    const plan = await resolveOrderProduct(b);
    const pr = await computePricing(plan, b.coupon_code, b.referral_code);
    const order = {
      id: uuid(),
      plan_id: plan.id,
      plan_name: plan.name,
      plan_account_size: plan.account_size,
      product_type: plan.product_type,
      drawdown_mode: plan.drawdown_mode,
      payout_cycle: plan.payout_cycle,
      product_config_snapshot: plan.product_config_snapshot,
      amount: pr.final,
      base_amount: pr.base,
      discount_amount: pr.discount,
      coupon_code: pr.ccode,
      referral_code: pr.rcode,
      currency: "inr",
      payment_method: "upi",
      upi_id: upiId,
      utr,
      ...cust,
      status: "pending_verification",
      created_at: now(),
    };
    return json(await db.put("orders", order));
  }

  if (is("POST", "/orders/razorpay/create")) {
    const b = await body();
    const cust = orderCustomer(b);
    const plan = await resolveOrderProduct(b);
    const pr = await computePricing(plan, b.coupon_code, b.referral_code);
    const paise = Math.round(pr.final * 100);
    if (paise < 100) fail(400, "Amount too low for online payment");
    const orderId = uuid();
    const creds = razorpayCreds();
    const razorpayConfigured = hasValidRazorpayKeys(creds);
    const site = await db.get("settings", "site");

    let qr = null;
    let razorpayQrError = "";
    if (razorpayConfigured) {
      try {
        const parsed = await createRazorpayQr(creds, {
          orderId,
          planName: plan.name,
          productType: plan.product_type,
          customerEmail: cust.customer_email,
          amountPaise: paise,
        });
        if (parsed?.image_url) {
          qr = parsed;
        } else {
          razorpayQrError = "Razorpay QR API did not return a QR image URL";
          console.warn(
            "[razorpay] qrCode.create returned no image_url",
            parsed,
          );
        }
      } catch (err) {
        const rzErr = extractRazorpayError(err);
        razorpayQrError = rzErr.description || rzErr.message;
        console.warn(
          `[razorpay] qrCode.create failed (${rzErr.statusCode} ${rzErr.code}): ${rzErr.description}`,
        );
      }
    }

    if (qr?.image_url) {
      const { imageUrl, upiString } = extractRazorpayQrPayload(qr);
      const siteUpiId = str(site?.contact?.upi_id).trim() || "indifunded@upi";
      const siteBrand = str(site?.brand?.name).trim() || "IndiFunded";
      const fallbackUpiLink = `upi://pay?pa=${encodeURIComponent(siteUpiId)}&pn=${encodeURIComponent(siteBrand)}&am=${Number(pr.final).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`IndiFunded ${plan.name}`)}`;
      const resolvedUpiLink = upiString || fallbackUpiLink;
      const upiLinkIsRazorpay = Boolean(upiString);
      let qrDataUrl = "";
      if (upiString) {
        qrDataUrl = await QRCode.toDataURL(upiString, {
          width: 420,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#0b0d10", light: "#ffffff" },
        }).catch(() => "");
      }
      await db.put("orders", {
        id: orderId,
        plan_id: plan.id,
        plan_name: plan.name,
        plan_account_size: plan.account_size,
        product_type: plan.product_type,
        drawdown_mode: plan.drawdown_mode,
        payout_cycle: plan.payout_cycle,
        product_config_snapshot: plan.product_config_snapshot,
        amount: pr.final,
        base_amount: pr.base,
        discount_amount: pr.discount,
        coupon_code: pr.ccode,
        referral_code: pr.rcode,
        currency: "inr",
        payment_method: "razorpay_qr",
        razorpay_qr_id: qr.id,
        razorpay_qr_image: imageUrl || qr.image_url,
        upi_link: resolvedUpiLink,
        upi_link_is_razorpay: upiLinkIsRazorpay,
        upi_id: siteUpiId,
        razorpay_payment_id: null,
        ...cust,
        status: "pending_payment",
        created_at: now(),
      });
      return json({
        order_id: orderId,
        qr_image: qr.image_url,
        qr_proxy_url: `/api/orders/razorpay/qr-image/${orderId}`,
        qr_external_url: qr.image_url,
        ...(qrDataUrl ? { qr_data_url: qrDataUrl } : {}),
        qr_id: qr.id,
        upi_id: siteUpiId,
        upi_link: resolvedUpiLink,
        upi_link_is_razorpay: upiLinkIsRazorpay,
        amount: pr.final,
        amount_paise: paise,
        payment_mode: "razorpay_qr",
        razorpay_configured: true,
      });
    }

    // If Razorpay keys exist but QR Codes API isn't enabled/failed, pre-create a standard Razorpay Checkout order so UPI Checkout works immediately alongside the dynamic UPI QR fallback.
    let checkoutOrderId = null;
    if (razorpayConfigured) {
      try {
        const rzo = await createRazorpayOrder(creds, {
          receiptId: orderId,
          amountPaise: paise,
          currency: "INR",
          notes: {
            order_id: orderId,
            plan: plan.name,
            product_type: plan.product_type,
            kind: "challenge",
            email: cust.customer_email,
          },
        });
        if (rzo?.id) checkoutOrderId = rzo.id;
      } catch (orderErr) {
        const rzErr = extractRazorpayError(orderErr);
        console.warn(
          `[razorpay] orders.create fallback check failed (${rzErr.statusCode} ${rzErr.code}): ${rzErr.description}`,
        );
      }
    }

    const { upiId, upiLink, qrImage } = await buildUpiQrPayload({
      upiId: site?.contact?.upi_id || "indifunded@upi",
      brandName: site?.brand?.name || "IndiFunded",
      amount: pr.final,
      note: `IndiFunded ${plan.name}`,
    });
    await db.put("orders", {
      id: orderId,
      plan_id: plan.id,
      plan_name: plan.name,
      plan_account_size: plan.account_size,
      product_type: plan.product_type,
      drawdown_mode: plan.drawdown_mode,
      payout_cycle: plan.payout_cycle,
      product_config_snapshot: plan.product_config_snapshot,
      amount: pr.final,
      base_amount: pr.base,
      discount_amount: pr.discount,
      coupon_code: pr.ccode,
      referral_code: pr.rcode,
      currency: "inr",
      payment_method: "upi_qr",
      upi_id: upiId,
      upi_link: upiLink,
      razorpay_qr_id: null,
      razorpay_order_id: checkoutOrderId,
      razorpay_qr_image: qrImage,
      razorpay_payment_id: null,
      ...cust,
      status: "pending_payment",
      created_at: now(),
    });
    return json({
      order_id: orderId,
      qr_image: qrImage,
      qr_id: null,
      ...(checkoutOrderId
        ? {
            razorpay_order_id: checkoutOrderId,
            key_id: creds.keyId,
            customer: {
              name: cust.customer_name,
              email: cust.customer_email,
              phone: cust.customer_phone,
            },
            description: `IndiFunded ${plan.name}`,
          }
        : {}),
      upi_id: upiId,
      upi_link: upiLink,
      amount: pr.final,
      amount_paise: paise,
      payment_mode: "upi_qr",
      razorpay_configured: razorpayConfigured,
      ...(razorpayQrError ? { razorpay_fallback_reason: razorpayQrError } : {}),
    });
  }

  if ((p = is("GET", "/orders/razorpay/qr-image/:id"))) {
    const order = await db.get("orders", p.id);
    if (!order) fail(404, "Order not found");
    const rawImg = str(order.razorpay_qr_image).trim();
    if (rawImg.startsWith("data:image/png;base64,")) {
      const buf = Buffer.from(
        rawImg.slice("data:image/png;base64,".length),
        "base64",
      );
      return new Response(buf, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "cache-control": "no-store, no-cache, must-revalidate",
        },
      });
    }
    if (isAllowedRazorpayImageUrl(rawImg)) {
      const fetched = await fetchRazorpayQrImageSafely(rawImg);
      if (fetched.kind === "image") {
        return new Response(fetched.buffer, {
          status: 200,
          headers: {
            "content-type": fetched.contentType,
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        });
      }
      if (fetched.kind === "upi") {
        if (order.upi_link !== fetched.upiLink) {
          await db
            .put("orders", {
              ...order,
              upi_link: fetched.upiLink,
              upi_link_is_razorpay: true,
            })
            .catch(() => null);
        }
        const png = await QRCode.toBuffer(fetched.upiLink, {
          width: 420,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#0b0d10", light: "#ffffff" },
        });
        return new Response(png, {
          status: 200,
          headers: {
            "content-type": "image/png",
            "cache-control": "no-store, no-cache, must-revalidate",
          },
        });
      }
    }
    if (order.upi_link) {
      const png = await QRCode.toBuffer(str(order.upi_link), {
        width: 420,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#0b0d10", light: "#ffffff" },
      });
      return new Response(png, {
        status: 200,
        headers: {
          "content-type": "image/png",
          "cache-control": "no-store, no-cache, must-revalidate",
        },
      });
    }
    const site = await db.get("settings", "site");
    const { upiLink } = await buildUpiQrPayload({
      upiId: order.upi_id || site?.contact?.upi_id || "indifunded@upi",
      brandName: site?.brand?.name || "IndiFunded",
      amount: order.amount,
      note: `IndiFunded ${order.plan_name || "Challenge"}`,
    });
    const fallbackPng = await QRCode.toBuffer(upiLink, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0b0d10", light: "#ffffff" },
    });
    return new Response(fallbackPng, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store, no-cache, must-revalidate",
      },
    });
  }

  if ((p = is("GET", "/orders/razorpay/status/:id"))) {
    const order = await db.get("orders", p.id);
    if (!order) fail(404, "Order not found");
    if (order.status === "completed") {
      await provisionAccountForOrder(order).catch(() => null);
      return json({ status: "completed", paid: true });
    }
    const creds = razorpayCreds();
    if (!hasValidRazorpayKeys(creds))
      return json({ status: order.status, paid: false });

    let items = [];
    if (order.razorpay_qr_id) {
      const resp = await fetchRazorpayQrPayments(
        creds,
        order.razorpay_qr_id,
      ).catch(() => null);
      items = Array.isArray(resp?.items) ? resp.items : [];
    }
    if (items.length === 0 && order.razorpay_order_id) {
      const resp = await fetchRazorpayOrderPayments(
        creds,
        order.razorpay_order_id,
      ).catch(() => null);
      items = Array.isArray(resp?.items) ? resp.items : [];
    }

    const captured = items.find((x) => x.status === "captured");
    if (captured) {
      const completedOrder = {
        ...order,
        status: "completed",
        razorpay_payment_id: captured.id,
      };
      await db.put("orders", completedOrder);
      await provisionAccountForOrder(completedOrder).catch(() => null);
      if (order.razorpay_qr_id) {
        await closeRazorpayQr(creds, order.razorpay_qr_id).catch(() => null);
      }
      return json({ status: "completed", paid: true });
    }
    return json({
      status: order.status,
      paid: false,
      ...(order.upi_link
        ? {
            upi_link: order.upi_link,
            upi_link_is_razorpay: Boolean(order.upi_link_is_razorpay),
          }
        : {}),
    });
  }

  if (is("POST", "/orders/razorpay/checkout-order")) {
    const creds = requireRazorpay();
    const b = await body();
    const cust = orderCustomer(b);
    const existingOrderId = str(b.order_id).trim();
    let existingOrder = null;
    if (existingOrderId) {
      const candidate = await db.get("orders", existingOrderId);
      if (
        candidate &&
        candidate.status === "pending_payment" &&
        candidate.customer_email === cust.customer_email
      ) {
        existingOrder = candidate;
      }
    }

    const plan = existingOrder
      ? {
          id: existingOrder.plan_id,
          name: existingOrder.plan_name,
          account_size: existingOrder.plan_account_size,
          product_type: existingOrder.product_type,
          drawdown_mode: existingOrder.drawdown_mode,
          payout_cycle: existingOrder.payout_cycle,
          product_config_snapshot: existingOrder.product_config_snapshot,
        }
      : await resolveOrderProduct(b);
    const pr = existingOrder
      ? {
          final: existingOrder.amount,
          base: existingOrder.base_amount,
          discount: existingOrder.discount_amount,
          ccode: existingOrder.coupon_code,
          rcode: existingOrder.referral_code,
        }
      : await computePricing(plan, b.coupon_code, b.referral_code);

    const paise = Math.round(pr.final * 100);
    if (paise < 100) fail(400, "Amount too low for online payment");
    const orderId = existingOrder ? existingOrder.id : uuid();

    if (existingOrder?.razorpay_order_id) {
      return json({
        order_id: existingOrder.id,
        razorpay_order_id: existingOrder.razorpay_order_id,
        amount: pr.final,
        amount_paise: paise,
        key_id: creds.keyId,
        customer: {
          name: cust.customer_name,
          email: cust.customer_email,
          phone: cust.customer_phone,
        },
        description: `IndiFunded ${plan.name}`,
      });
    }

    let rzo;
    try {
      rzo = await createRazorpayOrder(creds, {
        receiptId: orderId,
        amountPaise: paise,
        currency: "INR",
        notes: {
          order_id: orderId,
          plan: plan.name,
          product_type: plan.product_type,
          kind: "challenge",
          email: cust.customer_email,
        },
      });
    } catch (err) {
      const rzErr = extractRazorpayError(err);
      fail(
        rzErr.statusCode >= 400 && rzErr.statusCode < 500
          ? rzErr.statusCode
          : 502,
        `Razorpay error: ${rzErr.description}`,
      );
    }

    const orderRecord = existingOrder
      ? {
          ...existingOrder,
          payment_method: "razorpay_checkout",
          razorpay_order_id: rzo.id,
          updated_at: now(),
        }
      : {
          id: orderId,
          plan_id: plan.id,
          plan_name: plan.name,
          plan_account_size: plan.account_size,
          product_type: plan.product_type,
          drawdown_mode: plan.drawdown_mode,
          payout_cycle: plan.payout_cycle,
          product_config_snapshot: plan.product_config_snapshot,
          amount: pr.final,
          base_amount: pr.base,
          discount_amount: pr.discount,
          coupon_code: pr.ccode,
          referral_code: pr.rcode,
          currency: "inr",
          payment_method: "razorpay_checkout",
          razorpay_order_id: rzo.id,
          razorpay_payment_id: null,
          ...cust,
          status: "pending_payment",
          created_at: now(),
        };
    await db.put("orders", orderRecord);
    return json({
      order_id: orderId,
      razorpay_order_id: rzo.id,
      amount: pr.final,
      amount_paise: paise,
      key_id: creds.keyId,
      customer: {
        name: cust.customer_name,
        email: cust.customer_email,
        phone: cust.customer_phone,
      },
      description: `IndiFunded ${plan.name}`,
    });
  }

  if (is("POST", "/orders/razorpay/verify")) {
    const b = await body();
    const oid = str(b.razorpay_order_id);
    const pid = str(b.razorpay_payment_id);
    const sig = str(b.razorpay_signature);
    if (!(oid && pid && sig)) fail(400, "Missing payment fields");
    const creds = razorpayCreds();
    if (!creds.keySecret) fail(500, "Razorpay is not configured");
    if (
      !verifyRazorpayPaymentSignature({
        orderId: oid,
        paymentId: pid,
        signature: sig,
        keySecret: creds.keySecret,
      })
    )
      fail(400, "Invalid Razorpay signature");
    const order = await db.findOne(
      "orders",
      (x) => x.razorpay_order_id === oid,
    );
    if (order) {
      const completedOrder = {
        ...order,
        status: "completed",
        razorpay_payment_id: pid,
      };
      await db.put("orders", completedOrder);
      const acct = await provisionAccountForOrder(completedOrder).catch(
        () => null,
      );
      return json({
        status: "completed",
        kind: "order",
        id: order.id,
        account_id: acct?.id || null,
      });
    }
    const reg = await db.findOne(
      "league_registrations",
      (x) => x.razorpay_order_id === oid,
    );
    if (reg) {
      await db.put("league_registrations", {
        ...reg,
        status: "completed",
        razorpay_payment_id: pid,
      });
      return json({ status: "completed", kind: "league", id: reg.id });
    }
    fail(404, "Order not found");
  }

  if (is("POST", "/webhooks/razorpay")) {
    const raw = await request.text();
    const creds = razorpayCreds();
    if (!creds.webhookSecret) fail(400, "Webhook secret not configured");
    const sig = request.headers.get("x-razorpay-signature") || "";
    if (
      !verifyRazorpayWebhookSignature({
        rawBody: raw,
        signature: sig,
        webhookSecret: creds.webhookSecret,
      })
    )
      fail(400, "Invalid signature");
    let evt;
    try {
      evt = JSON.parse(raw);
    } catch {
      fail(400, "Invalid payload");
    }
    const pay = evt?.payload?.payment?.entity || {};
    const qrE = evt?.payload?.qr_code?.entity || {};
    const qrId = qrE.id || pay.qr_code_id;
    let order = null;
    if (qrId)
      order = await db.findOne("orders", (x) => x.razorpay_qr_id === qrId);
    if (!order && pay.order_id)
      order = await db.findOne(
        "orders",
        (x) => x.razorpay_order_id === pay.order_id,
      );
    if (!order && pay.notes?.order_id)
      order = await db.get("orders", str(pay.notes.order_id));
    if (order && order.status !== "completed" && pay.status === "captured") {
      const completedOrder = {
        ...order,
        status: "completed",
        razorpay_payment_id: pay.id,
      };
      await db.put("orders", completedOrder);
      await provisionAccountForOrder(completedOrder).catch(() => null);
    }
    if (!order && pay.status === "captured") {
      let reg = null;
      if (pay.order_id)
        reg = await db.findOne(
          "league_registrations",
          (x) => x.razorpay_order_id === pay.order_id,
        );
      if (!reg && pay.notes?.reg_id)
        reg = await db.get("league_registrations", str(pay.notes.reg_id));
      if (reg && reg.status !== "completed") {
        await db.put("league_registrations", {
          ...reg,
          status: "completed",
          razorpay_payment_id: pay.id,
        });
      }
    }
    return json({ status: "ok" });
  }

  if ((p = is("PATCH", "/orders/:id/status"))) {
    await currentAdmin();
    const status = url.searchParams.get("status") || str((await body()).status);
    if (!["pending_verification", "completed", "rejected"].includes(status))
      fail(400, "Invalid status");
    const o = await db.get("orders", p.id);
    if (!o) fail(404, "Order not found");
    const updatedOrder = { ...o, status };
    await db.put("orders", updatedOrder);
    if (status === "completed") {
      await provisionAccountForOrder(updatedOrder).catch(() => null);
    }
    return json(updatedOrder);
  }
  if ((p = is("DELETE", "/orders/:id"))) {
    await currentAdmin();
    await db.del("orders", p.id);
    return json({ ok: true });
  }
  if (is("GET", "/orders")) {
    await currentAdmin();
    const [orders, allAccts] = await Promise.all([
      db.all("orders"),
      db.all("trader_accounts"),
    ]);
    const acctByOrderId = new Map();
    const acctById = new Map();
    for (const a of allAccts) {
      acctById.set(a.id, a);
      if (a.order_id && !acctByOrderId.has(a.order_id))
        acctByOrderId.set(a.order_id, a);
    }
    const enriched = orders.sort(byDesc("created_at")).map((o) => {
      const linked =
        (o.assigned_account_id && acctById.get(o.assigned_account_id)) ||
        acctByOrderId.get(o.id) ||
        null;
      return linked
        ? {
            ...o,
            assigned_account_id: o.assigned_account_id || linked.id,
            assigned_account_number:
              o.assigned_account_number || linked.account_number,
            assigned_account_status: linked.status,
            assigned_plan_name: o.assigned_plan_name || linked.plan_name,
            automation_enabled: Boolean(linked.automation_enabled ?? true),
          }
        : o;
    });
    return json(enriched);
  }
  if (is("GET", "/admin/stats")) {
    await currentAdmin();
    const [plans, blogs, leads, orders, payouts] = await Promise.all(
      ["plans", "blogs", "leads", "orders", "payout_requests"].map((c) =>
        db.all(c),
      ),
    );
    return json({
      plans: plans.length,
      blogs: blogs.length,
      leads: leads.length,
      orders: orders.length,
      pending_orders: orders.filter((o) => o.status === "pending_verification")
        .length,
      revenue: orders
        .filter((o) => o.status === "completed")
        .reduce((s, o) => s + num(o.amount), 0),
      payout_requests: payouts.length,
      pending_payouts: payouts.filter((x) => x.status === "pending").length,
    });
  }

  const EXPORTABLE_COLLECTIONS = [
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
  ];

  if (is("GET", "/admin/database/export")) {
    await currentAdmin();
    const collections = {};
    const counts = {};
    for (const col of EXPORTABLE_COLLECTIONS) {
      const docs = await db.all(col);
      collections[col] = docs;
      counts[col] = docs.length;
    }
    const siteDoc = await db.get("settings", "site");
    const fpDoc = await db.get("settings", "funding_products");
    const emailCfg = await db.get("settings", "email_config");
    const settingsDocs = [];
    if (siteDoc) settingsDocs.push(siteDoc);
    if (fpDoc) settingsDocs.push(fpDoc);
    if (emailCfg) {
      const { smtp_password: _sp, ...safeEmailCfg } = emailCfg;
      settingsDocs.push(safeEmailCfg);
    }
    collections.settings = settingsDocs;
    counts.settings = settingsDocs.length;
    return json({
      exported_at: now(),
      collections,
      siteConfig: siteDoc || null,
      counts,
    });
  }

  if (is("POST", "/admin/database/restore")) {
    await currentAdmin();
    const b = await body();
    const incomingCols =
      b.collections &&
      typeof b.collections === "object" &&
      !Array.isArray(b.collections)
        ? b.collections
        : {};
    const allowedSet = new Set([...EXPORTABLE_COLLECTIONS, "settings"]);
    let restoredCount = 0;
    for (const [colName, docs] of Object.entries(incomingCols)) {
      if (!allowedSet.has(colName) || !Array.isArray(docs)) continue;
      for (const rawDoc of docs) {
        if (!rawDoc || typeof rawDoc !== "object" || !rawDoc.id) continue;
        if (colName === "settings") {
          const docId = str(rawDoc.id);
          if (docId === "email_config") {
            const existingEmail =
              (await db.get("settings", "email_config")) || {};
            await db.put("settings", {
              ...rawDoc,
              smtp_password: existingEmail.smtp_password || "",
            });
            restoredCount += 1;
          } else if (docId === "site" || docId === "funding_products") {
            const {
              email_config: _ec,
              smtp_password: _sp,
              ...safeSetting
            } = rawDoc;
            await db.put("settings", safeSetting);
            restoredCount += 1;
          }
          continue;
        }
        await db.put(colName, rawDoc);
        if (colName === "users" && rawDoc.login_password && !sb) {
          const existingCred = await db.get(
            "local_credentials",
            str(rawDoc.id),
          );
          if (!existingCred) {
            await db.put("local_credentials", {
              id: str(rawDoc.id),
              email: str(rawDoc.email).toLowerCase(),
              password_hash: hashLocalPassword(str(rawDoc.login_password)),
              created_at: rawDoc.created_at || now(),
              updated_at: now(),
            });
          }
        }
        restoredCount += 1;
      }
    }
    const incomingSite = b.siteConfig || b.site_config;
    if (
      incomingSite &&
      typeof incomingSite === "object" &&
      !Array.isArray(incomingSite)
    ) {
      const {
        email_config: _ec,
        smtp_password: _sp,
        updatedAt: _uAt,
        ...safeSite
      } = incomingSite;
      const oldSite = (await db.get("settings", "site")) || {};
      await db.put("settings", { ...oldSite, ...safeSite, id: "site" });
      restoredCount += 1;
    }
    bumpSync("all");
    return json({
      ok: true,
      restored_count: restoredCount,
      restored_at: now(),
    });
  }

  // Stripe endpoints from the original are not used by the site's pages.
  if (
    is("POST", "/checkout/session") ||
    is("POST", "/webhook/stripe") ||
    (seg[0] === "checkout" && seg[1] === "status")
  ) {
    fail(410, "Card checkout is not available. Please pay via UPI.");
  }

  // ===== Weekly highest payouts =====
  if (is("GET", "/weekly-highest-payouts")) {
    const curated = (await db.all("weekly_payouts"))
      .filter((x) => x.visible)
      .sort(
        (a, b) => num(a.order) - num(b.order) || num(b.amount) - num(a.amount),
      );
    if (curated.length) {
      const seen = new Map();
      for (const r of curated)
        if (!seen.has(r.plan || "")) seen.set(r.plan || "", r);
      return json([...seen.values()]);
    }
    const certs = (await db.all("certificates")).filter((c) => c.visible);
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const group = (rows) => {
      const m = new Map();
      for (const c of [...rows].sort(byNum("amount", -1))) {
        if (!m.has(c.plan))
          m.set(c.plan, {
            trader_name: c.trader_name,
            amount: c.amount,
            plan: c.plan,
            account_size: c.account_size,
            payout_date: c.payout_date,
            image_url: c.image_url,
          });
      }
      return [...m.values()].sort(byNum("amount", -1));
    };
    let rows = group(certs.filter((c) => str(c.created_at) >= since));
    if (!rows.length) rows = group(certs);
    return json(rows);
  }
  const wpFields = certFields;
  if (is("GET", "/admin/weekly-payouts")) {
    await currentAdmin();
    return json(
      (await db.all("weekly_payouts")).sort(
        (a, b) =>
          num(a.order) - num(b.order) ||
          str(b.created_at).localeCompare(str(a.created_at)),
      ),
    );
  }
  if (is("POST", "/admin/weekly-payouts")) {
    await currentAdmin();
    const doc = await db.put("weekly_payouts", {
      id: uuid(),
      ...wpFields(await body()),
      created_at: now(),
    });
    bumpSync("weekly_payouts");
    return json(doc);
  }
  if ((p = is("PUT", "/admin/weekly-payouts/:id"))) {
    await currentAdmin();
    const old = await db.get("weekly_payouts", p.id);
    if (!old) return json(null);
    const doc = await db.put("weekly_payouts", {
      ...old,
      ...wpFields(await body()),
    });
    bumpSync("weekly_payouts");
    return json(doc);
  }
  if ((p = is("DELETE", "/admin/weekly-payouts/:id"))) {
    await currentAdmin();
    await db.del("weekly_payouts", p.id);
    bumpSync("weekly_payouts");
    return json({ ok: true });
  }

  // ===== Trader League =====
  const leagueEnabled = async () =>
    !!(await db.get("system_meta", "league_enabled"))?.value;
  if (is("GET", "/league/config"))
    return json({
      enabled: await leagueEnabled(),
      fee_existing: LEAGUE_FEE_EXISTING,
      fee_new: LEAGUE_FEE_NEW,
    });
  if (is("PUT", "/league/config")) {
    await currentAdmin();
    const enabled = !!(await body()).enabled;
    await db.put("system_meta", {
      id: "league_enabled",
      key: "league_enabled",
      value: enabled,
      updated_at: now(),
    });
    bumpSync("league");
    return json({ enabled });
  }
  if (is("POST", "/league/register")) {
    if (!(await leagueEnabled()))
      fail(403, "Trader League registration is currently closed");
    const b = await body();
    const existing = !!b.is_existing_trader;
    if (!str(b.full_name) || !str(b.phone))
      fail(422, "Name and phone are required");
    const email = requireEmail(b.email);
    if (existing && !str(b.trader_id).trim())
      fail(400, "Trader ID is required for existing traders");
    const amount = existing ? LEAGUE_FEE_EXISTING : LEAGUE_FEE_NEW;
    const reg = {
      id: uuid(),
      full_name: str(b.full_name),
      email,
      phone: str(b.phone),
      is_existing_trader: existing,
      trader_id: str(b.trader_id),
      notes: str(b.notes),
      amount,
      status: "pending_payment",
      razorpay_qr_id: "",
      razorpay_qr_image: "",
      razorpay_order_id: "",
      razorpay_payment_id: "",
      created_at: now(),
    };
    const paise = Math.round(amount * 100);
    const creds = razorpayCreds();
    if (hasValidRazorpayKeys(creds)) {
      try {
        const rzo = await createRazorpayOrder(creds, {
          receiptId: reg.id,
          amountPaise: paise,
          currency: "INR",
          notes: { reg_id: reg.id, email, kind: "league" },
        });
        reg.razorpay_order_id = rzo?.id || "";
        if (reg.razorpay_order_id) {
          await db.put("league_registrations", reg);
          return json({
            registration_id: reg.id,
            razorpay_order_id: reg.razorpay_order_id,
            amount,
            amount_paise: paise,
            key_id: creds.keyId,
            customer: { name: reg.full_name, email, phone: reg.phone },
            description: "IndiFunded Trader League Registration",
            payment_mode: "razorpay_checkout",
          });
        }
      } catch (err) {
        const rzErr = extractRazorpayError(err);
        console.warn(
          `[razorpay] League orders.create failed (${rzErr.statusCode} ${rzErr.code}), falling back to UPI QR:`,
          rzErr.description,
        );
      }
    }
    const site = await db.get("settings", "site");
    const { upiId, upiLink, qrImage } = await buildUpiQrPayload({
      upiId: site?.contact?.upi_id || "indifunded@upi",
      brandName: site?.brand?.name || "IndiFunded",
      amount,
      note: "Trader League",
    });
    reg.razorpay_qr_image = qrImage;
    reg.upi_id = upiId;
    reg.upi_link = upiLink;
    await db.put("league_registrations", reg);
    return json({
      registration_id: reg.id,
      qr_image: qrImage,
      upi_id: upiId,
      upi_link: upiLink,
      amount,
      amount_paise: paise,
      customer: { name: reg.full_name, email, phone: reg.phone },
      description: "IndiFunded Trader League Registration",
      payment_mode: "upi_qr",
    });
  }
  if (is("POST", "/league/confirm-upi")) {
    const b = await body();
    const regId = str(b.registration_id).trim();
    const utr = str(b.utr).trim();
    if (!regId) fail(422, "Registration ID is required");
    if (!utr) fail(422, "UTR / Transaction Reference is required");
    const reg = await db.get("league_registrations", regId);
    if (!reg) fail(404, "Registration not found");
    const updated = {
      ...reg,
      utr,
      payment_method: "upi_qr",
      status: reg.status === "completed" ? "completed" : "pending_verification",
      updated_at: now(),
    };
    await db.put("league_registrations", updated);
    return json({ ok: true, id: updated.id, status: updated.status });
  }
  if ((p = is("GET", "/league/status/:id"))) {
    const reg = await db.get("league_registrations", p.id);
    if (!reg) fail(404, "Registration not found");
    return json({ status: reg.status, amount: reg.amount });
  }
  if (is("GET", "/league/registrations")) {
    await currentAdmin();
    return json(
      (await db.all("league_registrations")).sort(byDesc("created_at")),
    );
  }
  if ((p = is("DELETE", "/league/registrations/:id"))) {
    await currentAdmin();
    await db.del("league_registrations", p.id);
    return json({ ok: true });
  }

  // ===== Certificate AI reader =====
  if (is("POST", "/admin/certificates/analyze")) {
    await currentAdmin();
    const b = await body();
    const d = str(b.data_url);
    if (!d.startsWith("data:image/")) fail(400, "Not a valid image data URL");
    const geminiKey = env("GEMINI_API_KEY").trim();
    const lovableKey = env("LOVABLE_API_KEY").trim();
    const hasGemini = Boolean(geminiKey && !/^MY_/i.test(geminiKey));
    if (!hasGemini && !lovableKey) {
      fail(
        503,
        "AI is not configured. Add GEMINI_API_KEY in Settings > Secrets.",
      );
    }
    const system =
      'You are a receipt/bank-transfer OCR assistant. You will be shown a screenshot of a UPI/bank payout receipt. Extract these fields and return ONLY valid JSON (no markdown fences, no commentary): {"name": "recipient full name", "amount": <number in INR without commas or currency symbol>, "date": "YYYY-MM-DD", "plan": "Starter | Standard | Pro (guess based on amount: <15000 Starter, 15000-30000 Standard, >30000 Pro)", "raw_text": "short summary of what the receipt shows"}. If a field is not visible, use null.';
    let rawOutputText = "";
    if (hasGemini) {
      const m = d.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) fail(400, "Image must be a base64-encoded data URL");
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } },
      });
      const resp = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: [
          {
            role: "user",
            parts: [
              { text: "Extract the fields from this payout receipt." },
              { inlineData: { mimeType: m[1], data: m[2] } },
            ],
          },
        ],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
        },
      });
      rawOutputText = str(resp.text);
    } else {
      const resp = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: system },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Extract the fields from this payout receipt.",
                  },
                  { type: "image_url", image_url: { url: d } },
                ],
              },
            ],
          }),
        },
      );
      if (resp.status === 429)
        fail(429, "AI is busy, please try again in a moment.");
      if (resp.status === 402)
        fail(402, "AI credits are used up. Add credits in workspace settings.");
      if (!resp.ok)
        fail(502, `AI analysis failed: ${(await resp.text()).slice(0, 200)}`);
      rawOutputText = str((await resp.json()).choices?.[0]?.message?.content);
    }
    const text = rawOutputText.replace(/^```(?:json)?\s*|\s*```$/gm, "").trim();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m)
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          parsed = null;
        }
    }
    if (!parsed)
      return json({
        name: null,
        amount: null,
        date: null,
        plan: null,
        raw_text: text.slice(0, 500),
      });
    return json({
      name: parsed.name ?? null,
      amount: parsed.amount ?? null,
      date: parsed.date ?? null,
      plan: parsed.plan ?? null,
      raw_text: parsed.raw_text || "",
    });
  }

  // ===== Coupons =====
  if (is("GET", "/coupons")) {
    await currentAdmin();
    return json((await db.all("coupons")).sort(byDesc("created_at")));
  }
  if (is("POST", "/coupons")) {
    await currentAdmin();
    const f = couponFields(await body());
    if (!f.code) fail(400, "Code required");
    if (await db.findOne("coupons", (x) => x.code === f.code))
      fail(400, "Coupon code already exists");
    return json(
      await db.put("coupons", {
        ...f,
        id: uuid(),
        used_count: 0,
        created_at: now(),
      }),
    );
  }
  if ((p = is("PUT", "/coupons/:id"))) {
    await currentAdmin();
    const old = await db.get("coupons", p.id);
    if (!old) fail(404, "Coupon not found");
    return json(
      await db.put("coupons", { ...old, ...couponFields(await body()) }),
    );
  }
  if ((p = is("DELETE", "/coupons/:id"))) {
    await currentAdmin();
    await db.del("coupons", p.id);
    return json({ ok: true });
  }
  if (is("POST", "/coupons/validate")) {
    const b = await body();
    const code = str(b.code).trim().toUpperCase();
    const c = await db.findOne("coupons", (x) => x.code === code);
    if (!c || c.active === false) fail(404, "Invalid or inactive coupon");
    if (
      c.max_uses !== null &&
      c.max_uses !== undefined &&
      (c.used_count || 0) >= c.max_uses
    )
      fail(400, "Coupon usage limit reached");
    if (c.expires_at) {
      const exp = new Date(c.expires_at);
      if (!isNaN(exp.getTime()) && exp < new Date())
        fail(400, "Coupon has expired");
    }
    const amount = num(b.amount);
    const discount = Math.round(amount * num(c.discount_percent)) / 100;
    return json({
      code,
      discount_percent: c.discount_percent,
      discount_amount: discount,
      final_amount: Math.max(0, Math.round((amount - discount) * 100) / 100),
      description: c.description || "",
    });
  }

  // ===== Leaderboard =====
  if (is("GET", "/leaderboard")) {
    const limit = Math.min(int(url.searchParams.get("limit"), 20) || 20, 100);
    return json(
      (await db.all("leaderboard"))
        .sort(byNum("total_payout", -1))
        .slice(0, limit),
    );
  }
  if (is("POST", "/leaderboard")) {
    await currentAdmin();
    const doc = await db.put("leaderboard", {
      ...leaderboardFields(await body()),
      id: uuid(),
      created_at: now(),
    });
    bumpSync("leaderboard");
    return json(doc);
  }
  if ((p = is("PUT", "/leaderboard/:id"))) {
    await currentAdmin();
    const old = await db.get("leaderboard", p.id);
    if (!old) fail(404, "Entry not found");
    const doc = await db.put("leaderboard", {
      ...old,
      ...leaderboardFields(await body()),
    });
    bumpSync("leaderboard");
    return json(doc);
  }
  if ((p = is("DELETE", "/leaderboard/:id"))) {
    await currentAdmin();
    await db.del("leaderboard", p.id);
    bumpSync("leaderboard");
    return json({ ok: true });
  }

  // ===== Referrals =====
  if (is("POST", "/referrals")) {
    const b = await body();
    if (!str(b.name)) fail(422, "name is required");
    const email = requireEmail(b.email);
    const existing = await db.findOne("referrals", (x) => x.email === email);
    const publicView = (r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      referrals_count: r.referrals_count || 0,
      earnings: r.earnings || 0,
      created_at: r.created_at,
    });
    if (existing) return json(publicView(existing));
    const all = await db.all("referrals");
    const base =
      str(b.name)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6) || "TRADE";
    let code = "";
    for (let i = 0; i < 5; i++) {
      code = base + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
      if (!all.some((x) => x.code === code)) break;
    }
    const doc = {
      id: uuid(),
      code,
      name: str(b.name),
      email,
      phone: str(b.phone),
      referrals_count: 0,
      earnings: 0,
      created_at: now(),
    };
    await db.put("referrals", doc);
    return json(publicView(doc));
  }
  if ((p = is("GET", "/referrals/:code"))) {
    const code = p.code.trim().toUpperCase();
    const r = await db.findOne("referrals", (x) => x.code === code);
    if (!r) fail(404, "Referral code not found");
    return json({
      code: r.code,
      name: r.name,
      referrals_count: r.referrals_count || 0,
    });
  }
  if (is("GET", "/admin/referrals")) {
    await currentAdmin();
    return json((await db.all("referrals")).sort(byDesc("created_at")));
  }
  if ((p = is("DELETE", "/admin/referrals/:id"))) {
    await currentAdmin();
    await db.del("referrals", p.id);
    return json({ ok: true });
  }

  fail(404, "Not Found");
}
