import { cn } from "@/lib/utils";

/**
 * Flat Split mark: a house whose body is split into two halves (the split bill).
 * Pure inline SVG + CSS, so it costs nothing to load and paints with the first HTML byte.
 * `animate`: plays the build-in once (~0.7s). `loading`: the halves keep gently bobbing.
 */
export function Logo({
  className,
  animate = false,
  loading = false,
}: {
  className?: string;
  animate?: boolean;
  loading?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("fs-logo", animate && "fs-logo-in", loading && "fs-logo-loading", className)}
      role="img"
      aria-label="Flat Split"
    >
      <defs>
        <linearGradient id="fs-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#7a2508" />
        </linearGradient>
      </defs>
      <rect className="fs-tile" width="64" height="64" rx="16" fill="url(#fs-bg)" />
      {/* roof */}
      <path
        className="fs-roof"
        d="M13 31 L32 15 L51 31"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
      />
      {/* the two halves of the house = the split */}
      <rect className="fs-left" x="18" y="30" width="12.5" height="19" rx="3" fill="#fff" />
      <rect className="fs-right" x="33.5" y="30" width="12.5" height="19" rx="3" fill="#fff" fillOpacity="0.62" />
    </svg>
  );
}
