#!/usr/bin/env node
// Build-time safety guard (runs before the Render build).
// 1) Stops the build if a SECRET could be baked into the public website files.
// 2) Stops the build if the public Supabase settings the website needs are missing.
// Anything starting with VITE_ is copied into the website that visitors download,
// so only public values (URL + publishable key) may ever use that prefix.

const env = process.env;
const problems = [];

const secrets = [
  env.SUPABASE_SECRET_KEY,
  env.SUPABASE_SERVICE_ROLE_KEY,
  env.RAZORPAY_KEY_SECRET,
  env.RAZORPAY_WEBHOOK_SECRET,
  env.ADMIN_SESSION_SECRET,
  env.ADMIN_PASSWORD,
].filter((v) => v && v.length >= 8);

function jwtRole(v) {
  try {
    const part = v.split(".")[1];
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")).role;
  } catch {
    return null;
  }
}

for (const [name, value] of Object.entries(env)) {
  if (!name.startsWith("VITE_") || !value) continue;
  if (/SECRET|SERVICE_ROLE|PASSWORD|PRIVATE/i.test(name))
    problems.push(
      `${name}: names containing SECRET/SERVICE_ROLE/PASSWORD must not start with VITE_ (it would be published in the website).`,
    );
  if (value.startsWith("sb_secret_"))
    problems.push(`${name}: contains a Supabase SECRET key.`);
  if (value.startsWith("eyJ") && jwtRole(value) === "service_role")
    problems.push(`${name}: contains a Supabase service_role key.`);
  if (secrets.includes(value))
    problems.push(`${name}: has the same value as a server-only secret.`);
}

if (!env.VITE_SUPABASE_URL)
  problems.push(
    "VITE_SUPABASE_URL is not set (public project URL; needed so sign-in works).",
  );
if (!env.VITE_SUPABASE_PUBLISHABLE_KEY)
  problems.push(
    "VITE_SUPABASE_PUBLISHABLE_KEY is not set (the PUBLISHABLE key; needed so sign-in works).",
  );
else if (!/^(sb_publishable_|eyJ)/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY))
  problems.push(
    "VITE_SUPABASE_PUBLISHABLE_KEY does not look like a Supabase publishable key.",
  );

if (problems.length) {
  console.error(
    "\nBUILD STOPPED - please fix these settings in the Render dashboard (Environment tab):\n",
  );
  for (const p of problems) console.error("  - " + p);
  console.error("");
  process.exit(1);
}
console.log(
  "Build environment check passed (no secrets in VITE_ variables; public Supabase settings present).",
);
