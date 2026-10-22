"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChartPie, History, House, Moon, Plus, Settings, Sun, Wallet, Wheat } from "lucide-react";
import { useSummary } from "@/hooks/use-data";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppLock } from "./app-lock";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { QuickAddProvider, useQuickAdd } from "./quick-add";

// Two tabs either side of the centre "+" button. Transfers live under Expenses (tab on that page).
const NAV = [
  { href: "/", label: "Home", icon: House, match: (p: string) => p === "/" },
  { href: "/expenses", label: "Expenses", icon: Wallet, match: (p: string) => p.startsWith("/expenses") || p.startsWith("/transfers") },
  null,
  { href: "/rice", label: "Rice", icon: Wheat, match: (p: string) => p.startsWith("/rice") },
  { href: "/analytics", label: "Stats", icon: ChartPie, match: (p: string) => p.startsWith("/analytics") },
];

const TITLES: Record<string, string> = {
  "/": "Flat Split",
  "/expenses": "Money",
  "/transfers": "Money",
  "/rice": "Rice tracker",
  "/analytics": "Analytics",
  "/activity": "Activity log",
  "/settings": "Settings",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, error, refetch } = useSummary();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    // No sign-in hint cookie → definitely not signed in: go to sign-in without waiting for the server.
    if (!document.cookie.split("; ").includes("fs_in=1")) router.replace("/login");
  }, [router]);

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      document.cookie = "fs_in=; Max-Age=0; path=/";
      router.replace("/login");
    }
  }, [error, router]);

  const fatal = !data && error && !(error instanceof ApiError && error.status === 401) ? error : null;

  const me = data?.users.find((u) => u.id === data.meId);

  return (
    <AppLock me={me}>
      <QuickAddProvider>
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
          <Link href="/" aria-label="Home" className="mr-1">
            <Logo className="size-7" />
          </Link>
          <h1 className="flex-1 py-3 text-lg font-semibold tracking-tight">{TITLES[pathname] ?? "Flat Split"}</h1>
          <Button variant="ghost" size="icon" asChild aria-label="Activity log">
            <Link href="/activity">
              <History />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label="Settings">
            <Link href="/settings">
              <Settings />
            </Link>
          </Button>
        </header>

        <main className="flex-1 px-4 pt-4 pb-32">
          {fatal ? (
            <div className="rise mx-auto mt-10 max-w-sm space-y-3 rounded-xl border border-negative/30 bg-negative/5 p-4 text-center">
              <p className="font-medium">Couldn&apos;t load your data</p>
              <p className="text-sm break-words text-muted-foreground">{fatal.message}</p>
              <Button variant="outline" className="w-full" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : (
            children
          )}
        </main>

        <BottomNav pathname={pathname} />
      </div>
      </QuickAddProvider>
    </AppLock>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  const quickAdd = useQuickAdd();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 z-30 px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center rounded-[1.75rem] border border-border/60 bg-background/80 px-1.5 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.35)] backdrop-blur-xl">
        {NAV.map((item) => {
          if (!item) {
            return (
              <li key="add" className="flex justify-center">
                <button
                  onClick={() => quickAdd()}
                  aria-label="Add"
                  className="group -mt-9 flex size-15 items-center justify-center rounded-full bg-gradient-to-br from-teal-400 to-teal-700 text-white shadow-[0_10px_24px_-6px_rgb(13_148_136/0.7)] ring-[5px] ring-background transition active:scale-90"
                >
                  <Plus className="size-7 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.5} />
                </button>
              </li>
            );
          }
          const { href, label, icon: Icon, match } = item;
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-0.5 text-[11px] font-medium"
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-all duration-300",
                    active ? "bg-primary/15 text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("size-5 transition-transform duration-300", active && "scale-110")} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className={cn("transition-colors", active ? "text-primary" : "text-muted-foreground")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}