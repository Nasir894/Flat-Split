// Tour archive downloads (runs in the browser; libraries load only when used).
//  - Excel (.xlsx, also opens in Google Sheets): Tours, Expenses, Transfers, Balances, Plan, Settlements, Deleted
//  - CSV: every live tour expense in one sheet
// Deleted expenses are left out of the main sheets and listed on "Deleted".
//  - PDF: a summary per tour
import { format } from "date-fns";
import { api } from "./api";

type Archive = {
  tours: {
    id: string;
    name: string;
    emoji: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    startedAt: string | null;
    closedAt: string | null;
    participantIds: string[];
    spent: number;
    planned: number;
  }[];
  expenses: {
    tourId: string;
    spentAt: string;
    description: string;
    categoryId: string | null;
    payerId: string;
    amount: number;
    deleted: boolean;
    consumerIds: string[];
    shares: { userId: string; amount: number }[];
  }[];
  nets: { tourId: string; id: string; paid: number; consumed: number; net: number }[];
  plan: { tourId: string; label: string; categoryId: string | null; amount: number }[];
  // Every live transfer on the tour; `settlement` marks the ones created when the tour closed.
  settlements: { tourId: string; fromUserId: string; toUserId: string; amount: number; status: string; settlement: boolean; note: string; sentAt: string }[];
  people: { id: string; name: string; role: string }[];
  categories: { id: string; name: string; emoji: string }[];
};

const taka = (poisha: number) => Math.round(poisha) / 100;
const d = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd") : "");
const STATUS: Record<string, string> = { planned: "Planned", active: "Ongoing", closed: "Closed" };

async function load(tourId?: string): Promise<Archive> {
  const a = await api<Archive>("/api/tours/export");
  if (!tourId) return a;
  const only = <T extends { tourId: string }>(rows: T[]) => rows.filter((r) => r.tourId === tourId);
  return {
    ...a,
    tours: a.tours.filter((t) => t.id === tourId),
    expenses: only(a.expenses),
    nets: only(a.nets),
    plan: only(a.plan),
    settlements: only(a.settlements),
  };
}

function helpers(a: Archive) {
  const person = (id: string) => a.people.find((p) => p.id === id)?.name ?? "Unknown";
  const role = (id: string) => (a.people.find((p) => p.id === id)?.role === "guest" ? "Guest" : "Home sharer");
  const category = (id: string | null) => {
    const c = a.categories.find((x) => x.id === id);
    return c ? c.name : "Uncategorized";
  };
  const tourName = (id: string) => a.tours.find((t) => t.id === id)?.name ?? "";
  return { person, role, category, tourName };
}

function sheets(a: Archive) {
  const { person, role, category, tourName } = helpers(a);
  return {
    Tours: a.tours.map((t) => ({
      Tour: t.name,
      Status: STATUS[t.status] ?? t.status,
      "Planned start": t.startDate ?? "",
      "Planned end": t.endDate ?? "",
      Started: d(t.startedAt),
      Closed: d(t.closedAt),
      People: t.participantIds.map(person).join(", "),
      "Budget (৳)": taka(t.planned),
      "Spent (৳)": taka(t.spent),
      "Over / under (৳)": taka(t.spent - t.planned),
    })),
    Expenses: a.expenses
      .filter((e) => !e.deleted)
      .map((e) => ({
        Tour: tourName(e.tourId),
        Date: d(e.spentAt),
        Description: e.description,
        Category: category(e.categoryId),
        "Paid by": person(e.payerId),
        "Amount (৳)": taka(e.amount),
        "Split between": e.consumerIds.map(person).join(", "),
        // One column per person with their exact share.
        ...Object.fromEntries(a.people.map((p) => [`${p.name} share (৳)`, taka(e.shares.find((s) => s.userId === p.id)?.amount ?? 0)])),
      })),
    Transfers: a.settlements
      .filter((s) => !s.settlement)
      .map((s) => ({
        Tour: tourName(s.tourId),
        Date: d(s.sentAt),
        From: person(s.fromUserId),
        To: person(s.toUserId),
        "Amount (৳)": taka(s.amount),
        Note: s.note,
        Status: s.status,
      })),
    Balances: a.nets.map((n) => ({
      Tour: tourName(n.tourId),
      Person: person(n.id),
      Role: role(n.id),
      "Paid (৳)": taka(n.paid),
      "Share (৳)": taka(n.consumed),
      "Net (৳)": taka(n.net),
    })),
    Plan: a.plan.map((p) => ({ Tour: tourName(p.tourId), "Plan line": p.label, Category: p.categoryId ? category(p.categoryId) : "", "Budget (৳)": taka(p.amount) })),
    Settlements: a.settlements.filter((s) => s.settlement).map((s) => ({
      Tour: tourName(s.tourId),
      From: person(s.fromUserId),
      To: person(s.toUserId),
      "Amount (৳)": taka(s.amount),
      Status: s.status,
    })),
    Deleted: a.expenses
      .filter((e) => e.deleted)
      .map((e) => ({ Tour: tourName(e.tourId), Date: d(e.spentAt), Description: e.description, "Paid by": person(e.payerId), "Amount (৳)": taka(e.amount) })),
  };
}

