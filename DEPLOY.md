# Deploy — Trifecta Quiz (Vercel, $0)

Replit is gone: `.replit`, `.replitignore`, and `replit.md` were deleted.
The app now deploys from this repo to Vercel (frontend) + a serverless
Express wrapper (API). No Vercel login has been performed yet — the
owner logs in himself (Google SSO + Authenticator 2FA).

## 1. Push to GitHub, connect to Vercel

```bash
git push origin main   # repo: github.com/xandroinc-web/Comptia-certification-Prep-1
```

In Vercel: import the repo. Build settings (also in `vercel.json`):

- Build command: `pnpm --filter @workspace/comptia-quiz run build`
- Output directory: `artifacts/comptia-quiz/dist/public`
- Install command: `pnpm install`

## 2. Environment variables (Vercel dashboard)

Frontend + API share the project; set all of these:

| Var | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key — safe for the browser bundle |
| `SUPABASE_URL` | Same Supabase project URL (server) |
| `SUPABASE_ANON_KEY` | Same Supabase anon key (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key — **server-only, never in the browser** |
| `DATABASE_URL` | Postgres connection string (Supabase free tier, or any hosted Postgres) |
| `STRIPE_SECRET_KEY` | Stripe **live** secret key (test key until go-live) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for `https://<your-domain>/api/stripe/webhook` |
| `ADMIN_USER_IDS` | Owner's Supabase user id (UUID, comma-separated; add a break-glass second admin) |
| `QUESTION_BANK_DIR` | Optional: `/var/task/artifacts/comptia-quiz/src/data` |

Auth is Supabase Auth (Nov 14 2026 migration from Clerk). Sign-up uses
email + password; email confirmation is on by default in Supabase, so a
new account must click the confirmation link before it can sign in.
Set the Supabase Auth **Site URL** to the production domain
(`https://trifecta-quiz.vercel.app`) so confirmation / password-reset
links return to the app. Google sign-in is not yet configured — enable
the Google provider in Supabase Auth settings to add it.

Run `pnpm --filter @workspace/db push` once against the production
`DATABASE_URL` to create the tables (quiz_sessions, entitlements,
free_usage, quiz_results, stripe tables).

## 3. API hosting — two options

**A. Vercel serverless (default, `api/index.ts`).** The wrapper imports
the Express app (`artifacts/api-server/src/app.ts` — no `listen()`, no
migrations). `vercel.json` ships the question bank with the function
via `includeFiles`. **This is unproven and the single biggest deploy
risk** — see the header comment in `api/index.ts`. Smoke-test
`/api/healthz` and `GET /api/quiz/questions?exam=A%2B&mode=fast`
immediately after the first deploy.

**B. Render free tier (fallback).** Run the api-server as a long-lived
service (`pnpm --filter @workspace/api-server run build && run start`,
`QUESTION_BANK_DIR` set to the repo checkout), then change the
`/api/*` rewrite in `vercel.json` to the Render URL. Switch to this if
the wrapper fails its first smoke test.

## 4. Stripe

- Create the products first (or run the seed script with live keys):
  "CompTIA Pro" $9.99/mo and $79.99/yr.
- Create the webhook endpoint in the Stripe dashboard pointing at
  `/api/stripe/webhook` and paste its signing secret into
  `STRIPE_WEBHOOK_SECRET`. Without it, paid subscriptions never grant
  Pro.

## 5. Go-live checklist (owner)

- [ ] Supabase Auth configured (Site URL = production domain); keys in Vercel
- [ ] Live Stripe keys + webhook secret in Vercel
- [ ] Production `DATABASE_URL` set; `db push` run against it
- [ ] First deploy smoke-tested: home page, sign-in, one anonymous
      fast quiz, one Tier 1 exam start, `/api/products-with-prices`
- [ ] Replit deployment turned off only after Vercel is proven live

## Local dev

```bash
pnpm --filter @workspace/db push          # create tables in local test DB
pnpm --filter @workspace/api-server run dev   # :8081 (sources artifacts/api-server/.env.local)
pnpm --filter @workspace/comptia-quiz run dev # :3000, proxies /api to :8081
```
