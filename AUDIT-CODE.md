# Trifecta Quiz — Code Audit (static analysis)

**Repo:** `~/workspace/trifecta-quiz` (cloned from `github.com/xandroinc-web/Comptia-certification-Prep-1`)
**Date:** 2026-11-12
**Method:** read-only static analysis — no files modified, no dependencies installed, no builds run.
**Companion:** the live audit at `~/workspace/your_files/trifecta-quiz-audit-report.md` (browser-tested Nov 12, 2026). This report verifies each live finding against the source and adds what the browser could not see.

**Headline:** the live audit's verdict stands, and the code explains *why* every flaw exists. Two surprises the browser could not see: (1) the admin panel and the Stripe/API back end are **real and substantial** — the app is not frontend-only; (2) the tier exams are **never saved server-side at all**, which is worse than the live audit assumed.

---

## 1. Question bank size — 270, 810, 820, or 1090?

There are **two live banks**, and that is the whole contradiction.

| Bank | File | Size | Used by |
|---|---|---|---|
| Quick bank | `artifacts/comptia-quiz/src/data/questions.ts` | **270** (90 A+ / 90 Network+ / 90 Security+) | Fast (15Q), Full (30Q), Weak-area, Topic, Simulation modes |
| Tier bank | `artifacts/comptia-quiz/src/data/exam-bank.json` | **270 + 270 + 270 + 10 bonus = 820** objects | Tier 1 / Tier 2 exams (+ bonus round) |
| HellMode bank | `artifacts/comptia-quiz/src/data/hellmode-bank.ts` | **270** (45 families × 6 cases, 90/exam) | Tier 3 exam (replaces tier3 JSON) |

Verified counts (`exam-bank.json`): tier1 ids 1–270, tier2 ids 271–540, tier3 ids 541–810, bonus 10 ids. **Unique question texts are only 681 of 810** (224/238/237 per tier) — ~129 duplicate texts inside the tiers. Cross-tier overlap is small (6/9/3 shared texts).

Where "810 QUESTIONS" comes from — two places:
- Hardcoded hero string: `artifacts/comptia-quiz/src/pages/HomePage.tsx:364` — `"810 Questions"`.
- `allTiersQuestionCount()` — `artifacts/comptia-quiz/src/data/exam-bank.ts:261` — sums raw `tier1 + tier2 + tier3` = 810.

The number is **accidentally right for served tier questions** (270 × 3) but wrong as a total: it counts the **dead** `tier3` JSON (never served — `getTierQuestions(3)` returns the HellMode bank instead, `exam-bank.ts:212`), counts ~129 duplicate texts, and excludes the bonus 10 and the separate 270-question quick bank. The other number the UI shows, "90 questions per exam (270 total)", comes from `EXAM_COUNTS` — `data/questions.ts:1789-1794`.

More bank facts that explain live findings:
- **Tier 2 "Medium" is fake difficulty.** `applyMediumScenario` (`exam-bank.ts:182-193`) just prepends boilerplate — *"Applied constraint: a technician must preserve the stated requirement while changing only the affected layer…"* — to the question text. `getTierAsQuestions` (`exam-bank.ts:224-236`) forces Tier 1 to `"easy"` and Tier 2 to `"medium"` regardless of content.
- **`toQuestion()` hardcodes `category: "A+"` for every tier question** (`exam-bank.ts:213`). That is the root cause of the wrong topic tags (a Network+ question labelled A+, weak-area analysis built on wrong tags).
- **The port-number options defect is generated in code.** `enhanceDistractors` (`exam-bank.ts:155-180`) replaces all three distractors of "definition questions" with random picks from a global pool of correct answers — so a question asking for port *numbers* gets protocol *names* as options.
- **Difficulty in `questions.ts` is keyword heuristics, not curation.** `assignDifficulties` (`data/questions.ts:72-108`) scores each question by marker words, then splits each exam into exact terciles: 30 easy / 30 medium / 30 hard. No question has a curated difficulty.
- **HellMode is the best content in the repo.** 45 scenario families (19 A+ / 16 Network+ / 16 Security+, sliced to 15 each) × 6 evidence cases = 270 questions, with runtime validation (`hellmode-bank.ts`, `validateBank`) enforcing exactly 270, 90/exam, unique prompts, 4 distinct options, and questions ≥120 chars ending in `?`. The evidence strings are real scenario material (Kerberos clock skew, SPN duplicates, DHCP scope changes, NTFS deny ACEs). Still single-select MCQ — see §8.