const fileBase = (a: Archive) =>
  `flat-split-${a.tours.length === 1 ? a.tours[0].name.replace(/[^\w-]+/g, "-").toLowerCase() : "tours"}-${format(new Date(), "yyyy-MM-dd")}`;

export async function downloadToursExcel(tourId?: string) {
  const [XLSX, a] = await Promise.all([import("xlsx"), load(tourId)]);
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets(a))) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "": "Nothing here yet" }]);
    ws["!cols"] = Object.keys(rows[0] ?? { "": "" }).map((k) => ({ wch: Math.max(12, k.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `${fileBase(a)}.xlsx`);
}

export async function downloadToursCsv(tourId?: string) {
  const [XLSX, a] = await Promise.all([import("xlsx"), load(tourId)]);
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(sheets(a).Expenses));
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }); // BOM so Excel reads ৳ / Bangla correctly
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileBase(a)}-expenses.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function downloadToursPdf(tourId?: string) {
  const [{ jsPDF }, { default: autoTable }, a] = await Promise.all([import("jspdf"), import("jspdf-autotable"), load(tourId)]);
  const { person, role, category } = helpers(a);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  // The built-in PDF fonts have no ৳ glyph, so amounts use "Tk".
  const tk = (p: number) => `${p < 0 ? "-" : ""}Tk ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Math.abs(p) / 100)}`;
  const copper: [number, number, number] = [196, 90, 30];
  let y = 48;
  const table = (head: string[], body: (string | number)[][]) => {
    autoTable(doc, { startY: y, head: [head], body, margin: { left: 40, right: 40 }, styles: { fontSize: 9, cellPadding: 4 }, headStyles: { fillColor: copper } });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  };
  const heading = (text: string, size = 13) => {
    if (y > 740) {
      doc.addPage();
      y = 48;
    }
    doc.setFontSize(size).setTextColor(...copper).text(text, 40, y);
    y += 8;
  };

  doc.setFontSize(20).setTextColor(...copper).text("Flat Split - Tour summary", 40, y);
  doc.setFontSize(10).setTextColor(110).text(`Generated ${format(new Date(), "d MMM yyyy, h:mm a")}`, 40, (y += 16));
  y += 24;

  if (!a.tours.length) doc.setTextColor(60).text("No tours yet.", 40, y);
  a.tours.forEach((t, i) => {
    if (i > 0) {
      doc.addPage();
      y = 48;
    }
    heading(`${t.name} (${STATUS[t.status] ?? t.status})`, 16);
    y += 6;
    doc.setFontSize(10).setTextColor(60);
    const dates = [t.startDate && `Planned ${t.startDate}${t.endDate ? ` to ${t.endDate}` : ""}`, t.startedAt && `Started ${d(t.startedAt)}`, t.closedAt && `Closed ${d(t.closedAt)}`]
      .filter(Boolean)
      .join(" · ");
    if (dates) doc.text(dates, 40, (y += 12));
    doc.text(`Budget ${tk(t.planned)} · Spent ${tk(t.spent)} · ${t.spent > t.planned ? "Over" : "Under"} by ${tk(Math.abs(t.spent - t.planned))}`, 40, (y += 14));
    y += 18;

    const exp = a.expenses.filter((e) => e.tourId === t.id && !e.deleted);
    const byCat = new Map<string, number>();
    exp.forEach((e) => byCat.set(category(e.categoryId), (byCat.get(category(e.categoryId)) ?? 0) + e.amount));
    const planByCat = new Map<string, number>();
    a.plan.filter((p) => p.tourId === t.id).forEach((p) => {
      const key = p.categoryId ? category(p.categoryId) : p.label;
      planByCat.set(key, (planByCat.get(key) ?? 0) + p.amount);
    });
    const keys = [...new Set([...planByCat.keys(), ...byCat.keys()])];
    heading("Plan vs actual");
    table(
      ["Item / category", "Planned", "Actual", "Difference"],
      keys.map((k) => [k, tk(planByCat.get(k) ?? 0), tk(byCat.get(k) ?? 0), tk((byCat.get(k) ?? 0) - (planByCat.get(k) ?? 0))]),
    );
    heading("People");
    table(
      ["Person", "Role", "Paid", "Share", "Net"],
      a.nets.filter((n) => n.tourId === t.id).map((n) => [person(n.id), role(n.id), tk(n.paid), tk(n.consumed), tk(n.net)]),
    );
    const st = a.settlements.filter((s) => s.tourId === t.id && s.settlement);
    if (st.length) {
      heading("Settlement with guests");
      table(["From", "To", "Amount", "Status"], st.map((s) => [person(s.fromUserId), person(s.toUserId), tk(s.amount), s.status]));
    }
  });
  doc.save(`${fileBase(a)}.pdf`);
}
