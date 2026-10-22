"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/** Switch between Expenses and Transfers (they share the "Expenses" tab in the bottom nav). */
export function MoneyTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/expenses", label: "Expenses", icon: Receipt },
    { href: "/transfers", label: "Transfers", icon: ArrowLeftRight },
  ];
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-all",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </div>
  );
}
