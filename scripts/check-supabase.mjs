#!/usr/bin/env node
// IndiFunded -> Supabase connection check. READ-ONLY: it never writes or deletes anything.
//
// Run from the project folder:   node scripts/check-supabase.mjs
// It reads your settings from the environment or from a local ".env" file.
// It NEVER prints your keys.

import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = path.resolve(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (k && v && process.env[k] === undefined) process.env[k] = v;
    }
  }
}
loadDotEnv();

const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const secret =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";
const jwksUrl =
  process.env.SUPABASE_JWKS_URL ||
  (url ? `${url}/auth/v1/.well-known/jwks.json` : "");

let failures = 0;
let warnings = 0;
const ok = (m) => console.log(`  [PASS] ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  [FAIL] ${m}`);
};
const warn = (m) => {
  warnings++;
  console.log(`  [WARN] ${m}`);
};

function keyKind(k) {
  if (!k) return "missing";
  if (k.startsWith("sb_secret_")) return "secret key (sb_secret_...)";
  if (k.startsWith("sb_publishable_"))
    return "publishable key (sb_publishable_...)";
  if (k.startsWith("eyJ")) return "legacy JWT key";
  return "NOT a Supabase key (looks like a placeholder)";
}

async function call(pathAndQuery, apikey, extraHeaders = {}) {
  const headers = { apikey, ...extraHeaders };
  // New-style keys are opaque (not JWTs), so they go in "apikey" only.
  if (apikey.startsWith("eyJ")) headers.Authorization = `Bearer ${apikey}`;
  const res = await fetch(`${url}${pathAndQuery}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

console.log("\nIndiFunded - Supabase connection check\n");

console.log("1) Settings found");
console.log(`  SUPABASE_URL              : ${url ? "set" : "MISSING"}`);
console.log(`  SUPABASE_PUBLISHABLE_KEY  : ${keyKind(publishable)}`);
console.log(`  SUPABASE_SECRET_KEY       : ${keyKind(secret)}`);
console.log(`  SUPABASE_JWKS_URL         : ${jwksUrl ? "set" : "MISSING"}`);

if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
  bad("SUPABASE_URL should look like https://xxxxxxxx.supabase.co");
}
if (
  !publishable.startsWith("sb_publishable_") &&
  !publishable.startsWith("eyJ")
)
  bad("SUPABASE_PUBLISHABLE_KEY is missing or not a Supabase key.");
if (secret.startsWith("sb_publishable_"))
  bad(
    "SUPABASE_SECRET_KEY holds the PUBLISHABLE key. The server needs the secret key (sb_secret_...).",
  );
else if (!secret.startsWith("sb_secret_") && !secret.startsWith("eyJ"))
  bad(
    "SUPABASE_SECRET_KEY is missing or is still a placeholder. Paste the real secret key from the Supabase dashboard (Project Settings > API Keys).",
  );
if (failures) {
  console.log(
    "\nFix the settings above and run this check again. (Nothing was sent to Supabase.)\n",
  );
  process.exit(1);
}

try {
  console.log("\n2) Can we reach your Supabase project?");
  const a = await call("/auth/v1/settings", publishable);
  if (a.res.status === 200)
    ok("Project URL reachable and publishable key accepted.");
  else
    bad(
      `Auth service answered HTTP ${a.res.status}. Check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.`,
    );

  console.log("\n3) Login-token verification keys (JWKS)");
  try {
    const j = await fetch(jwksUrl, { signal: AbortSignal.timeout(15000) });
    const jb = await j.json().catch(() => null);
    if (j.ok && Array.isArray(jb?.keys)) {
      if (jb.keys.length)
        ok(`JWKS reachable (${jb.keys.length} signing key(s)).`);
      else
        warn(
          "JWKS reachable but empty (project may still use the legacy shared secret). The app verifies logins through Supabase Auth, so this is not blocking.",
        );
    } else bad(`JWKS URL answered HTTP ${j.status}.`);
  } catch (e) {
    bad(`JWKS URL not reachable: ${e.message}`);
  }

  console.log("\n4) Server access with the SECRET key (tables must exist)");
  let docsCount = null;
  for (const table of ["docs", "user_roles"]) {
    const r = await call(`/rest/v1/${table}?select=*&limit=1`, secret, {
      Prefer: "count=exact",
      Range: "0-0",
    });
    if (r.res.status === 200 || r.res.status === 206) {
      ok(`Table public.${table} exists and the secret key can read it.`);
      if (table === "docs") {
        const cr = r.res.headers.get("content-range") || "";
        const m = cr.match(/\/(\d+|\*)$/);
        if (m && m[1] !== "*") docsCount = Number(m[1]);
      }
    } else if (
      r.res.status === 404 ||
      r.body?.code === "PGRST205" ||
      r.body?.code === "42P01"
    ) {
      bad(
        `Table public.${table} does NOT exist yet. Run supabase/migrations/20261123000000_indifunded_core_schema.sql in the Supabase SQL Editor.`,
      );
    } else if (r.res.status === 401 || r.res.status === 403) {
      bad(
        `Supabase rejected the secret key for ${table} (HTTP ${r.res.status}). Re-copy the secret key; make sure it is the SECRET key and not the publishable one.`,
      );
    } else bad(`Unexpected answer for ${table}: HTTP ${r.res.status}.`);
  }
  if (docsCount !== null) {
    console.log(`  Documents currently stored in public.docs: ${docsCount}`);
    if (docsCount === 0)
      warn(
        "The documents table is empty. Plans, coupons and blogs will be empty until you load starter content (supabase/seed/starter_content.sql) or restore a backup.",
      );
  }

  console.log(
    "\n5) Privacy check: the PUBLIC key must NOT be able to read your data",
  );
  const pub = await call(
    "/rest/v1/docs?select=collection&limit=1",
    publishable,
  );
  if ([401, 403, 404].includes(pub.res.status))
    ok(
      `Public key is blocked from public.docs (HTTP ${pub.res.status}). Good.`,
    );
  else if (
    pub.res.status === 200 &&
    Array.isArray(pub.body) &&
    pub.body.length === 0
  )
    warn(
      "Public key got an empty answer (RLS filtering). Safe, but run the migration again so browser access is fully revoked.",
    );
  else if (pub.res.status === 200)
    bad(
      "DANGER: the public key can READ your documents table. Run the migration file to lock it down BEFORE going live.",
    );
  else warn(`Public key check returned HTTP ${pub.res.status}.`);
} catch (e) {
  bad(
    `Could not complete the check: ${e.message}. (Is the internet reachable from this computer?)`,
  );
}

console.log(
  "\n" +
    (failures
      ? `RESULT: ${failures} problem(s) found. See [FAIL] lines above.`
      : `RESULT: all checks passed${warnings ? ` (${warnings} warning(s))` : ""}.`) +
    "\n",
);
process.exit(failures ? 1 : 0);
