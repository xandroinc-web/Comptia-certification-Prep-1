/**
 * Vercel serverless wrapper for the Express API.
 *
 * The api-server is a long-lived Express app (`src/index.ts` calls
 * `app.listen()` and runs Stripe migrations on boot), which does NOT
 * fit the serverless model directly. This wrapper imports only the
 * Express `app` (`src/app.ts` — no listen, no migrations) and hands
 * it to Vercel as the request handler; an Express app is a valid
 * `(req, res) => void` handler.
 *
 * Question bank: `src/lib/questionBank.ts` reads
 * `artifacts/comptia-quiz/src/data/exam-bank.json` (+ meta +
 * hellmode-bank.ts) from the repo tree at runtime. The
 * `vercel.json` `functions.includeFiles` entry ships that directory
 * with this function; `QUESTION_BANK_DIR` can also be set in the
 * Vercel dashboard to `/var/task/artifacts/comptia-quiz/src/data`
 * as a belt-and-braces override.
 *
 * ⚠️ BIGGEST DEPLOY RISK — this wrapper is unproven on Vercel and
 * was NOT deployed as part of this task (no Vercel login was
 * attempted). Specific uncertainties:
 *  1. Vercel's bundler (nft) must trace the import from `api/` into
 *     `artifacts/api-server/src/**` plus the pnpm workspace links
 *     (`@workspace/db`, `@workspace/api-zod`) — if it misses a file,
 *     the function fails at cold start.
 *  2. `questionBank.ts` dynamically imports `hellmode-bank.ts` with
 *     Node type-stripping; if the Vercel Node runtime is older than
 *     22.18 the import fails and Tier 3 silently falls back to the
 *     tier-3 JSON bank (by design — see loadHellMode).
 *  3. Cold starts parse the ~810-question bank JSON on first hit;
 *     the Hobby 10s execution limit should still be comfortable, but
 *     the first /api call after a deploy will be slow.
 *  4. The Supabase + Stripe env vars must all be set in Vercel
 *     (see DEPLOY.md); the Stripe webhook needs its own public URL.
 *
 * ALTERNATIVE (safer, still $0): keep the frontend on Vercel and run
 * the api-server as a long-lived service on Render's free tier
 * (`pnpm --filter @workspace/api-server run build && run start`,
 * with QUESTION_BANK_DIR pointed at a checkout of the repo), then
 * point the Vercel `/api/*` rewrite at the Render URL instead of
 * `/api/index`. If the wrapper fails its first smoke test on Vercel,
 * switch to Render rather than debugging the bundle.
 */
// NOTE: dynamic import() is required here. The api-server package is ESM
// ("type": "module"), but this wrapper compiles to CommonJS on Vercel —
// require() cannot load an ES Module (ERR_REQUIRE_ESM), so the app is
// loaded once via import() and reused across requests.
const appPromise = import("../artifacts/api-server/src/app.js").then(
  (m) => m.default
);

export default async function handler(req: any, res: any) {
  const app = await appPromise;
  return app(req, res);
}
