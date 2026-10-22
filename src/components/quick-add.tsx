"use client";

import { createContext, useContext, useState } from "react";
import { ArrowLeftRight, Receipt, Repeat } from "lucide-react";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ExpenseForm } from "./forms/expense-form";
import { TransferForm } from "./forms/transfer-form";
import { RiceForm } from "./forms/rice-form";

type Kind = "expense" | "transfer" | "rice";
const QuickAddContext = createContext<(kind?: Kind) => void>(() => {});

/** Opens the add menu (no argument) or jumps straight to one form. Available on every app page. */
export const useQuickAdd = () => useContext(QuickAddContext);

// Order matters: Expense (the most common) sits in the middle.
const OPTIONS = [
  { kind: "rice", label: "Turn done", hint: "Rice, gas & other turns", icon: Repeat, tone: "from-yellow-300 to-lime-500" },
  { kind: "expense", label: "Expense", hint: "Something bought for the flat", icon: Receipt, tone: "from-orange-400 to-orange-700" },
  { kind: "transfer", label: "Transfer", hint: "Money handed to a flatmate", icon: ArrowLeftRight, tone: "from-sky-400 to-indigo-500" },
] as const;

export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<Kind | null>(null);

  const open = (kind?: Kind) => {
    if (kind) setForm(kind);
    else setMenu(true);
  };

  return (
    <QuickAddContext.Provider value={open}>
      {children}

      <Drawer open={menu} onOpenChange={setMenu}>
        <DrawerContent className="mx-auto max-w-2xl">
          <DrawerHeader className="text-left">
            <DrawerTitle>Add</DrawerTitle>
            <DrawerDescription>What do you want to record?</DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            {OPTIONS.map(({ kind, label, hint, icon: Icon, tone }, i) => (
              <button
                key={kind}
                onClick={() => {
                  setMenu(false);
                  // Let the menu slide away before the form slides up.
                  setTimeout(() => setForm(kind), 180);
                }}
                className="rise flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center transition active:scale-95"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className={`flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-md`}>
                  <Icon className="size-6" />
                </span>
                <span className="text-sm font-semibold">{label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <ExpenseForm open={form === "expense"} onOpenChange={(o) => !o && setForm(null)} />
      <TransferForm open={form === "transfer"} onOpenChange={(o) => !o && setForm(null)} />
      <RiceForm open={form === "rice"} onOpenChange={(o) => !o && setForm(null)} />
    </QuickAddContext.Provider>
  );
}
