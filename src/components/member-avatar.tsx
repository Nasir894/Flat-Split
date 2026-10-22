"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

export function MemberAvatar({
  name,
  color,
  src,
  className,
}: {
  name: string;
  color?: string;
  /** Profile picture URL; initials are shown if missing or it fails to load. */
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cn(
        "relative inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: color ?? "#64748b" }}
      aria-hidden
    >
      {initials}
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element -- tiny private images; next/image adds nothing here
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
}

export const avatarUrl = (u: Pick<User, "id" | "avatarVersion">) =>
  u.avatarVersion ? `/api/avatars/${u.id}?v=${u.avatarVersion}` : null;

/** Avatar for a member object (photo if they have one). */
export function UserAvatar({ user, className }: { user?: User | null; className?: string }) {
  if (!user) return <MemberAvatar name="?" className={className} />;
  return <MemberAvatar name={user.name} color={user.color} src={avatarUrl(user)} className={className} />;
}
