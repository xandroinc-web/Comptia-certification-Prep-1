/**
 * Supabase Auth helpers for the api-server (replaces Clerk).
 *
 * The server validates the `Authorization: Bearer <token>` the frontend
 * sends (see the quiz app's lib/supabase + the generated client's
 * setAuthTokenGetter) by calling `supabase.auth.getUser(accessToken)`
 * against Supabase Auth — the token is never trusted from the client
 * alone. Admin user management (list / create / ban / unban / delete)
 * uses the Supabase Admin API, which requires the service role key.
 *
 * The service role key is server-only and must NEVER be sent to the
 * browser. If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing,
 * getSupabaseAdmin() returns null and auth resolves to "guest" (the
 * routes that require auth then 401) rather than crashing the server.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  if (!adminClient) {
    adminClient = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

/**
 * Validate a Supabase access token and return the Supabase user id
 * (a UUID). Returns null when the token is missing, invalid, or expired,
 * or when Supabase Auth is not configured. Never throws.
 */
export async function getUserIdFromToken(accessToken: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/** Email address for a Supabase user id (via the Admin API). Null when unknown. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) return null;
    return data.user.email;
  } catch {
    return null;
  }
}

/** List Supabase users (Admin API). `query` filters by email/name in-memory. */
export async function listSupabaseUsers(params: {
  query?: string;
  limit?: number;
}): Promise<{ users: User[]; total: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase Auth is not configured");
  const perPage = Math.min(Math.max(params.limit ?? 25, 1), 100);
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage });
  if (error) throw error;
  let users = data?.users ?? [];
  const total = users.length;
  const query = (params.query ?? "").trim().toLowerCase();
  if (query) {
    users = users.filter((user) => {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const haystack = [
        user.email ?? "",
        typeof meta.full_name === "string" ? meta.full_name : "",
        typeof meta.first_name === "string" ? meta.first_name : "",
        typeof meta.last_name === "string" ? meta.last_name : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }
  return { users, total };
}

/** Approximate total user count (first page of up to 1000 users). */
export async function countSupabaseUsers(): Promise<number> {
  const admin = getSupabaseAdmin();
  if (!admin) return 0;
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return 0;
    return data?.users?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Create a Supabase user (confirmed immediately; they set a password via "Forgot password?"). */
export async function createSupabaseUser(params: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<User> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase Auth is not configured");
  const { data, error } = await admin.auth.admin.createUser({
    email: params.email,
    email_confirm: true,
    user_metadata: {
      ...(params.firstName ? { first_name: params.firstName } : {}),
      ...(params.lastName ? { last_name: params.lastName } : {}),
    },
  });
  if (error || !data?.user) throw error ?? new Error("Failed to create user");
  return data.user;
}

/** Ban (long ban duration ≈ indefinite) or unban a Supabase user. */
export async function setSupabaseUserBan(userId: string, banned: boolean): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase Auth is not configured");
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "87600h" : "none",
  });
  if (error) throw error;
}

/** Delete a Supabase user. */
export async function deleteSupabaseUser(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Supabase Auth is not configured");
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
