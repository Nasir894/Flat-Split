// Full house archive as a spreadsheet (runs in the browser; SheetJS loads only when used).
//  - Excel (.xlsx, also opens in Google Sheets): Balances, Expenses, Transfers, Turns, Tours, Tour plan,
//    People, Categories, Deleted, Activity
//  - CSV (for Google Sheets): every live expense and transfer in one table
// Main sheets hold only live (not deleted) records; deleted ones are kept apart on the "Deleted" sheet.
import { format } from "date-fns";
import { api } from "./api";

type Meta = { createdBy: string | null; createdAt: string; updatedBy: string | null; updatedAt: string | null; deletedBy: string | null; deletedAt: string | null };

type Backup = {
  users: { id: string; name: string; role?: string; createdAt: string }[];
  categories: { id: string; name: string; emoji: string; deletedAt: string | null }[];
  expenses: (Meta & { id: string; payerId: string; amount: number; categoryId: string | null; description: string; spentAt: string; tourId?: string | null })[];
  expenseShares: { expenseId: string; userId: string; amount: number }[];
  transfers: (Meta & {
    id: string;
    fromUserId: string;
    toUserId: string;
    amount: number;
    note: string;
    sentAt: string;
    status?: string;
    tourId?: string | null;
    settlement?: boolean;
  })[];
  riceEntries: (Meta & { id: string; userId: string; givenAt: string; note: string; trackerId?: string | null })[];
  trackers?: { id: string; name: string; emoji: string; isDefault: boolean }[];
  tours?: { id: string; name: string; emoji: string; status: string; startDate: string | null; endDate: string | null; startedAt: string | null; closedAt: string | null; deletedAt: string | null }[];
  tourParticipants?: { tourId: string; userId: string }[];
  tourPlanItems?: { tourId: string; label: string; categoryId: string | null; amount: number }[];
  auditLog: { action: string; actorId: string | null; summary: string; createdAt: string }[];
};

const taka = (poisha: number) => Math.round(poisha) / 100;
const day = (iso: string | null | undefined) => (iso ? format(new Date(iso), "yyyy-MM-dd") : "");
const stamp = (iso: string | null | undefined) => (iso ? format(new Date(iso), "yyyy-MM-dd HH:mm") : "");
const STATUS: Record<string, string> = { planned: "Planned", active: "Ongoing", closed: "Closed" };