---

## 2. Score formula and pass thresholds — four standards in code

Quoted from `artifacts/comptia-quiz/src/data/questions.ts:1868-1881`:

```ts
export const COMPTIA_PASS_SCORE = 750;
export function comptiaScaledScore(rawPct: number): number {
  return Math.max(COMPTIA_MIN_SCORE, Math.min(COMPTIA_MAX_SCORE, Math.round(100 + rawPct * 8)));
}
export function isCompTiaPass(scaled: number): boolean {
  return scaled >= COMPTIA_PASS_SCORE;
}
```

So **score = 100 + (whole percent × 8)**, exactly as the live audit verified by hand. Pass needs raw **≥82%** (81% → 748, FAIL).

But the code holds **four** pass standards:

| Standard | Value | Where | What it gates |
|---|---|---|---|
| Scaled pass | 750 (≥82% raw) | `questions.ts:1868-1881`; `ResultsPage.tsx:73-75`, `PassFailPage.tsx:24` | Displayed PASS/FAIL |
| Tier unlock | **80%** | `lib/page-builder.ts` defaults (all tiers `passingScore: 80`); `App.tsx:629-647` (`scorePct >= passThreshold`); `HomePage.tsx:404` ("pass 80%") | Unlocking the next tier |
| Results-page tier check | **80% hardcoded** | `ResultsPage.tsx:81` (`tierPassed = isExamMode ? rawPct >= 80 : null`) | "Next tier" button — ignores the admin-configured `passingScore` |
| Grade label | **70%** | `ResultsPage.tsx:35-41` (`gradeLabel`: ≥70 → "Pass") | Cosmetic label only |
| (dead) | 75% | `PASS_THRESHOLD = 0.75`, `questions.ts:1902` | **Nothing — exported, never imported or used anywhere** |

**Consequence, confirmed in code:** a user scoring 80–81% **unlocks the next tier while the results screen says FAILED** (scaled 740/748 < 750). The two systems disagree by design.

Scoring detail: `weightedScore` (`questions.ts:1890-1900`) weights easy 1.0 / medium 1.2 / hard 1.5. Tier exams are single-difficulty, so weighted == raw for tiers (Tier 3 uses `weightedScore`, Tiers 1–2 use `rawPct` — `App.tsx:621`). For mixed Fast/Full quizzes the weights do apply, and the scaled score is computed from the weighted percent.

---

## 3. Paywall — client-side flags only; the trial system is a stub

**How Pro is determined:** `isPro` = Stripe subscription status `active` or `trialing` from `GET /api/subscription` (`App.tsx:198-200`, `285-287`). `effectiveIsPro = isPro || freeTestSimulation || isAdmin` (`App.tsx:320`). Admins are always Pro; `isOwnerTesting` bypasses all locks (`App.tsx:319`).

**The trial gate never blocks anyone.** `artifacts/comptia-quiz/src/lib/trials.ts` (6 lines, complete file):

```ts
export function hasRemainingTrials(isSignedIn: boolean, isPro: boolean): boolean { return true; }
export function getRemainingTrials(isSignedIn: boolean, isPro: boolean): number { return Infinity; }
export function getTrialStatusMessage(isSignedIn: boolean, isPro: boolean): string | null { return null; }
export function markTrialWarningShown(): void {}
export function canStartTrial(isSignedIn: boolean, isPro: boolean): boolean { return true; }
export function recordTrialUsed(isSignedIn: boolean, isPro: boolean): Promise<void> { return Promise.resolve(); }
```

