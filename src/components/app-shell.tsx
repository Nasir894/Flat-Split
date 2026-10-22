"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeftRight, BarChart3, History, Home, Moon, Receipt, Settings, Sun, Wheat } from "lucide-react";
import { useSummary } from "@/hooks/use-data";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AppLock } from "./app-lock";
import { Button } from "./ui/button";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  { href: "/rice", label: "Rice", icon: Wheat },
  { href: "/analytics", label: "Stats", icon: BarChart3 },
];

const TITLES: Record<string, string> = {
  "/": "Flat Split",
  "/expenses": "Expenses",
  "/transfers": "Transfers",
  "/rice": "Rice tracker",
  "/analytics": "Analytics",
  "/activity": "Activity log",
  "/settings": "Settings",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, error } = useSummary();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace("/login");
  }, [error, router]);

  const me = data?.users.find((u) => u.id === data.meId);

  return (
    <AppLock me={me}>
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-1 border-b bg-background/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
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

        <main className="flex-1 px-4 pt-4 pb-28">{children}</main>

        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur">
          <ul className="mx-auto grid max-w-2xl grid-cols-5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      "flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <Icon className={cn("size-5 transition-transform", active && "scale-110")} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </AppLock>
  );
}
