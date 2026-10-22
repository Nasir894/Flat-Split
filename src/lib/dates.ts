import { format, isToday, isYesterday } from "date-fns";

export const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEE, d MMM yyyy");
};

/** Groups items by calendar day, keeping order. */
export function byDay<T>(items: T[], at: (t: T) => string) {
  const groups: { day: string; items: T[] }[] = [];
  for (const it of items) {
    const day = format(new Date(at(it)), "yyyy-MM-dd");
    if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  return groups;
}
