# CompTIA Trifecta Quiz

A practice quiz app for CompTIA A+, Network+, and Security+ certifications with authentication, quiz history tracking, and paid Pro tier via Stripe.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/comptia-quiz run dev` — run the quiz app frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts exec tsx src/seed-products.ts` — create Stripe products/prices
- Required env: `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19, Vite 7, Tailwind v4, shadcn/ui
- Auth: Clerk (Replit-managed tenant)
- API: Express 5, OpenAPI contract-first with Orval codegen
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Payments: Stripe (direct SDK + `stripe-replit-sync` with API fallback)
- API codegen: Orval
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/comptia-quiz` — React quiz app frontend
- `artifacts/api-server` — Express API server with Clerk + Stripe routes
- `lib/db/src/schema/` — Drizzle schema source of truth (quiz_results, stripe_customers)
- `lib/api-spec/openapi.yaml` — OpenAPI contract for all API endpoints
- `lib/api-client-react/src/generated/` — Auto-generated React Query hooks + Zod schemas

## Architecture decisions

- Answer randomization uses Fisher-Yates shuffle at runtime; original questions keep `correctIndex` metadata, options array is permuted per-session
- Stripe storage falls back to direct Stripe API when `stripe-replit-sync` DB tables are unavailable
- Webhook route registered BEFORE `express.json()` to preserve raw Buffer body for signature verification
- Clerk auth state drives conditional features (quiz history, subscription check)
- OpenAPI-first: all endpoints defined in YAML, then codegen generates client hooks

## Product

- Free tier: 270 practice questions, timed quizzes (60s/question), pass/fail scoring, weak area tracking
- Pro tier ($9.99/mo or $79.99/yr): unlimited retakes, detailed analytics, custom study plans, ad-free
- Auth: Clerk sign-in/sign-up with Google OAuth
- Payments: Stripe checkout with billing portal for subscription management

## User preferences

- User wants paid features, not "free forever"
- Dark theme with red accent colors
- Stripe keys provided directly (not via Replit integration)

## Gotchas

- `stripe-replit-sync` may fail to create its schema tables on first run; the app falls back to direct Stripe API
- Run `pnpm --filter @workspace/api-spec run codegen` after changing OpenAPI spec
- The `quiz-results` table must exist before API server routes work; run `pnpm --filter @workspace/db run push`
- `requireAuth` middleware uses `getAuth(req)` from `@clerk/express` and stores `userId` on `req` via cast
