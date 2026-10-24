import { ImageResponse } from "next/og";
import { query, runScoped } from "@/lib/server/db";
import { HttpError } from "@/lib/server/http";
import { widgetUser } from "@/lib/server/auth";
import { widgetData } from "@/lib/server/widget";

// Charts for the phone widgets, drawn here as PNGs (widgets can only show image files).
//   ?kind=balance  → my balance over the last 30 days (line + area, zero line)
//   ?kind=month    → this month's home spending per day (bars, today highlighted)
// Width/height are in pixels; the app asks for its widget's size × screen density.

const GREEN = "#4ADE80";
const RED = "#F87171";
const BRAND = "#E8742E";
const MUTED = "rgba(245,237,230,0.16)";

export async function GET(req: Request) {
  return runScoped(async () => {
    let userId: string;
    try {
      userId = await widgetUser(req);
    } catch (err) {
      return new Response((err as HttpError).message, { status: 401 });
    }
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") === "month" ? "month" : "balance";
    const w = Math.min(Math.max(Number(url.searchParams.get("w")) || 600, 120), 1200);
    const h = Math.min(Math.max(Number(url.searchParams.get("h")) || 300, 60), 1200);
    const [me] = await query<{ role: "member" | "guest" }>("select role from users where id = $1", [userId]);
    const data = await widgetData({ id: userId, role: me?.role ?? "member" });
    const svg = kind === "month" ? monthBars(data.month.byDay, data.month.today, w, h) : balanceLine(data.series.map((p) => p.balance), w, h);
    return new ImageResponse(
      (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`} width={w} height={h} alt="" />
      ),
      { width: w, height: h, headers: { "cache-control": "no-store" } },
    );
  });
}

function balanceLine(values: number[], w: number, h: number) {
  const pad = Math.round(h * 0.08);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
  const y = (v: number) => pad + ((max - v) * (h - pad * 2)) / span;
  const color = (values.at(-1) ?? 0) < 0 ? RED : GREEN;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const stroke = Math.max(2, h / 60);
  const last = values.length - 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
  <line x1="${pad}" x2="${w - pad}" y1="${y(0)}" y2="${y(0)}" stroke="${MUTED}" stroke-width="${stroke / 1.5}" stroke-dasharray="${stroke * 2} ${stroke * 2}"/>
  <path d="${area}" fill="url(#a)"/>
  <path d="${line}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="${x(last)}" cy="${y(values[last] ?? 0)}" r="${stroke * 2.2}" fill="${color}"/>
</svg>`;
}

function monthBars(byDay: number[], today: number, w: number, h: number) {
  const pad = Math.round(h * 0.06);
  const max = Math.max(...byDay, 1);
  const slot = (w - pad * 2) / byDay.length;
  const bw = Math.max(2, slot * 0.62);
  const r = Math.min(bw / 2, 6);
  const bars = byDay
    .map((v, i) => {
      const day = i + 1;
      const bh = v > 0 ? Math.max(r * 2, (v / max) * (h - pad * 2)) : Math.max(2, h * 0.02);
      const fill = day === today ? BRAND : day < today ? "rgba(232,116,46,0.55)" : MUTED;
      return `<rect x="${(pad + i * slot + (slot - bw) / 2).toFixed(1)}" y="${(h - pad - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${r}" fill="${fill}"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars}</svg>`;
}
