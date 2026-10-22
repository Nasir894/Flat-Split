import { ImageResponse } from "next/og";

// PNG app icons (home screen, notifications) drawn from the same mark as src/app/icon.svg.
// Maskable icons get a full-bleed background with the mark inside the safe zone.
export async function GET(req: Request, ctx: RouteContext<"/icons/[size]">) {
  const size = Math.min(Math.max(Number((await ctx.params).size) || 192, 32), 1024);
  const maskable = new URL(req.url).searchParams.has("maskable");
  const mark = maskable ? size * 0.8 : size;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a3d"/><stop offset="1" stop-color="#7a2508"/></linearGradient></defs><rect width="64" height="64" rx="${maskable ? 0 : 16}" fill="url(#g)"/><path d="M13 31 L32 15 L51 31" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><rect x="18" y="30" width="12.5" height="19" rx="3" fill="#fff"/><rect x="33.5" y="30" width="12.5" height="19" rx="3" fill="#fff" fill-opacity="0.62"/></svg>`;
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "linear-gradient(135deg, #ff8a3d 0%, #7a2508 100%)" : "transparent",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={mark} height={mark} alt="" />
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=31536000, immutable" } },
  );
}
