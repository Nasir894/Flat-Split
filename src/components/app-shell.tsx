"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChartPie, House, MessageCircle, Plus, Wallet, Wheat } from "lucide-react";
import { useSummary } from "@/hooks/use-data";
import { ApiError } from "@/lib/api";
import { getSeen, SEEN_EVENT } from "@/lib/seen";
import { cn } from "@/lib/utils";
import { AppLock } from "./app-lock";
import { Logo } from "./logo";
import { Button } from "./ui/button";
import { QuickAddProvider, useQuickAdd } from "./quick-add";
import { UserAvatar } from "./member-avatar";

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
  "/activity": "Activity",
  "/settings": "Settings",
  "/chat": "House chat",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, error, refetch } = useSummary();
  // Re-render when a "seen" marker changes so unread dots clear immediately.
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener(SEEN_EVENT, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(SEEN_EVENT, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

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
  const isChat = pathname === "/chat";

  return (
    <AppLock me={me}>
      <QuickAddProvider>
        <div className="aurex-glow pointer-events-none fixed inset-x-0 top-0 h-64" aria-hidden />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
          <Header title={TITLES[pathname] ?? "Flat Split"} />
          <main className={cn("flex-1 px-4 pt-3", isChat ? "pb-4" : "pb-32")}>
            {fatal ? (
              <div className="rise mx-auto mt-10 max-w-sm space-y-3 rounded-2xl border border-negative/30 bg-negative/5 p-4 text-center">
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
          {!isChat && <BottomNav pathname={pathname} />}
        </div>
      </QuickAddProvider>
    </AppLock>
  );
}

function Header({ title }: { title: string }) {
  const { data } = useSummary();
  const me = data?.users.find((u) => u.id === data.meId);
  const unreadChat = Boolean(data?.lastChat && data.lastChat.userId !== data.meId && data.lastChat.id > getSeen("chat"));
  const unreadActivity = Boolean(
    data?.lastActivity && data.lastActivity.userId !== data.meId && data.lastActivity.id > getSeen("activity"),
  );

  return (
    <header className="sticky top-0 z-30 flex items-center gap-1.5 bg-background/70 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <Link href="/" aria-label="Home" className="mr-1 py-3">
        <Logo className="size-8" />
      </Link>
      <h1 className="flex-1 truncate py-3 text-lg font-semibold tracking-tight">{title}</h1>
      <HeaderButton href="/chat" label="House chat" dot={unreadChat}>
        <MessageCircle />
      </HeaderButton>
      <HeaderButton href="/activity" label="Activity" dot={unreadActivity}>
        <Bell />
      </HeaderButton>
      <Link href="/settings" aria-label="Settings and profile" className="ml-1 rounded-full ring-2 ring-border transition active:scale-95">
        <UserAvatar user={me} className="size-9 text-xs" />
      </Link>
    </header>
  );
}

function HeaderButton({ href, label, dot, children }: { href: string; label: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={dot ? `${label} (new)` : label}
      className="relative flex size-10 items-center justify-center rounded-full border bg-card/60 transition active:scale-95 [&_svg]:size-[18px]"
    >
      {children}
      {dot && <span className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-card bg-brand" />}
    </Link>
  );
}

/** Aurex-style bar: always dark, active tab is a neon-yellow tile, copper "+" raised in the middle. */
function BottomNav({ pathname }: { pathname: string }) {
  const quickAdd = useQuickAdd();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 z-30 px-4" style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <ul className="mx-auto grid h-[4.25rem] max-w-md grid-cols-5 items-center rounded-[2rem] border border-white/10 bg-[#111111]/95 px-2 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)] backdrop-blur-xl">
        {NAV.map((item) => {
          if (!item) {
            return (
              <li key="add" className="flex justify-center">
                <button
                  onClick={() => quickAdd()}
                  aria-label="Add"
                  className="group -mt-10 flex size-16 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_25%,#ff9a52,#d9661f_45%,#7a2508)] text-white shadow-[0_12px_28px_-6px_rgb(224_112_46/0.75)] ring-[6px] ring-background transition active:scale-90"
                >
                  <Plus className="size-7 transition-transform duration-300 group-active:rotate-90" strokeWidth={2.5} />
                </button>
              </li>
            );
          }
          const { href, label, icon: Icon, match } = item;
          const active = match(pathname);
          return (
            <li key={href} className="flex justify-center">
              <Link href={href} aria-label={label} aria-current={active ? "page" : undefined}>
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-2xl transition-all duration-300",
                    active ? "bg-[#eff323] text-black shadow-[0_6px_18px_-6px_rgb(239_243_35/0.7)]" : "text-white/55",
                  )}
                >
                  <Icon className="size-[21px]" strokeWidth={active ? 2.4 : 2} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
