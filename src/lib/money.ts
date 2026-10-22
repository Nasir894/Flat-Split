// Amounts travel and are stored as integer poisha (1 ৳ = 100 poisha).

export function toPoisha(taka: string | number): number {
  const n = typeof taka === "number" ? taka : Number(String(taka).replace(/,/g, ""));
  return Math.round(n * 100);
}

const fmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export function formatTaka(poisha: number, opts: { sign?: boolean } = {}): string {
  const taka = poisha / 100;
  const s = `৳${fmt.format(Math.abs(taka))}`;
  if (taka < 0) return `-${s}`;
  if (opts.sign && taka > 0) return `+${s}`;
  return s;
}

/** Splits `amount` equally; leftover poisha go one each to the first ids (sorted for determinism). */
export function splitEqual(amount: number, userIds: string[]): { userId: string; amount: number }[] {
  const ids = [...new Set(userIds)].sort();
  const base = Math.floor(amount / ids.length);
  let rest = amount - base * ids.length;
  return ids.map((userId) => ({ userId, amount: base + (rest-- > 0 ? 1 : 0) }));
}

export type SplitMode = "equal" | "extra" | "exact";
export type SplitEntry = { userId: string; mode: SplitMode; value: number };
export type SplitResult = { ok: true; shares: { userId: string; amount: number }[] } | { ok: false; error: string };

/**
 * Restaurant-style split when you only know some of the prices:
 *  - exact: this person's share is exactly `value`
 *  - extra: equal part + `value` (negative = ate less)
 *  - equal: just the equal part
 * Whatever the exact shares and extras don't cover is split equally among everyone not on "exact".
 * All in poisha; leftover poisha go one each to the first ids (sorted), so shares always add up to `total`.
 */
export function computeSplit(total: number, entries: SplitEntry[], nameOf: (id: string) => string = () => "Someone"): SplitResult {
  if (!entries.length) return { ok: false, error: "Pick who consumed it" };
  const exact = entries.filter((e) => e.mode === "exact");
  const flexible = entries.filter((e) => e.mode !== "exact").sort((a, b) => a.userId.localeCompare(b.userId));
  const exactSum = exact.reduce((s, e) => s + e.value, 0);
  if (exact.some((e) => e.value < 0)) return { ok: false, error: "Exact amounts can't be negative" };
  if (exactSum > total) return { ok: false, error: "The exact amounts add up to more than the bill" };
  if (!flexible.length) {
    return exactSum === total
      ? { ok: true, shares: exact.map((e) => ({ userId: e.userId, amount: e.value })) }
      : { ok: false, error: `Exact amounts must add up to the bill (${formatTaka(exactSum)} of ${formatTaka(total)})` };
  }
  const extras = flexible.reduce((s, e) => s + (e.mode === "extra" ? e.value : 0), 0);
  const rest = total - exactSum - extras;
  const base = Math.floor(rest / flexible.length);
  let leftover = rest - base * flexible.length;
  const shares = [
    ...exact.map((e) => ({ userId: e.userId, amount: e.value })),
    ...flexible.map((e) => ({ userId: e.userId, amount: base + (leftover-- > 0 ? 1 : 0) + (e.mode === "extra" ? e.value : 0) })),
  ];
  const negative = shares.find((s) => s.amount < 0);
  if (negative) return { ok: false, error: `${nameOf(negative.userId)}'s share would be below zero. Check the amounts.` };
  return { ok: true, shares };
}

/** Greedy "who pays whom" plan that settles all balances with few transfers. */
export function settlePlan(balances: { id: string; balance: number }[]) {
  const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b, left: -b.balance }));
  const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ ...b, left: b.balance }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);
  const plan: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].left, creditors[j].left);
    if (amt > 0) plan.push({ from: debtors[i].id, to: creditors[j].id, amount: amt });
    debtors[i].left -= amt;
    creditors[j].left -= amt;
    if (debtors[i].left === 0) i++;
    if (creditors[j].left === 0) j++;
  }
  return plan;
}
