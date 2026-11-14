/**
 * Supabase auth middleware (replaces Clerk's clerkMiddleware).
 *
 * Reads `Authorization: Bearer <token>` (sent by the quiz frontend —
 * see the quiz app's lib/supabase + the generated client's
 * setAuthTokenGetter), validates the token against Supabase Auth, and
 * attaches the Supabase user id (a UUID) to the request as
 * `req.authUserId` (null when guest or the token is invalid).
 *
 * This middleware NEVER rejects a request: public and guest-capable
 * routes (quiz questions, entitlements, free usage) work without a
 * token, and routes that require a signed-in user enforce it with
 * requireAuth (see lib/entitlements.ts).
 */
import type { Request, Response, NextFunction } from "express";
import { getUserIdFromToken } from "./supabase.js";

export async function supabaseAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : null;
  if (!token) {
    (req as unknown as { authUserId: string | null }).authUserId = null;
    next();
    return;
  }
  try {
    (req as unknown as { authUserId: string | null }).authUserId = await getUserIdFromToken(token);
  } catch {
    (req as unknown as { authUserId: string | null }).authUserId = null;
  }
  next();
}
