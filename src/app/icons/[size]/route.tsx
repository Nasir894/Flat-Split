import { ImageResponse } from "next/og";

// App icons generated on the fly (no binary assets in the repo), cached forever by the CDN.
export async function GET(req: Request, ctx: RouteContext<"/icons/[size]">) {
  const size = Math.min(Math.max(Number((await ctx.params).size) || 192, 32), 1024);
  const maskable = new URL(req.url).searchParams.has("maskable");
  const pad = maskable ? size * 0.2 : 0;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: size - pad * 2,
            height: size - pad * 2,
            color: "white",
            fontSize: (size - pad * 2) * 0.46,
            fontWeight: 800,
            letterSpacing: -size * 0.02,
          }}
        >
          FS
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "cache-control": "public, max-age=31536000, immutable" },
    },
  );
}
