/**
 * Supabase client for the quiz frontend (replaces Clerk).
 *
 * The client is created from the Vite env vars VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY (the anon/public key is safe to ship in the
 * browser bundle — it is not a secret; the service role key must NEVER
 * be used here). Auth state is stored in localStorage by the Supabase
 * client (default) and the access token is sent to the API as
 * `Authorization: Bearer <token>` (see getAccessToken + quiz-api.ts and
 * the generated client's setAuthTokenGetter registration in main.tsx).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read Vite env vars without depending on the `vite/client` type
// declarations (they do not resolve in the Vercel build's typecheck).
const viteEnv = (
  import.meta as unknown as { env: Record<string, string | undefined> }
).env;
const supabaseUrl = viteEnv.VITE_SUPABASE_URL;
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// ---------------------------------------------------------------------------
// Cached access token (kept fresh by onAuthStateChange)
// ---------------------------------------------------------------------------

let cachedAccessToken: string | null = null;
let initialSessionResolved = false;
const initialSessionWaiters: Array<() => void> = [];

function resolveInitialSession(): void {
  if (initialSessionResolved) return;
  initialSessionResolved = true;
  for (const notify of initialSessionWaiters) notify();
  initialSessionWaiters.length = 0;
}

supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token ?? null;
  resolveInitialSession();
});

// Seed from storage in case the INITIAL_SESSION event already fired.
supabase.auth.getSession().then(({ data }) => {
  cachedAccessToken = data.session?.access_token ?? null;
  resolveInitialSession();
});

/** Resolves once the client has determined the initial session (or that there is none). */
export function waitForInitialSession(): Promise<void> {
  if (initialSessionResolved) return Promise.resolve();
  return new Promise((resolve) => initialSessionWaiters.push(resolve));
}

/**
 * Current Supabase access token, or null when signed out. Awaits the
 * initial session resolution first so the first authenticated call after
 * a page load is not sent as a guest by accident.
 */
export async function getAccessToken(): Promise<string | null> {
  await waitForInitialSession();
  return cachedAccessToken;
}

/** Synchronous snapshot of the cached token (null before the initial session resolves). */
export function getCachedAccessToken(): string | null {
  return cachedAccessToken;
}
