"use client";

import { format } from "date-fns";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

/** Bottom sheet used by all add/edit forms. */
export function FormDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="mx-auto max-h-[92dvh] max-w-2xl">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

export const toDateInput = (iso?: string) => format(iso ? new Date(iso) : new Date(), "yyyy-MM-dd");

/** Date input value → ISO. Keeps the original time if the day didn't change; "today" means now. */
export function fromDateInput(value: string, original?: string): string {
  if (original && toDateInput(original) === value) return new Date(original).toISOString();
  if (value === toDateInput()) return new Date().toISOString();
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

export function AmountInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-2xl text-muted-foreground">৳</span>
      <input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        {...props}
        className="h-14 w-full rounded-xl border bg-transparent pr-3 pl-9 text-3xl font-semibold tabular outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  );
}

export const cleanAmount = (v: string) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").replace(/(\.\d{2}).+/, "$1");
