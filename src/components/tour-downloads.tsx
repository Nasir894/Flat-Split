"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Excel (also opens in Google Sheets) / CSV / PDF summary of one tour or the whole archive. */
export function TourDownloads({ tourId }: { tourId?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message || "Download failed");
    } finally {
      setBusy(null);
    }
  };
  const lib = () => import("@/lib/tour-export");
  return (
    <div className="grid grid-cols-3 gap-2">
      <Button variant="outline" disabled={!!busy} onClick={run("x", async () => (await lib()).downloadToursExcel(tourId))}>
        {busy === "x" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Excel
      </Button>
      <Button variant="outline" disabled={!!busy} onClick={run("c", async () => (await lib()).downloadToursCsv(tourId))}>
        {busy === "c" ? <Loader2 className="animate-spin" /> : <Sheet />} Sheets
      </Button>
      <Button variant="outline" disabled={!!busy} onClick={run("p", async () => (await lib()).downloadToursPdf(tourId))}>
        {busy === "p" ? <Loader2 className="animate-spin" /> : <FileText />} PDF
      </Button>
    </div>
  );
}
