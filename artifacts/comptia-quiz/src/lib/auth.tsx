/**
 * Supabase auth state for the quiz frontend (replaces Clerk's
 * useUser / useAuth / useClerk).
 *
 * Provides the signed-in Supabase user + session to the whole app.
 * `user` is a Supabase Auth user: `user.id` is the UUID used as the
 * server-side identity, `user.email` is the account email, and
 * `user.user_metadata` carries the display name / avatar (set at
 * sign-up as `full_name` / `avatar_url`).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase.js";

export interface AuthState {
  user: User | null;
  session: Session | null;
  /** True once the initial session has been read (signed in or not). */
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setIsLoaded(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setIsLoaded(true);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      isLoaded,
      isSignedIn: Boolean(session?.user),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoaded],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Display name for a Supabase user (metadata full name, else email, else "User"). */
export function displayNameFor(user: User | null | undefined): string {
  if (!user) return "User";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const firstName = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
  if (firstName) return firstName;
  return user.email ?? "User";
}

/** Avatar URL for a Supabase user, when one was set (Google sign-in or metadata). */
export function avatarUrlFor(user: User | null | undefined): string | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const url = typeof meta.avatar_url === "string" ? meta.avatar_url : typeof meta.picture === "string" ? meta.picture : "";
  return url || null;
}
