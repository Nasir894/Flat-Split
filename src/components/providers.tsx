"use client";

import { useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api";

export const CACHE_KEY = "flat-split-cache";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Show cached data instantly, refresh in the background.
        staleTime: 15_000,
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
        refetchOnWindowFocus: true,
      },
    },
  });
}

const persister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({ storage: window.localStorage, key: CACHE_KEY, throttleTime: 1000 })
    : { persistClient: async () => {}, restoreClient: async () => undefined, removeClient: async () => {} };

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(makeClient);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // In dev, file names stay the same while their contents change, so a caching service worker
      // would keep serving stale code. Remove any left over from a production run and its caches.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
      if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    // A push arrived (someone changed something): refresh what's on screen.
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "refresh") client.invalidateQueries();
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, [client]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PersistQueryClientProvider
        client={client}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 7, buster: "v1" }}
      >
        {children}
      </PersistQueryClientProvider>
      <Toaster position="top-center" richColors closeButton />
    </ThemeProvider>
  );
}
