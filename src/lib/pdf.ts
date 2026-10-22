// Builds the printable PDF backup in the browser. jsPDF is loaded only when this runs.
import { format } from "date-fns";
import { computeRice } from "./rice";

type Backup = {
  exportedAt: string;
  users: { id: string; name: string; createdAt: string }[];
  categories: { id: string; name: string }[];
  expenses: {
    id: string;
    payerId: string;
    amount: number;
    categoryId: string | null;
    description: string;
    spentAt: string;
    deletedAt: string | null;
    deletedBy: string | null;
  }[];
  expenseShares: { expenseId: string; userId: string; amount: number }[];
  transfers: {
    id: string;
    fromUserId: string;
    toUserId: string;
    amount: number;
    note: string;
    sentAt: string;
    deletedAt: string | null;
    status?: "pending" | "approved" | "declined";
  }[];
  riceEntries: {
    id: string;
    userId: string;
    givenAt: string;
    createdAt: string;
    note: string;
    deletedAt: string | null;
    trackerId?: string;
  }[];
  trackers?: { id: string; name: string; emoji: string; memberIds: string[] | null; isDefault: boolean; createdAt: string; deletedAt: string | null }[];
  auditLog: { action: string; actorId: string | null; summary: string; createdAt: string }[];
};

// The built-in PDF fonts have no ৳ glyph, so amounts use "Tk".
const tk = (poisha: number) =>
  `${poisha < 0 ? "-" : ""}Tk ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Math.abs(poisha) / 100)}`;
const d = (iso: string) => format(new Date(iso), "d MMM yyyy");

export async function downloadPdf(b: Backup) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const name = (id: string | null) => b.users.find((u) => u.id === id)?.name ?? "-";
  const cat = (id: string | null) => b.categories.find((c) => c.id === id)?.name ?? "-";
  const teal: [number, number, number] = [15, 118, 110];
  const grey: [number, number, number] = [160, 160, 160];
  let y = 48;

  doc.setFontSize(20).setTextColor(...teal).text("Flat Split - Backup", 40, y);
  doc.setFontSize(10).setTextColor(100).text(`Generated ${format(new Date(b.exportedAt), "d MMM yyyy, h:mm a")}`, 40, (y += 18));

  const live = b.expenses.filter((e) => !e.deletedAt);
  // Only transfers the receiver confirmed count toward balances.
  const liveT = b.transfers.filter((t) => !t.deletedAt && (t.status ?? "approved") === "approved");
  const sharesOf = (eid: string) => b.expenseShares.filter((s) => s.expenseId === eid);
  const balance = (uid: string) =>
    live.reduce((s, e) => s + (e.payerId === uid ? e.amount : 0) - (sharesOf(e.id).find((x) => x.userId === uid)?.amount ?? 0), 0) +
    liveT.reduce((s, t) => s + (t.fromUserId === uid ? t.amount : 0) - (t.toUserId === uid ? t.amount : 0), 0);

  const section = (title: string) => {
    doc.setFontSize(13).setTextColor(...teal).text(title, 40, y);
    y += 6;
  };
  const table = (head: string[], body: (string | number)[][], deleted?: boolean[]) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      margin: { left: 40, right: 40 },
      styles: { fontSize: 8.5, cellPadding: 4 },
      headStyles: { fillColor: teal },
      didParseCell: (data) => {
        if (data.section === "body" && deleted?.[data.row.index]) {
          data.cell.styles.textColor = grey;
          data.cell.styles.fontStyle = "italic";
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 28;
  };

  y += 30;
  section("Balances");
  table(
    ["Member", "Balance", "Meaning"],
    b.users.map((u) => {
      const v = balance(u.id);
      return [u.name, tk(v), v > 0 ? "gets back" : v < 0 ? "owes" : "settled"];
    }),
  );

  // One table per turn tracker (Rice + custom ones). Emoji aren't in the PDF font, so names only.
  const RICE_ID = "00000000-0000-4000-8000-000000000001";
  const trackers = (b.trackers ?? []).filter((t) => !t.deletedAt);
  if (!trackers.length) trackers.push({ id: RICE_ID, name: "Rice", emoji: "", memberIds: null, isDefault: true, createdAt: "2000-01-01", deletedAt: null });
  const trackerName = (id?: string) => trackers.find((t) => t.id === (id ?? RICE_ID))?.name ?? "Turn";
  for (const t of trackers) {
    const people = b.users.filter((u) => !t.memberIds || t.memberIds.includes(u.id));
    const start = new Date(t.createdAt).getTime();
    const st = computeRice(
      people.map((u) => ({ id: u.id, createdAt: new Date(Math.max(new Date(u.createdAt).getTime(), start)).toISOString() })),
      b.riceEntries
        .filter((r) => !r.deletedAt && (r.trackerId ?? RICE_ID) === t.id)
        .map((r) => ({ id: r.id, userId: r.userId, givenAt: r.givenAt, createdAt: r.createdAt })),
    );
    section(`${t.name} - cycle ${st.cycleNo}`);
    table(
      ["Member", "This cycle", "Owes (times)", "Skipped cycles", "Total done"],
      people.map((u) => {
        const s = st.members[u.id];
        return [u.name, s?.gaveThisCycle ? "Done" : "Pending", s?.owed ?? 0, s?.skips ?? 0, s?.totalGiven ?? 0];
      }),
    );
  }
  const exp = [...b.expenses].sort((a, c) => c.spentAt.localeCompare(a.spentAt));
  section(`Expenses (${live.length}, total ${tk(live.reduce((s, e) => s + e.amount, 0))})`);
  table(
    ["Date", "Description", "Category", "Paid by", "Amount", "Split between"],
    exp.map((e) => [
      d(e.spentAt),
      (e.description || "-") + (e.deletedAt ? ` [deleted by ${name(e.deletedBy)}]` : ""),
      cat(e.categoryId),
      name(e.payerId),
      tk(e.amount),
      sharesOf(e.id).map((s) => name(s.userId)).join(", "),
    ]),
    exp.map((e) => Boolean(e.deletedAt)),
  );

  const tr = [...b.transfers].sort((a, c) => c.sentAt.localeCompare(a.sentAt));
  if (tr.length) {
    section("Transfers");
    table(
      ["Date", "From", "To", "Amount", "Note"],
      tr.map((t) => [
        d(t.sentAt),
        name(t.fromUserId),
        name(t.toUserId),
        tk(t.amount),
        (t.note || "-") + (t.deletedAt ? " [deleted]" : t.status && t.status !== "approved" ? ` [${t.status}]` : ""),
      ]),
      tr.map((t) => Boolean(t.deletedAt) || (t.status ?? "approved") !== "approved"),
    );
  }

  const re = [...b.riceEntries].sort((a, c) => c.givenAt.localeCompare(a.givenAt));
  if (re.length) {
    section("Turns log");
    table(
      ["Date", "Tracker", "Done by", "Note"],
      re.map((r) => [d(r.givenAt), trackerName(r.trackerId), name(r.userId), (r.note || "-") + (r.deletedAt ? " [deleted]" : "")]),
      re.map((r) => Boolean(r.deletedAt)),
    );
  }

  section("Change log (latest 300)");
  table(
    ["When", "Who", "Action", "Details"],
    [...b.auditLog]
      .reverse()
      .slice(0, 300)
      .map((a) => [format(new Date(a.createdAt), "d MMM yy HH:mm"), name(a.actorId), a.action, a.summary.replace(/৳/g, "Tk ")]),
  );

  doc.save(`flat-split-${format(new Date(), "yyyy-MM-dd")}.pdf`);
}
