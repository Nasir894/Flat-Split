"use client";

import { useRef, useState } from "react";
import { format } from "date-fns";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useInvalidateAll } from "@/hooks/use-data";
import type { User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "./member-avatar";

const SIZE = 256;

/** Center-crops and shrinks a photo to 256×256 on the phone, so uploads are tiny (~10–30 KB). */
async function resizePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.85);
  // Older Safari can't encode WebP and silently returns PNG; use JPEG there instead.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}

export function ProfileCard({ me }: { me: User }) {
  const invalidate = useInvalidateAll();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy("upload");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Please choose a photo");
      const dataUrl = await resizePhoto(file);
      await api("/api/me/avatar", { body: { dataUrl } });
      toast.success("Profile picture updated");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't use that photo");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      await api("/api/me/avatar", { method: "DELETE" });
      toast.success("Profile picture removed");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="rise overflow-hidden">
      <CardContent className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="group relative shrink-0 rounded-full focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label="Change profile picture"
        >
          <UserAvatar user={me} className="size-20 text-2xl" />
          <span className="absolute -right-0.5 -bottom-0.5 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground transition group-active:scale-90">
            {busy === "upload" ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{me.name}</p>
          <p className="text-xs text-muted-foreground">Member since {format(new Date(me.joinedAt), "d MMM yyyy")}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={Boolean(busy)}>
              <Camera /> {me.avatarVersion ? "Change photo" : "Add photo"}
            </Button>
            {me.avatarVersion && (
              <Button size="sm" variant="ghost" onClick={remove} disabled={Boolean(busy)} aria-label="Remove photo">
                {busy === "remove" ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            )}
          </div>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </CardContent>
    </Card>
  );
}