`checkTrial` (`App.tsx:380-403`) therefore always returns true. **Fast, Full, Weak-area, Topic, Tier and Bonus quizzes are unlimited for everyone, signed out included.** The tier-card "Locked" button state (`HomePage.tsx:425`, `remainingTrials === 0`) is unreachable because `getRemainingTrials` returns `Infinity`.

**Simulations are the only gated thing, and the gate is localStorage.** `getSimulationStatus` (`data/simulation.ts:182-193`): 1 free simulation per category, tracked in localStorage key `comptia_free_simulations_used`. Hard difficulty is locked unless Pro or a free sim remains (`HomePage.tsx:975`). Clearing site data (or incognito) resets the free sim. Client-side only.

**Stripe (server side, real):** `artifacts/api-server/src/routes/stripe.ts`
- `POST /checkout` (auth): creates a Stripe customer if needed, creates a Checkout session, returns its URL. **Defect: the customer is created with a fake email — `` `${userId}@example.com` `` (`stripe.ts:78`) — so receipts/invoices go nowhere.**
- `GET /subscription` (auth): reads subscription status from the `stripe-replit-sync` tables, with direct-Stripe-API fallback.
- `POST /customer-portal` (auth): billing portal.
- Webhook: registered **before** `express.json()` (`app.ts`), raw body preserved, handled by `stripe-replit-sync` (`webhookHandlers.ts`). Correct.
- Prices: `PricingPage.tsx:36` hardcodes the labels `$9.99` / `$79.99`, but the real `priceId` comes from Stripe products via public `GET /products-with-prices`. Whether the live Stripe account actually holds those products is **unverified** (seed script exists: `scripts/src/seed-products.ts`).
- **No entitlements table exists in the DB.** Subscription status is re-read from Stripe on every check. There is no "grant Pro" path that doesn't go through Stripe.

**No server-side content gating exists at all.** The API never serves questions. The full bank **and answer key** ship to the browser (`exam-bank.json`, `questions.ts`, `hellmode-bank.ts` are all imported by the frontend bundle). The only server-enforced checks are auth (quiz-results, subscription, checkout) and admin permissions (§7).

---

## 4. Tier locks — enforced, but only in the browser, on localStorage

- State: `examUnlocked = {1: true, 2: false, 3: false}` (`App.tsx:242`), loaded from / saved to localStorage key `comptia_exam_progress` (`App.tsx:255-267`).
- Enforcement: `handleStartExamTier` — `if (!isOwnerTesting && !effectiveExamUnlocked[tier]) return;` (`App.tsx:588`). Client-side only; any user can unlock all tiers by editing localStorage.
- Unlock: `handleExamFinish` (`App.tsx:629-647`) — `scorePct >= passingScore` (80) unlocks the next tier.
- **The disconnect the live audit found, confirmed:** `handleFinish` (Fast/Full quizzes, `App.tsx:500-528`) never touches `examUnlocked`. Passing a Fast quiz 900/900 unlocks nothing. Two progression systems, disconnected by construction.
- **Bonus round:** unlocked at 95%+ final average across tiers (`ResultsPage.tsx:82-86`; `App.tsx:655-659`), but `handleStartBonus` (`App.tsx:667-682`) does **not** verify the 95% — it only runs `checkTrial` (always true). The gate is the button rendering only.
- **Fast/Full difficulty selector has no lock at all** — Hard is freely selectable with no account, as the live audit proved.

---

## 5. Progress persistence — in-memory, localStorage, and one server call

