# IndiFunded

Prop-trading funding site: TanStack Start (React) frontend, `/api/*` backend in `src/server/api-handler.js`,
data in **Supabase**, hosted on **Render**.

## Local development

```sh
cp .env.example .env     # fill in the Supabase keys
npm i
npm run dev
```

Check the Supabase connection (read-only): `npm run check:supabase`

## Deploy (Render + Supabase)

See **SETUP_GUIDE.md** (step by step), `render.yaml` (Render blueprint) and
`supabase/migrations/` (database schema). In production the API refuses to run without
`SUPABASE_URL` and `SUPABASE_SECRET_KEY` (override only with `ALLOW_MEMORY_STORE=true`).
Never commit real keys; set them in the Render dashboard.
