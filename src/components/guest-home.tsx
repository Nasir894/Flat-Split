"use client";

import { Luggage } from "lucide-react";
import { useLookups, useSummary } from "@/hooks/use-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "./records";
import { TourCard } from "./tour-card";
import { TransferItem } from "./transfer-item";
import { TourDownloads } from "./tour-downloads";

/** A guest's home page: only their tours (ongoing first), and payments waiting for their OK. */
export function GuestHome() {
  const { data } = useSummary();
  const { tours, users, meId } = useLookups();
  if (!data) return <Skeleton className="h-64 rounded-2xl" />;
  const me = data.guests.find((g) => g.id === meId);
  const awaiting = data.awaitingMe ?? [];

  return (
    <div className="space-y-5">
      <section className="rise px-1 pt-2">
        <p className="text-sm text-foreground/65">Welcome{me ? `, ${me.name}` : ""}</p>
        <p className="text-2xl font-bold">Your tours with {users.length ? users.map((u) => u.name).join(", ") : "the flat"}</p>
      </section>

      {awaiting.length > 0 && (
        <Card className="rise border-brand/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="size-2 animate-pulse rounded-full bg-brand" /> Confirm payments to you
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {awaiting.map((t) => (
              <TransferItem key={t.id} t={t} onEdit={() => {}} />
            ))}
          </CardContent>
        </Card>
      )}

      {tours.length === 0 ? (
        <EmptyState icon={Luggage} text="You haven't been added to a tour yet. A home sharer can add you to one." />
      ) : (
        <div className="space-y-2">
          {tours.map((t) => (
            <TourCard key={t.id} t={t} />
          ))}
        </div>
      )}

      {tours.length > 0 && (
        <section className="space-y-2 rounded-2xl border bg-card p-4">
          <p className="font-semibold">Download your tours</p>
          <TourDownloads />
        </section>
      )}
    </div>
  );
}
