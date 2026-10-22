"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useLookups } from "@/hooks/use-data";
import { formatTaka } from "@/lib/money";
import type { TourBrief, TourStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { UserAvatar } from "./member-avatar";

export function TourStatusBadge({ status }: { status: TourStatus }) {
  const map = {
    planned: { label: "Planned", cls: "bg-muted text-muted-foreground" },
    active: { label: "Ongoing", cls: "bg-brand text-brand-foreground" },
    closed: { label: "Closed", cls: "bg-foreground/10 text-foreground/70" },
  } as const;
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", s.cls)}>
      {status === "active" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
      {s.label}
    </span>
  );
}

export function tourDates(t: TourBrief) {
  if (t.status === "closed" && t.startedAt && t.closedAt) return `${format(new Date(t.startedAt), "d MMM")} – ${format(new Date(t.closedAt), "d MMM yyyy")}`;
  if (t.startDate) return `${format(new Date(t.startDate + "T00:00:00"), "d MMM")}${t.endDate ? ` – ${format(new Date(t.endDate + "T00:00:00"), "d MMM yyyy")}` : ""}`;
  return t.status === "active" && t.startedAt ? `Since ${format(new Date(t.startedAt), "d MMM")}` : "No dates yet";
}

/** Tour in a list: status, dates, people, and spending against its budget. */
export function TourCard({ t }: { t: TourBrief }) {
  const { userById } = useLookups();
  const pct = t.planned ? Math.min(100, (t.spent / t.planned) * 100) : 0;
  const over = t.planned > 0 && t.spent > t.planned;
  return (
    <Link href={`/tours/${t.id}`} className="rise block rounded-2xl border bg-card p-4 transition active:scale-[0.99]">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-2xl">{t.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{t.name}</p>
            <TourStatusBadge status={t.status} />
          </div>
          <p className="text-xs text-muted-foreground">{tourDates(t)}</p>
          <div className="mt-2 flex -space-x-1.5">
            {t.participantIds.slice(0, 6).map((id) => (
              <UserAvatar key={id} user={userById.get(id)} className="size-6 text-[9px] ring-2 ring-card" />
            ))}
            {t.participantIds.length > 6 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[9px] ring-2 ring-card">+{t.participantIds.length - 6}</span>
            )}
          </div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" />
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{t.status === "planned" ? "Budget" : "Spent"}</span>
          <span className={cn("font-medium tabular", over && "text-negative")}>
            {t.status === "planned" ? formatTaka(t.planned) : `${formatTaka(t.spent)}${t.planned ? ` of ${formatTaka(t.planned)}` : ""}`}
          </span>
        </div>
        {t.status !== "planned" && t.planned > 0 && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-all duration-700", over ? "bg-negative" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </Link>
  );
}
