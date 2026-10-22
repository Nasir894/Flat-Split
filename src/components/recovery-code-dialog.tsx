"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Shows a freshly issued recovery code once. It can't be shown again, only replaced. */
export function RecoveryCodeDialog({ code, onDone }: { code: string | null; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {}
  };

  return (
    <AlertDialog open={Boolean(code)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" /> Save your recovery code
          </AlertDialogTitle>
          <AlertDialogDescription>
            If you forget your PIN, this code lets you set a new one. Screenshot it or write it down. It won&apos;t be
            shown again, and it works only once (you&apos;ll get a new one after using it).
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary/40 bg-muted p-4">
          <code className="flex-1 text-center font-mono text-2xl font-bold tracking-widest select-all">{code}</code>
          <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy recovery code">
            {copied ? <Check className="text-positive" /> : <Copy />}
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => {
              setCopied(false);
              onDone();
            }}
          >
            I&apos;ve saved it
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
