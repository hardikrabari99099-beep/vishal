## Architecture (migrated IndiFunded app)

- Pages are the original JSX components in `src/views/` and `src/components/`, mounted by thin TanStack route files in `src/routes/`; keeps the ported UI unchanged.
- Original pages import routing from `@/lib/router-compat` (react-router-style API over TanStack Router); never add react-router-dom.
- All app data calls go through axios `api` (`src/lib/api.js`) to the catch-all server route `src/routes/api/$.ts`, which dispatches to `src/server/api-handler.js` (port of the old FastAPI backend); keeps the old endpoint contract, including `/api/webhooks/razorpay`.
- Data is stored as JSON documents in `public.docs` (collection + id), accessed only server-side with the service role; RLS has no client policies by design.
- Admin access comes only from `public.user_roles` (role `admin`), checked server-side per request.
- Homepage section visibility and curated review videos use the existing site-settings document and admin editor; no parallel CMS, so content saves keep the established permissions and persistence path.
- Review-media parsing lives in a shared browser-safe module; only validated HTTPS video/provider links render, so arbitrary URLs never become executable player sources.
- AI calls go through `@lovable.dev/ai-gateway` in server-only modules under `src/server/` (e.g. `insights.ts`), dynamically imported by the API handler; prompts and keys never reach the browser.
- "Our Traders" video cards reuse the site-settings `video_reviews` items (extra fields: country, flag, rewards, style, views); the home page shows quotes-only reviews to avoid showing the same videos twice.
- Trust & Transparency content (stats, company IDs, documents, support team, payout proofs, certificate/award QR codes, stories) lives in the site-settings `trust` block; it is public, so payout proofs store only the UTR's last 4 characters (`src/lib/trust.js`).
- Page 3D visuals come from one lazy `Showcase3D` slot (three.js loads only in the browser after idle, pauses off-screen, hidden for reduced motion); `src/lib/scene-for-path.js` maps each page to its own procedural scene so models don't repeat.
- Trader-dashboard screens without a backend feed (terminal, trade book, positions, orders, evaluation, risk, calendar, funded, KYC, notifications, support) render deterministic sample data from `src/lib/demo-trading.js` with a visible "Sample data" badge and local-only actions, so demo values are never presented as real.

## Deployment

- Hosted on Render (`render.yaml`); data lives in Supabase (`supabase/migrations/`). Build: `npm run build:render`, start: `npm run start:render`.
- Secrets go only in the Render dashboard or a local `.env` (git-ignored); never commit keys.
