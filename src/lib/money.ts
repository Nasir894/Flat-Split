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
