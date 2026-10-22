"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, MessageCircle } from "lucide-react";
import { AddIcon, HomeIcon, RiceIcon, StatsIcon, WalletIcon } from "./nav-icons";
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
  { href: "/", label: "Home", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/expenses", label: "Money", icon: WalletIcon, match: (p: string) => p.startsWith("/expenses") || p.startsWith("/transfers") },
  null,
  { href: "/rice", label: "Rice", icon: RiceIcon, match: (p: string) => p.startsWith("/rice") },
  { href: "/analytics", label: "Stats", icon: StatsIcon, match: (p: string) => p.startsWith("/analytics") },
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
        {/* Full-width copper glow at the top of the page; scrolls away with the content */}
        <div className="aurex-glow pointer-events-none absolute inset-x-0 top-0 h-[32rem]" aria-hidden />
        <div className="relative mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
          <Header title={TITLES[pathname] ?? "Flat Split"} />
          <main className={cn("flex-1 px-4 pt-3", isChat ? "pb-4" : "pb-28")}>
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
  // Transparent over the glow at the top; frosted once the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const me = data?.users.find((u) => u.id === data.meId);
  const unreadChat = Boolean(data?.lastChat && data.lastChat.userId !== data.meId && data.lastChat.id > getSeen("chat"));
  const unreadActivity = Boolean(
    data?.lastActivity && data.lastActivity.userId !== data.meId && data.lastActivity.id > getSeen("activity"),
  );

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-1.5 px-4 pt-[env(safe-area-inset-top)] transition-colors duration-300",
        scrolled ? "bg-background/80 backdrop-blur-xl" : "bg-transparent",
      )}
    >
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
      className="glass relative flex size-10 items-center justify-center rounded-full transition active:scale-95 [&_svg]:size-[18px]"
    >
      {children}
      {dot && <span className="absolute top-2 right-2 size-2.5 rounded-full border-2 border-card bg-brand" />}
    </Link>
  );
}

/** Docked tab bar (reference style): full width, rounded top, filled icons with labels; active = bright. */
function BottomNav({ pathname }: { pathname: string }) {
  const quickAdd = useQuickAdd();
  const tab = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center gap-1 pt-2.5 pb-1 text-[12px] font-medium transition-colors active:scale-95",
      active ? "text-foreground" : "text-muted-foreground/80",
    );
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 rounded-t-[2.25rem] border-t border-border bg-[var(--nav-bg)] shadow-[0_-12px_30px_-18px_rgb(0_0_0/0.5)]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.6rem)" }}
    >
      <ul className="mx-auto flex max-w-2xl px-2">
        {NAV.map((item) => {
          if (!item) {
            return (
              <li key="add" className="flex flex-1">
                <button onClick={() => quickAdd()} className={tab(false)} aria-label="Add">
                  <AddIcon className="size-7" />
                  Add
                </button>
              </li>
            );
          }
          const { href, label, icon: Icon, match } = item;
          const active = match(pathname);
          return (
            <li key={href} className="flex flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={tab(active)}>
                <Icon className="size-7" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}