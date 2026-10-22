// How a closed tour is settled with outsiders (guests).
//
// Each guest settles with exactly ONE home sharer, chosen by account status after the tour is added:
//  - a guest who owes pays the home sharer with the MOST to receive (highest balance),
//  - a guest who is owed is paid by the home sharer who owes the MOST (lowest balance).
// Balances are updated after every assignment, so several guests spread over several home sharers.
// Whatever remains between home sharers simply joins the home fund (normal balances / settle up).

export type Payment = { from: string; to: string; amount: number };

/**
 * @param guestNets   guest id → tour net (paid − consumed, in poisha; negative = owes)
 * @param homeStatus  home sharer id → home balance + their tour net (who should receive/pay)
 */
export function settleWithGuests(guestNets: Record<string, number>, homeStatus: Record<string, number>): Payment[] {
  const balance = { ...homeStatus };
  const homeIds = Object.keys(balance);
  if (!homeIds.length) return [];
  const payments: Payment[] = [];
  // Biggest amounts first so the largest debts land on the most suitable home sharer.
  const guests = Object.entries(guestNets)
    .filter(([, net]) => net !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]));

  for (const [guest, net] of guests) {
    const pick = (cmp: (a: number, b: number) => boolean) =>
      homeIds.reduce((best, id) => (cmp(balance[id], balance[best]) ? id : best), homeIds[0]);
    if (net < 0) {
      // Guest owes: pays whoever is owed the most; receiving money lowers that person's balance.
      const to = pick((a, b) => a > b);
      payments.push({ from: guest, to, amount: -net });
      balance[to] += net;
    } else {
      // Guest is owed: paid by whoever owes the most; paying raises that person's balance.
      const from = pick((a, b) => a < b);
      payments.push({ from, to: guest, amount: net });
      balance[from] += net;
    }
  }
  return payments;
}