| What | Where it lives | Survives refresh? |
|---|---|---|
| In-progress quiz (answers, timer) | React `useState` in `App.tsx` | **No.** No save, no `beforeunload` handler anywhere in `src` (grep: zero hits), no resume. |
| Tier unlocks + tier scores | localStorage `comptia_exam_progress` | Yes, per browser/device only. Clear site data = locked again. |
| Weak areas | localStorage `comptia_weak_areas` | Yes, per browser only. |
| Streaks | localStorage `comptia_streak` (`lib/gamification.ts:99-107`) | Yes, per browser only. |
| Completed Fast/Full quizzes | **Server** — `POST /quiz-results` → Postgres `quiz_results` table | Yes (signed-in users only). |
| Completed Tier exams | **Nowhere.** | **No.** |
| Completed Bonus round | **Nowhere.** | **No.** |

The server route is properly built (`artifacts/api-server/src/routes/quiz_results.ts:36-51`): `requireAuth` via Clerk `getAuth`, `userId` taken from the session (not the request body — can't spoof another user), validated with `insertQuizResultSchema`. But **`createResult.mutate` is called exactly once in the entire app** (`App.tsx:515`, inside `handleFinish` for Fast/Full only). `handleExamFinish` and `handleBonusFinish` never call it. So the flagship 270-question tier exams are never persisted — and `ProgressPage` reads `GET /quiz-results`, so **tier completions can never appear in the Progress Dashboard, even for signed-in users**. This is worse than the live audit assumed (it tested anonymously, where nothing is saved at all — `App.tsx:504`, `else if (isSignedIn)`).

DB tables (`lib/db/src/schema/`): `quiz_results`, `stripe_customers`, `admin_questions`, `admin_settings`, `admin_media`, `admin_audit_logs`. There is **no entitlements table, no in-progress table, no users table** (Clerk is the user store).

---

## 6. Auth — why /sign-in goes blank

- `main.tsx`: `ClerkProvider` with `publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)`; throws `"Missing VITE_CLERK_PUBLISHABLE_KEY"` if no key resolves. **There is no loading fallback anywhere in the auth path** — `createRoot(...).render(<ClerkWrapper/>)` renders nothing until Clerk initialises, and `SignInPage` (`App.tsx:77-88`) renders a bare `<SignIn routing="path">` with no skeleton. Any Clerk init latency = blank dark page.
- **Clerk is Replit-proxied, not standard.** Clerk Frontend API calls go through the api-server at `/api/__clerk` (`clerkProxyMiddleware`, `app.ts`; proxy target `frontend-api.clerk.dev`). `.env.local` holds `VITE_CLERK_JS_URL` / `CLERK_JS_URL` (Replit proxy URLs). This is the likely cause of the ~8s blank: key resolution + proxied Clerk JS + session fetch, all before first paint, with zero loading UI.
- **`.env.local` is committed to git** (`git ls-files` lists `artifacts/comptia-quiz/.env.local`). Its values are only URLs (`PORT`, `BASE_PATH`, `CLERK_JS_URL`, `VITE_CLERK_JS_URL` — key names verified, values not reproduced here), no secret keys — but `.env.local` must never be tracked.
- **Vercel move blocker:** on a non-Replit host, `publishableKeyFromHost` returns nothing without `VITE_CLERK_PUBLISHABLE_KEY`, and the app throws. The move requires real Clerk keys (`VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`) and dropping the Replit proxy wiring. `vite.config.ts` also throws unless `PORT` and `BASE_PATH` env vars are set at build/dev time.

---

## 7. Admin panel — real, substantial, and already wired

This is the biggest correction to the live audit (which could only see the public button): **a full admin panel already exists.**

- **Frontend:** `/admin` route (`App.tsx:870`), `pages/AdminPage.tsx` (659 lines) + `AdminSimulationPanel.tsx` + `PageBuilderPanel.tsx`. Only in the root tree — absent from the `-main` copy.
- **Back end:** `artifacts/api-server/src/routes/admin.ts` (736 lines). `requirePermission` middleware (lines ~155-185): Clerk auth + `ADMIN_USER_IDS` env allowlist, single `"owner"` role with a permission list (`dashboard:read/overview`, `quiz:read/manage`, `settings:manage`, `media:manage`, `users:read/manage`, `audit:read`, `simulation:run`). Every admin endpoint is gated server-side. Admin actions write to `admin_audit_logs`.
- **Endpoints** (`lib/api-spec/openapi.yaml` + `routes/admin.ts`): questions CRUD, settings incl. page-builder tiers, media CRUD, users (list / create / **ban / unban / delete / cancel_subscription**), audit log, overview stats (users from Clerk, quiz-result count, active subscriptions from Stripe — all soft-fail with try/catch), simulation-events.
- **The admin question bank is live, not a stub.** `GET /managed-questions` serves active `admin_questions` rows — and it is **public (no auth)**. `App.tsx` mixes them into Fast/Full quizzes (`includeManagedQuestions`, `App.tsx:371-378`) and tier exams (`adminTier` filter, `App.tsx:589`).
- **Admin simulation profiles exist** (`lib/admin-simulation.ts`, `AdminSimulationPanel.tsx`): test profiles (`pro` / `hellmode` / `restricted`) with daily quiz limits and feature flags; `effectiveIsPro` honours a simulated profile.
- **Gaps vs the audit's spec:** no "grant Pro free" / entitlement endpoint (user actions are ban/unban/delete/cancel-subscription only); no coupons or pricing management (prices live in Stripe, via `scripts/src/seed-products.ts`); no user-report / wrong-question flags queue; no testimonial manager (testimonials are hardcoded in `HomePage.tsx:491-571`); **no break-glass second admin** — one allowlist only (and `AdminPage.tsx:421` tells a non-admin to add their Clerk user ID to `ADMIN_USER_IDS`).
- **The public admin button is confirmed in code:** `AdminAccessButton` (`App.tsx:99-130+`) — a fixed bottom-right shield button rendered on every page (mounted in `AppContent` and `ProgressRoute`), navigating to `/admin` when signed in, else showing a sign-in prompt dialog.

---

## 8. PBQs — the "5 PBQs" are MCQs wearing a scenario sentence

`data/simulation.ts`:
- `SimulationQuestion` has `isPBQ`, `scenario`, `pbqPart` fields, and `createPBQ` (`simulation.ts:122-136`) wraps a hard MCQ with one of 5 canned scenario sentences per exam (`PBQ_SCENARIOS`, `simulation.ts:137-165` — e.g. *"A help desk technician receives a ticket stating: …"*). **No multi-select, drag-and-drop, CLI, matching, or log interaction exists anywhere in the codebase** (grep: zero hits outside scenario text).
- **Simulation count bug, root-caused.** Non-Pro "mixed" path targets 34 easy / 38 medium / 13 hard MCQs + 5 PBQs = 90 (`simulation.ts:85-110`). But the pool is the tercile-split bank — exactly 30/30/30 per exam — so it delivers 30 + 30 + 13 + 5 = **78 questions**, and the timer is `count × 60s` = **78 minutes**. That is exactly the 78/78 the live audit measured. The Pro path delivers 85 + 5 = 90. Root cause: targets assume 85 MCQs; the pool caps silently slice short.
- All three `SIMULATION_CONFIGS` advertise *"90 questions · 90 minutes · 5 PBQs · 750 to pass"* and set `isProRequired: false` ("first sim free") — `simulation.ts:25-69`.
- **Fireworks are not in this source.** No confetti/fireworks code exists anywhere in `src` (grep: zero hits). Sounds exist (`lib/sound-effects.ts`: `playWinnerSound`, `playHeartbreakSound`, `playBadgeSound`, `playBonusUnlockSound`, `playPassSound`, `playFailSound`). The owner's described fireworks-on-pass is **not in this repo copy** — verify against the live deployment; if it exists live, it lives in a different version/copy.
- "Aright Aright 👀👀" greeting: **not found in current source** (grep across `src`: zero hits). "COMPTIANETWORK+": **not found as a code defect** (`HomePage.tsx:683` renders `"CompTIA {exam}"` with a space — likely a CSS uppercase/tracking rendering artifact). Both should be re-checked live after redeploy rather than fixed from this copy.

---

## 9. Duplicated tree — root is live, `-main` is a stale snapshot

- **Root tree = the live app.** Evidence: pnpm workspace globs (`pnpm-workspace.yaml`: `artifacts/*`, `lib/*`, `scripts`); `.replit` at root; `replit.md` run commands reference `@workspace/*` packages; latest commit 2026-11-08; only the root has the admin panel, `hellmode-bank.ts`, `vercel.json`, `.env.local`.
- **`Comptia-certification-Prep-1-main/` = stale nested snapshot** (last touched 2026-08-09, commit `7e25e13`). Full diff: 9 files differ, 10 files exist only in root (listed in §9 of the diff below), and **zero files exist only in `-main`** — the root is a strict superset. Safe to delete; it is not a workspace package and nothing unique lives there. It is almost certainly a GitHub zip export extracted inside the repo.
- **The two `.mp4` files at root are dead weight:** `Comptia-certification-Prep--1--Jul-15-09-31-08.mp4` (9.8 MB) and `Comptia-certification-Prep--1--Jun-12-13-01-19.mp4` (18.4 MB), both **21.05 s** long, **referenced nowhere** in code or docs (grep: zero hits). Almost certainly Replit screen recordings. Remove from the repo (they are also in git history — removing from the tree stops them shipping in every future clone/deploy, but does not purge history).
- Repo size is ~97 MB total, dominated by git history + these recordings.

---

## 10. Other live findings, confirmed in code

- **Duplicated explanation** (`"The correct answer is C. 143. The correct answer is: 143"`): `QuizPage.tsx:115` builds feedback as `` `The correct answer is ${letter}. ${option}. ${explanation}` `` while the explanation itself is already `"The correct answer is: ${ans}"` — fallback in `toQuestion` (`exam-bank.ts:217`) and `topic-pool.ts:41`, and several terse meta entries.
- **Testimonials are hardcoded and fake** (`HomePage.tsx:491-571`, 10 entries: Sarah K., Marcus T., Priya R., …) claiming a 7-day streak, badges, a flagging system, adaptive recommendations, per-domain mastery. Streaks/badges do exist in `lib/gamification.ts` (localStorage); **flagging and adaptive recommendations do not exist anywhere**.
- **No footer:** zero hits for `<footer>`, Terms, or Privacy in `src`.
- **Quiz UX, confirmed:** answers lock on first click (`QuizPage.tsx:145`, `if (hasAnswered) return`); Back disabled after answering and at Q0 (`QuizPage.tsx:374`); auto-advance 2200 ms (2800 ms on hard) (`QuizPage.tsx:159-163`) — the audit's "1.8 s" was approximate; instant feedback always on, no Exam Mode.
- **Checkout flow exists in code** (`PricingPage.tsx:18,36,44-46` → `POST /checkout` → Stripe session URL) but whether live Stripe products exist is unverified.
- **QuizPage timer expiry** (`QuizPage.tsx:95`): `setTimeout(() => onFinish(...), 800)` — auto-submits 800 ms after time runs out.

---

## Fix list — ordered (P0 first)

### P0 — before charging anyone

| # | Fix | Where | Notes |
|---|---|---|---|
| P0-1 | **One bank story.** Pick the canonical size (see Decision 1), delete duplicate texts (~129 in tiers), and make hero / `EXAM_COUNTS` / `allTiersQuestionCount` read one source. Retire or merge `questions.ts` (270) into the tier bank, or relabel quick modes as drawing from the same bank. | `exam-bank.json`, `questions.ts`, `exam-bank.ts:261`, `HomePage.tsx:364`, `questions.ts:1789` | Blocks P0-4 (caps depend on the bank) |
| P0-2 | **One pass standard.** Pick 80% or 750/82% (see Decision 2). Delete dead `PASS_THRESHOLD`; fix `ResultsPage.tsx:81` hardcoded 80; reconcile `gradeLabel` 70%. | `questions.ts:1868-1902`, `page-builder.ts`, `ResultsPage.tsx:35-41,81` | One-line change if 82% is chosen (tier `passingScore` 80 → 82) |
| P0-3 | **Save progress server-side + resume + exit-confirm.** Persist in-progress answers (new table or extend `quiz_results` with a status); call the existing `POST /quiz-results` from `handleExamFinish` and `handleBonusFinish`, not just `handleFinish`; add a `beforeunload` confirm on timed exams. | `App.tsx:515,618-665`, `QuizPage.tsx`, `lib/db/src/schema/` | This is the single biggest fix; the API route and table already exist |
| P0-4 | **Make the paywall real.** Replace `lib/trials.ts` stubs with real server-side caps (free question cap/day or 1 exam per cert); gate Medium/Hard, Tier 2/3, Simulations and PBQs on `effectiveIsPro`; enforce tier unlocks server-side before serving a quiz; move Simulation free-use tracking server-side; stop shipping the answer key — serve one question at a time from the API and grade server-side. | `lib/trials.ts`, `App.tsx:380-403,588`, `simulation.ts:164-193`, `artifacts/api-server` | The server exists — this is wiring, not new infrastructure |
| P0-5 | **Fix Simulation counts + PBQ honesty.** Cap the mixed-path targets to the actual 30/30/30 pools (or rebalance the bank); set the timer from the delivered count; remove "5 PBQs" from all copy until real PBQs exist (or ship the scenario-MCQ honestly labelled as scenario questions). | `simulation.ts:85-120` | Explains the live 78/78 exactly |
| P0-6 | **Fix the blank sign-in.** Add a `<ClerkLoading>` fallback + loading shell on `/sign-in` and `/sign-up`; for the Vercel move, set real Clerk keys and remove the Replit proxy wiring (`main.tsx`, `app.ts` `/api/__clerk`). | `main.tsx`, `App.tsx:77-97` | Conversion killer on the only revenue path |
| P0-7 | **Remove the public admin button.** Delete `AdminAccessButton` from all pages; admin lives at `/admin` + the server role check only. | `App.tsx:99-130+` | The server check is already correct — this is just hiding the door |

### P1 — before launch

- **Content pass:** fix `enhanceDistractors` (stop replacing options from the global pool — the port-number defect); fix `toQuestion` hardcoding `category: "A+"` (derive the category from the question or tag the bank); fix the duplicated explanation (`QuizPage.tsx:115` vs `exam-bank.ts:217`); re-tag topics; remove the Tier 2 boilerplate prefix or make Medium real scenarios.
- **Testimonials:** delete the 10 hardcoded entries (`HomePage.tsx:491-571`) or replace with real reviews only after the named features exist.
- **Footer:** add Terms / Privacy / Contact + support email. No footer exists today.
- **Exam Mode vs Practice Mode:** no instant feedback + review-at-end (real exam behaviour) alongside Practice Mode (instant feedback). Add flag-for-review (advertised in testimonials, doesn't exist).
- **Quiz UX:** allow changing an answer before advancing; Back that works more than one step.
- **Housekeeping (do first, 10 minutes):** delete `Comptia-certification-Prep-1-main/`; delete the two unreferenced `.mp4` files; `git rm --cached artifacts/comptia-quiz/.env.local` and add it to `.gitignore`.
- **Stripe hygiene:** stop creating customers with `` `${userId}@example.com` `` (`routes/stripe.ts:78`) — use the Clerk user's real email. Verify the $9.99/$79.99 products exist in live Stripe (run `scripts/src/seed-products.ts` if not).
- **Admin gaps (nice-to-have):** add a "grant Pro" entitlement action and coupon management; add a user-report/flags queue; document the break-glass admin (a second Clerk ID in `ADMIN_USER_IDS`).

---

## Decisions the owner must make

### Decision 1 — the one true bank size

What the code currently says, all at once:
- Quick bank (`questions.ts`): **270** (90/exam) — Fast/Full/Topic/Simulation.
- Tier bank (`exam-bank.json`): **810** objects (681 unique texts) + 10 bonus.
- Served tier questions: **810** (270 T1 + 270 T2 + 270 HellMode).
- Everything, added up: **1,090** question objects (270 + 810 + 10).

Options:
- **(a) 810 headline** — tiers are the product; retire or merge `questions.ts` into the tier bank so quick modes draw from the same 810. *Recommended: simplest true story.*
- **(b) 270 headline** — 90/exam; treat tiers as repackaging. *Not recommended: the tiers are different content, not the same 270.*
- **(c) Honest split** — "810 tier questions + 270 practice questions". *True but confusing on a landing page.*

### Decision 2 — the one pass standard

What the code currently says: 70% (label), 75% (dead constant), **80%** (tier unlock), **750 / 82%** (displayed PASS/FAIL).

Options:
- **(a) Keep 750, set tier pass to 82%.** One-line change (`page-builder.ts` defaults `passingScore: 80 → 82`, plus `ResultsPage.tsx:81`). *Recommended: 750 is the real CompTIA number and the honest simulation.*
- **(b) Keep 80% tiers, change the formula so 80% = 750** (score = 100 + pct × 8.125, or rescale). *Changes the meaning of every past score; messier.*

---

## Blockers to starting the fixes

1. **Decisions 1 and 2 above** gate P0-1 and P0-2 (everything else hangs off these two numbers).
2. **Dependencies are not installed** (this task was read-only by instruction). The fixer must run `pnpm install` first (Node v24 is available on this machine; pnpm workspace). No `node_modules` exists in the clone.
3. **Delete the `-main` copy first** — otherwise edits can land in the wrong tree. (Verified safe: root is a strict superset, zero `-main`-only files.)
4. **Stripe products unverified** — confirm $9.99/mo and $79.99/yr products exist in the live Stripe account (or run `scripts/src/seed-products.ts` with live keys) before testing checkout end to end.
5. **Clerk on Vercel needs real keys** — the Replit-managed tenant + `/api/__clerk` proxy will not work off Replit. Set `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` (and `PORT`, `BASE_PATH` for the Vite config) in the new host.
6. **No test account** for end-to-end verification of sign-in, progress, and checkout (per the live audit). Either a throwaway Clerk account or the owner beside the fixer.
7. **Fireworks status unknown** — the owner's described fireworks-on-pass is not in this source. Confirm whether it exists in the live deployment before treating it as a shipped feature; if it does, find which copy/version holds it.

---

## Verification notes (for the record)

- Counts were computed by parsing the JSON/TS directly (Python `json` + regex over `questions.ts` / `hellmode-bank.ts`), not by trusting labels.
- The 78-question Simulation was reproduced arithmetically: non-Pro mixed targets 34/38/13 from 30/30/30 tercile pools = 73 MCQs + 5 PBQs = 78; timer 78 × 60 s = 78 min.
- The 80%-unlocks-but-82%-fails contradiction was verified in both the unlock path (`App.tsx:629-647`, threshold 80) and the display path (`ResultsPage.tsx:73-75`, scaled ≥ 750).
- `PASS_THRESHOLD`, `gradeLabel` 70%, and the hardcoded 80% in `ResultsPage.tsx:81` were each located by grep; `PASS_THRESHOLD` has zero usages repo-wide.
- The `ADMIN_USER_IDS` value in `.replit` is deliberately not reproduced in this report; the mechanism (env allowlist, single owner role) is what matters.
- `.env.local` was checked by key names only; no secret values were read or reproduced.
