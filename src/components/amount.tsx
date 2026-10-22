import { cn } from "@/lib/utils";

const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Big money figure in the Aurex style: "৳89,41" bold with the ".00" faded. */
export function Amount({ poisha, className, sign }: { poisha: number; className?: string; sign?: boolean }) {
  const abs = Math.abs(poisha);
  const taka = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const prefix = poisha < 0 ? "-" : sign && poisha > 0 ? "+" : "";
  return (
    <span className={cn("tabular tracking-tight", className)}>
      {prefix}৳{whole.format(taka)}
      <span className="opacity-35">.{cents}</span>
    </span>
  );
}
