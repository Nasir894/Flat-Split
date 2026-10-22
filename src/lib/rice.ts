// Rice cycle rules (replayed from the full history, so edits/deletes stay consistent):
// - When a cycle starts, every member's owed count goes up by 1.
// - Each time someone gives rice, their owed count goes down by 1.
// - If someone who already gave in the current cycle gives again while owing 0 or less,
//   that gift starts a new cycle (everyone +1, then their gift -1).
// - A member who never gave during a cycle that has ended "skipped" that cycle.
// - A member who joins mid-cycle joins the current cycle (+1).

export type RiceMember = { id: string; createdAt: string };
export type RiceEntry = { id: string; userId: string; givenAt: string; createdAt: string };

export type RiceCycle = {
  no: number;
  startedAt: string;
  endedAt: string | null;
  givers: string[];
  skippers: string[];
};

export type RiceStatus = {
  cycleNo: number;
  cycles: RiceCycle[];
  entryCycle: Record<string, number>;
  members: Record<
    string,
    { owed: number; gaveThisCycle: boolean; skips: number; totalGiven: number; lastGivenAt: string | null }
  >;
};

export function computeRice(members: RiceMember[], entries: RiceEntry[]): RiceStatus {
  type Ev = { at: string; tie: string; kind: "join"; m: RiceMember } | { at: string; tie: string; kind: "give"; e: RiceEntry };
  const events: Ev[] = [
    ...members.map((m) => ({ at: m.createdAt, tie: "0" + m.createdAt, kind: "join" as const, m })),
    ...entries.map((e) => ({ at: e.givenAt, tie: "1" + e.createdAt, kind: "give" as const, e })),
  ].sort((a, b) => (a.at === b.at ? a.tie.localeCompare(b.tie) : a.at < b.at ? -1 : 1));

  const state: RiceStatus["members"] = {};
  const cycles: RiceCycle[] = [];
  const entryCycle: Record<string, number> = {};
  let current: RiceCycle | null = null;
  let givers = new Set<string>();

  for (const ev of events) {
    if (ev.kind === "join") {
      state[ev.m.id] = { owed: 1, gaveThisCycle: false, skips: 0, totalGiven: 0, lastGivenAt: null };
      if (!current) current = { no: 1, startedAt: ev.at, endedAt: null, givers: [], skippers: [] };
      continue;
    }
    const u = ev.e.userId;
    const s = state[u];
    if (!s || !current) continue; // entry for unknown member; ignore
    if (givers.has(u) && s.owed <= 0) {
      // Close the current cycle and start a new one with this gift.
      current.endedAt = ev.at;
      current.givers = [...givers];
      current.skippers = Object.keys(state).filter((id) => !givers.has(id));
      for (const id of current.skippers) state[id].skips++;
      cycles.push(current);
      current = { no: current.no + 1, startedAt: ev.at, endedAt: null, givers: [], skippers: [] };
      givers = new Set();
      for (const id of Object.keys(state)) state[id].owed++;
    }
    s.owed--;
    s.totalGiven++;
    s.lastGivenAt = ev.at;
    givers.add(u);
    entryCycle[ev.e.id] = current.no;
  }

  if (current) {
    current.givers = [...givers];
    cycles.push(current);
  }
  for (const id of Object.keys(state)) state[id].gaveThisCycle = givers.has(id);

  return { cycleNo: current?.no ?? 1, cycles: cycles.reverse(), entryCycle, members: state };
}
