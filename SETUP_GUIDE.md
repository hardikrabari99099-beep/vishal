# IndiFunded: Supabase + Render setup guide (plain language)

You do **not** need to write code. Follow the steps in order. Anything marked
**[YOU]** is something only you can do (it needs your passwords/keys).

> **Golden rule:** the *Secret key* (`sb_secret_...`) is like the master password to your
> database. Type it only into the **Render dashboard** or a local **.env** file.
> Never paste it into chat, GitHub, or any file that is uploaded.

---

## Step 1. Create the database tables in Supabase  **[YOU]**

This only **adds** two tables (`docs`, `user_roles`). It cannot delete or overwrite anything,
and it is safe to run twice.

1. Open https://supabase.com/dashboard and open your project.
2. Left menu → **SQL Editor** → **New query**.
3. Open the file `supabase/migrations/20261123000000_indifunded_core_schema.sql`
   from this project, copy **everything**, paste it into the editor, click **Run**.
4. You should see **"Success. No rows returned"**.

### Step 1b (optional). Load the starter website content  **[YOU]**

Adds the 5 challenge plans, 3 coupons, 1 certificate and 3 blog posts. It never
overwrites anything that already exists. Skip this if you will restore your own backup instead.

Same method, using `supabase/seed/starter_content.sql`.

## Step 2. Get your Secret key  **[YOU]**

Supabase dashboard → **Project Settings → API Keys** → **Secret keys** → copy the key that
starts with `sb_secret_`. Keep it private.

## Step 3. Test the connection from your own computer  **[YOU]**

(Optional but recommended, it proves the keys and tables work *before* going live.)

1. Install Node.js (https://nodejs.org, the "LTS" button) if you don't have it.
2. In the project folder, copy `.env.example` to a new file named `.env` and fill in the
   Supabase lines (URL, publishable key, secret key).
3. Open a terminal in the project folder and run:  `node scripts/check-supabase.mjs`
4. Every line should say **[PASS]**. It only *reads*; it never changes data and never prints your keys.

## Step 4. Put the code on GitHub

Upload the project **without** the `.env` file. A `.gitignore` file is included and already
blocks `.env`, so normal Git/GitHub Desktop use will skip it automatically.

## Step 5. Deploy on Render  **[YOU]**

1. https://dashboard.render.com → **New → Blueprint** → choose your GitHub repo.
   Render reads `render.yaml` and pre-fills everything.
2. When it asks for the secret values, enter:
   | Name | What to paste |
   |---|---|
   | `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY` | the **publishable** key (same value in both) |
   | `SUPABASE_SECRET_KEY` | the **secret** key |
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | your **existing** Razorpay values, unchanged |
   | Email / AI / admin items | only the ones you already use today |
3. Click **Apply / Deploy**. The build checks your settings first and stops with a clear message if
   a secret was accidentally placed where the public website could see it.

## Step 6. Check the live site  **[YOU]**

Open these in your browser (replace with your Render address):

- `https://YOUR-SITE.onrender.com/api/health` → should show `"ok": true`
- `https://YOUR-SITE.onrender.com/api/health/db` → should show `"ok": true` and `"storage": "supabase"`.
  If it shows a `hint`, it tells you what to fix (e.g. `schema_missing` = repeat Step 1).

Then do a real test: sign up a new trader, log in, open the dashboard, and place a small
test purchase through Razorpay.

## Step 7. Razorpay webhook  **[YOU]**

In the Razorpay dashboard, set the webhook URL to
`https://YOUR-SITE.onrender.com/api/webhooks/razorpay` using the **same webhook secret** you
put in Render. (If your domain changes, update this.)

---

### If something looks wrong
- Site shows "Service temporarily unavailable: database is not configured" → the Supabase
  settings in Render are missing or wrong; check `/api/health/db`.
- Build stops with "BUILD STOPPED" → read the lines under it; they name the setting to fix.
- Nobody can log in right after switching → the old accounts live in your *old* database; see
  "Moving existing data" in the engineering report.
