"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { CACHE_KEY } from "@/components/providers";
import { Button } from "@/components/ui/button";

// Shown instead of a blank "This page couldn't load" if a screen crashes.
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rise mx-auto mt-16 max-w-sm space-y-4 text-center">
      <p className="text-lg font-semibold">Something went wrong on this screen</p>
      <p className="text-sm text-muted-foreground">
        Usually clearing the saved data on this device fixes it. Your records are safe on the server.
      </p>
      <Button
        className="w-full"
        onClick={() => {
          try {
            localStorage.removeItem(CACHE_KEY);
          } catch {}
          reset();
          location.reload();
        }}
      >
        <RotateCcw /> Reload
      </Button>
    </div>
  );
}