export function buildRecordsArchive(b: Backup) {
  const people = [...b.users].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  const name = (id: string | null | undefined) => (id ? (people.find((u) => u.id === id)?.name ?? "Former member") : "");
  const category = (id: string | null) => {
    const c = b.categories.find((x) => x.id === id);
    return c ? `${c.emoji} ${c.name}`.trim() : "Uncategorized";
  };
  const tours = b.tours ?? [];
  const tour = (id: string | null | undefined) => (id ? (tours.find((t) => t.id === id)?.name ?? "Deleted tour") : "Home");
  const trackerName = (id: string | null | undefined) => {
    const ts = b.trackers ?? [];
    const t = ts.find((x) => x.id === id) ?? ts.find((x) => x.isDefault);
    return t ? `${t.emoji} ${t.name}`.trim() : "Rice";
  };
  const sharesOf = (expenseId: string) => b.expenseShares.filter((s) => s.expenseId === expenseId);

  const liveExpenses = b.expenses.filter((e) => !e.deletedAt).sort((x, y) => x.spentAt.localeCompare(y.spentAt));
  const liveTransfers = b.transfers.filter((t) => !t.deletedAt).sort((x, y) => x.sentAt.localeCompare(y.sentAt));
  const liveTurns = b.riceEntries.filter((r) => !r.deletedAt).sort((x, y) => x.givenAt.localeCompare(y.givenAt));

  // Home-fund balances, same rules as the app: home records plus closed tours; approved transfers only.
  const inHomeFund = (tourId?: string | null) => !tourId || tours.find((t) => t.id === tourId)?.status === "closed";
  const balances = people
    .filter((u) => (u.role ?? "member") === "member")
    .map((u) => {
      const paid = liveExpenses.filter((e) => inHomeFund(e.tourId) && e.payerId === u.id).reduce((s, e) => s + e.amount, 0);
      const share = liveExpenses
        .filter((e) => inHomeFund(e.tourId))
        .reduce((s, e) => s + sharesOf(e.id).filter((x) => x.userId === u.id).reduce((a, x) => a + x.amount, 0), 0);
      const approved = liveTransfers.filter((t) => inHomeFund(t.tourId) && (t.status ?? "approved") === "approved");
      const sent = approved.filter((t) => t.fromUserId === u.id).reduce((s, t) => s + t.amount, 0);
      const received = approved.filter((t) => t.toUserId === u.id).reduce((s, t) => s + t.amount, 0);
      return {
        Person: u.name,
        "Paid (৳)": taka(paid),
        "Share (৳)": taka(share),
        "Sent (৳)": taka(sent),
        "Received (৳)": taka(received),
        "Balance (৳)": taka(paid - share + sent - received),
        "": paid - share + sent - received > 0 ? "gets back" : paid - share + sent - received < 0 ? "owes" : "settled",
      };
    });

  const expenseRow = (e: Backup["expenses"][number]) => {
    const shares = sharesOf(e.id);
    return {
      Date: day(e.spentAt),
      Description: e.description,
      Category: category(e.categoryId),
      "Paid by": name(e.payerId),
      "Amount (৳)": taka(e.amount),
      Where: tour(e.tourId),
      "Split between": shares.map((s) => name(s.userId)).join(", "),
      // One column per person with their exact share, so totals can be summed per person.
      ...Object.fromEntries(people.map((u) => [`${u.name} share (৳)`, taka(shares.find((s) => s.userId === u.id)?.amount ?? 0)])),
      "Added by": name(e.createdBy),
      "Added on": stamp(e.createdAt),
      "Last edited": e.updatedAt ? `${stamp(e.updatedAt)} by ${name(e.updatedBy)}` : "",
    };
  };

  const transferRow = (t: Backup["transfers"][number]) => ({
    Date: day(t.sentAt),
    From: name(t.fromUserId),
    To: name(t.toUserId),
    "Amount (৳)": taka(t.amount),
    Note: t.note,
    Status: t.status ?? "approved",
    Where: tour(t.tourId),
    "Tour settlement": t.settlement ? "yes" : "",
    "Added by": name(t.createdBy),
    "Added on": stamp(t.createdAt),
  });

  const deleted = [
    ...b.expenses
      .filter((e) => e.deletedAt)
      .map((e) => ({ Type: "Expense", Date: day(e.spentAt), Details: `${e.description || "-"} · paid by ${name(e.payerId)}`, "Amount (৳)": taka(e.amount), Where: tour(e.tourId), at: e.deletedAt!, by: e.deletedBy })),
    ...b.transfers
      .filter((t) => t.deletedAt)
      .map((t) => ({ Type: "Transfer", Date: day(t.sentAt), Details: `${name(t.fromUserId)} → ${name(t.toUserId)}${t.note ? ` · ${t.note}` : ""}`, "Amount (৳)": taka(t.amount), Where: tour(t.tourId), at: t.deletedAt!, by: t.deletedBy })),
    ...b.riceEntries
      .filter((r) => r.deletedAt)
      .map((r) => ({ Type: "Turn", Date: day(r.givenAt), Details: `${trackerName(r.trackerId)} · ${name(r.userId)}`, "Amount (৳)": "", Where: "Home", at: r.deletedAt!, by: r.deletedBy })),
  ]
    .sort((x, y) => x.at.localeCompare(y.at))
    .map(({ at, by, ...row }) => ({ ...row, "Deleted on": stamp(at), "Deleted by": name(by) }));

  const sheets = {
    Balances: balances,
    Expenses: liveExpenses.map(expenseRow),
    Transfers: liveTransfers.map(transferRow),
    Turns: liveTurns.map((r) => ({ Date: day(r.givenAt), Turn: trackerName(r.trackerId), "Done by": name(r.userId), Note: r.note, "Added by": name(r.createdBy) })),
    Tours: tours
      .filter((t) => !t.deletedAt)
      .map((t) => {
        const spent = liveExpenses.filter((e) => e.tourId === t.id).reduce((s, e) => s + e.amount, 0);
        const budget = (b.tourPlanItems ?? []).filter((p) => p.tourId === t.id).reduce((s, p) => s + p.amount, 0);
        return {
          Tour: `${t.emoji} ${t.name}`.trim(),
          Status: STATUS[t.status] ?? t.status,
          "Planned start": t.startDate ?? "",
          "Planned end": t.endDate ?? "",
          Started: day(t.startedAt),
          Closed: day(t.closedAt),
          People: (b.tourParticipants ?? []).filter((p) => p.tourId === t.id).map((p) => name(p.userId)).join(", "),
          "Budget (৳)": taka(budget),
          "Spent (৳)": taka(spent),
        };
      }),
    "Tour plan": (b.tourPlanItems ?? []).map((p) => ({ Tour: tour(p.tourId), "Plan line": p.label, Category: p.categoryId ? category(p.categoryId) : "", "Budget (৳)": taka(p.amount) })),
    People: people.map((u) => ({ Name: u.name, Role: u.role === "guest" ? "Tour guest" : "Home sharer", Joined: day(u.createdAt) })),
    Categories: b.categories.filter((c) => !c.deletedAt).map((c) => ({ Category: `${c.emoji} ${c.name}`.trim() })),
    Deleted: deleted,
    Activity: b.auditLog.map((a) => ({ When: stamp(a.createdAt), Who: name(a.actorId), What: a.summary })),
  };

  // CSV: one table with every live expense and transfer, oldest first.
  const ledger = [
    ...liveExpenses.map((e) => ({ at: e.spentAt, row: { Type: "Expense", ...expenseRow(e) } })),
    ...liveTransfers.map((t) => {
      const { From, To, Note, ...rest } = transferRow(t);
      return { at: t.sentAt, row: { Type: "Transfer", ...rest, Description: Note, "Paid by": From, To } };
    }),
  ]
    .sort((x, y) => x.at.localeCompare(y.at))
    .map((x) => x.row);

  return { sheets, ledger };
}

const fileBase = () => `flat-split-records-${format(new Date(), "yyyy-MM-dd")}`;

export async function downloadRecordsExcel() {
  const [XLSX, b] = await Promise.all([import("xlsx"), api<Backup>("/api/backup")]);
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(buildRecordsArchive(b).sheets)) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Nothing here yet" }]);
    ws["!cols"] = Object.keys(rows[0] ?? { "": "" }).map((k) => ({ wch: Math.max(12, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  XLSX.writeFile(wb, `${fileBase()}.xlsx`);
}

export async function downloadRecordsCsv() {
  const [XLSX, b] = await Promise.all([import("xlsx"), api<Backup>("/api/backup")]);
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(buildRecordsArchive(b).ledger));
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM so Excel reads ৳ / Bangla correctly
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileBase()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
