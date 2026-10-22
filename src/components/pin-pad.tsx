"use client";

import { useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

/** 4-digit PIN entry with an on-screen keypad (also accepts the physical keyboard). */
export function PinPad({
  onComplete,
  busy,
  error,
}: {
  onComplete: (pin: string) => Promise<unknown> | void;
  busy?: boolean;
  error?: string | null;
}) {
  const [pin, setPinState] = useState("");
  const pinRef = useRef("");
  const setPin = (p: string) => {
    pinRef.current = p;
    setPinState(p);
  };

  const press = (d: string) => {
    if (busy) return;
    if (pinRef.current.length >= 4) return;
    const next = pinRef.current + d;
    setPin(next);
    if (next.length === 4) setTimeout(() => Promise.resolve(onComplete(next)).finally(() => setPin("")), 80);
  };
  const back = () => !busy && setPin(pinRef.current.slice(0, -1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-col items-center gap-6">
      <div key={error ?? ""} className={cn("flex gap-4", error && "animate-[shake_0.4s]")} aria-label={`${pin.length} of 4 digits entered`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "size-4 rounded-full border-2 border-primary transition-all duration-150",
              i < pin.length ? "scale-110 bg-primary" : "bg-transparent",
            )}
          />
        ))}
      </div>
      <p className="h-5 text-center text-sm text-negative">{error}</p>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)}>
            {d}
          </Key>
        ))}
        <span />
        <Key onClick={() => press("0")}>0</Key>
        <Key onClick={back} aria-label="Delete digit">
          <Delete className="size-6" />
        </Key>
      </div>
      <style>{`@keyframes shake{0%,100%{transform:none}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

function Key(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="flex size-18 items-center justify-center rounded-full bg-muted text-2xl font-medium tabular transition active:scale-95 active:bg-primary/20"
    />
  );
}
