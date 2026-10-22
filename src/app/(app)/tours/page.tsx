"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Luggage, Plus } from "lucide-react";
import { useLookups, useSummary } from "@/hooks/use-data";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyTabs } from "@/components/money-tabs";
import { TourCard } from "@/components/tour-card";
import { TourDownloads } from "@/components/tour-downloads";
import { TourForm } from "@/components/forms/tour-form";
import { EmptyState } from "@/components/records";

/** All tours: ongoing and planned first, then the archive of closed ones. */
export default function ToursPage() {
  const router = useRouter();
  const { data } = useSummary();
  const { tours, isGuest } = useLookups();
  const [planning, setPlanning] = useState(false);

  if (!data) return <Skeleton className="h-64" />;
  const open = tours.filter((t) => t.status !== "closed");
  const archive = tours.filter((t) => t.status === "closed");

  return (
    <div className="space-y-5">
      {!isGuest && <MoneyTabs />}

      {!isGuest && (
        <Button className="w-full" onClick={() => setPlanning(true)}>
          <Plus /> Plan a tour
        </Button>
      )}

      {tours.length === 0 && (
        <EmptyState
          icon={Luggage}
          text={isGuest ? "You haven't been added to a tour yet. Ask a home sharer to add you." : "No tours yet. Plan one for your next trip!"}
        />
      )}

      {open.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Ongoing &amp; planned</h2>
          {open.map((t) => (
            <TourCard key={t.id} t={t} />
          ))}
        </section>
      )}

      {archive.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Archive</h2>
          {archive.map((t) => (
            <TourCard key={t.id} t={t} />
          ))}
        </section>
      )}

      {tours.length > 0 && (
        <section className="space-y-2 rounded-2xl border bg-card p-4">
          <p className="font-semibold">Download the tour archive</p>
          <p className="text-xs text-muted-foreground">Every tour you can see, with expenses, balances, plans and settlements.</p>
          <TourDownloads />
        </section>
      )}

      <TourForm open={planning} onOpenChange={setPlanning} onSaved={(id) => router.push(`/tours/${id}`)} />
    </div>
  );
}
