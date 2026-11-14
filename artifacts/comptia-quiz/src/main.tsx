import { createRoot } from "react-dom/client";
import { useEffect, useRef } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router as WouterRouter } from "wouter";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase, getAccessToken } from "./lib/supabase";
import { AuthProvider } from "./lib/auth";
import App from "./App";
import "./index.css";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// The generated API client (checkout, subscription, admin, quiz results)
// sends the Supabase access token as `Authorization: Bearer <token>`
// on every call (see custom-fetch setAuthTokenGetter). The standalone
// quiz-api.ts does the same via getAccessToken().
setAuthTokenGetter(() => getAccessToken());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

/**
 * Clears the React Query cache whenever the signed-in identity changes
 * (sign-in, sign-out, or account switch), so entitlements, quiz history
 * and admin state are never served from the previous user's cache.
 */
function AuthQueryClientCacheInvalidator() {
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}

function AppWrapper() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <AuthQueryClientCacheInvalidator />
        <App />
      </QueryClientProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <WouterRouter base={basePath}>
    <AppWrapper />
  </WouterRouter>,
);
