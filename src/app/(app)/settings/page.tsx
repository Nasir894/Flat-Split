"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { format } from "date-fns";
import { Bell, Download, FileJson, FileText, Eye, EyeOff, Copy, House, KeyRound, LifeBuoy, Loader2, LogOut, Monitor, Moon, RotateCcw, Send, Smartphone, Sun, Tags, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useLookups } from "@/hooks/use-data";
import { CACHE_KEY } from "@/components/providers";
import { PushToggle, currentSubscription } from "@/components/push-toggle";
import { UserAvatar } from "@/components/member-avatar";
import { RecoveryCodeDialog } from "@/components/recovery-code-dialog";
import { BiometricCard } from "@/components/biometric-card";
import { ProfileCard } from "@/components/profile-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

export default function SettingsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { users, guests, meId, categories, userById, isGuest } = useLookups();
  const [busy, setBusy] = useState<string | null>(null);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  // This page renders only on the client (inside AppLock), so browser checks can run during render.
  const [standalone] = useState(() => window.matchMedia("(display-mode: standalone)").matches);
  const [isIOS] = useState(() => /iPad|iPhone|iPod/.test(navigator.userAgent));

  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fetchBackup = () => api<Parameters<typeof import("@/lib/pdf").downloadPdf>[0]>("/api/backup");

  const exportJson = () =>
    run("json", async () => {
      const data = await fetchBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `flat-split-backup-${format(new Date(), "yyyy-MM-dd-HHmm")}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

  const exportPdf = () =>
    run("pdf", async () => {
      const [{ downloadPdf }, data] = await Promise.all([import("@/lib/pdf"), fetchBackup()]);
      await downloadPdf(data);
    });

  const logout = () =>
    run("logout", async () => {
      const sub = await currentSubscription().catch(() => null);
      await api("/api/auth/logout", { body: { endpoint: sub?.endpoint } });
      await sub?.unsubscribe().catch(() => {});
      qc.clear();
      localStorage.removeItem(CACHE_KEY);
      sessionStorage.clear();
      router.replace("/login");
    });

  const me = userById.get(meId);

  return (
    <div className="space-y-4">
      {me && <ProfileCard me={me} />}

      <Card className="rise">
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          {(
            <ToggleGroup type="single" variant="outline" value={theme} onValueChange={(v) => v && setTheme(v)} className="w-full">
              <ToggleGroupItem value="light" className="flex-1">
                <Sun /> Light
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" className="flex-1">
                <Moon /> Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="system" className="flex-1">
                <Monitor /> Auto
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </CardContent>
      </Card>

      <Card className="rise">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4" /> Notifications
          </CardTitle>
          <CardDescription>Get notified on this device when anyone adds, edits or deletes something.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <span className="text-sm">Push notifications</span>
          <PushToggle />
        </CardContent>
      </Card>

      {!isGuest && <TelegramCard />}

      {!standalone && (
        <Card className="rise">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="size-4" /> Install the app
            </CardTitle>
            <CardDescription>
              {isIOS
                ? "In Safari, tap Share → “Add to Home Screen”."
                : "Install Flat Split on your phone so it opens like a normal app."}
            </CardDescription>
          </CardHeader>
          {installEvt && (
            <CardContent>
              <Button className="w-full" onClick={() => installEvt.prompt().then(() => setInstallEvt(null))}>
                <Download /> Install
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {/* Home-only settings: guests only use their tours */}
      {!isGuest && (
      <Card className="rise">
        <CardHeader>
          <CardTitle className="text-base">Backup &amp; restore</CardTitle>
          <CardDescription>Anyone can download a backup at any time.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={exportPdf} disabled={busy === "pdf"}>
            {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />} PDF
          </Button>
          <Button variant="outline" onClick={exportJson} disabled={busy === "json"}>
            {busy === "json" ? <Loader2 className="animate-spin" /> : <FileJson />} JSON
          </Button>
          <RestoreButton />
        </CardContent>
      </Card>
      )}

      {!isGuest && <CategoriesCard categories={categories} />}

      <BiometricCard />

      {!isGuest && <HouseCodeCard />}

      <ChangePinCard />

      <RecoveryCodeCard />

      {!isGuest && <MembersCard users={[...users, ...guests]} meId={meId} />}

      <Button variant="outline" className="w-full text-negative" onClick={logout} disabled={busy === "logout"}>
        <LogOut /> Sign out of this device
      </Button>
    </div>
  );
}

type TelegramStatus = { configured: boolean; time: string; lastSent: string | null; chats: { id: string; title: string }[] };

function TelegramCard() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["telegram"], queryFn: () => api<TelegramStatus>("/api/telegram") });
  const [time, setTime] = useState<string>();
  const [code, setCode] = useState<string>();
  const [busy, setBusy] = useState<"send" | "time" | "link" | null>(null);

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const update = (body: unknown) =>
    api<TelegramStatus>("/api/telegram", { method: "PATCH", body }).then((s) => qc.setQueryData(["telegram"], s));

  const send = () =>
    run("send", async () => {
      const r = await api<{ sent: number }>("/api/telegram", { method: "POST" });
      toast.success(`Dashboard sent to ${r.sent} chat${r.sent === 1 ? "" : "s"}`);
    });
  const saveTime = () =>
    run("time", async () => {
      await update({ time });
      setTime(undefined);
      toast.success(`Daily update set to ${time}`);
    });
  const link = () =>
    run("link", async () => {
      const r = await api<{ code: string }>("/api/telegram", { method: "PATCH", body: { linkCode: true } });
      setCode(r.code);
    });

  const command = code && `/link@FlatSplitBot ${code}`;
  const shownTime = time ?? data?.time ?? "21:00";

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4" /> Telegram
        </CardTitle>
        <CardDescription>
          The dashboard goes to your linked Telegram chats every day. Anyone there can tap “Latest update” or send /update for a
          fresh one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tg-time">Daily update time (Bangladesh)</Label>
          <div className="flex gap-2">
            <Input id="tg-time" type="time" value={shownTime} onChange={(e) => setTime(e.target.value)} className="flex-1" />
            <Button variant="outline" onClick={saveTime} disabled={!time || time === data?.time || busy === "time"}>
              {busy === "time" && <Loader2 className="animate-spin" />} Save
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Sends to</Label>
          {data?.chats.length ? (
            data.chats.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{c.title}</span>
                {c.title !== "Set in environment" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Stop sending to ${c.title}`}
                    onClick={() => update({ removeChat: c.id }).catch((e) => toast.error((e as Error).message))}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-foreground/60">No chat linked yet.</p>
          )}
          {command ? (
            <div className="space-y-1.5 rounded-xl border p-3 text-sm">
              <p>Add @FlatSplitBot to your group, then send this there (valid for 15 minutes):</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-foreground/10 px-2 py-1">{command}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy"
                  onClick={() => navigator.clipboard.writeText(command).then(() => toast.success("Copied"))}
                >
                  <Copy />
                </Button>
              </div>
              <Button size="sm" variant="ghost" className="px-0" onClick={() => qc.invalidateQueries({ queryKey: ["telegram"] })}>
                <RotateCcw /> I sent it, refresh
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={link} disabled={busy === "link"}>
              {busy === "link" && <Loader2 className="animate-spin" />} Link a group
            </Button>
          )}
        </div>

        <Button className="w-full" onClick={send} disabled={busy === "send" || !data?.chats.length}>
          {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send update now
        </Button>
      </CardContent>
    </Card>
  );
}

function RestoreButton() {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; data: unknown; summary: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = async (f?: File) => {
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data?.app !== "flat-split") throw new Error("This is not a Flat Split backup file");
      setFile({
        name: f.name,
        data,
        summary: `${data.expenses?.length ?? 0} expenses, ${data.transfers?.length ?? 0} transfers, ${data.riceEntries?.length ?? 0} rice entries · exported ${data.exportedAt ? format(new Date(data.exportedAt), "d MMM yyyy, h:mm a") : "?"}`,
      });
      setConfirmText("");
    } catch (e) {
      toast.error((e as Error).message || "Could not read that file");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const restore = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api<{ restored: string }>("/api/backup", { body: file.data });
      toast.success(`Restored ${r.restored}`);
      setFile(null);
      await qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="col-span-2" onClick={() => input.current?.click()}>
        <Upload /> Restore from JSON…
      </Button>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <AlertDialog open={Boolean(file)} onOpenChange={(o) => !o && setFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace all data with this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              {file?.name}: {file?.summary}. All current expenses, transfers, rice entries and categories will be
              replaced. The activity log is kept and this restore is recorded. Download a backup first if unsure. Type{" "}
              <b>RESTORE</b> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE" autoCapitalize="characters" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={confirmText.trim().toUpperCase() !== "RESTORE" || busy}
              onClick={(e) => {
                e.preventDefault();
                restore();
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CategoriesCard({ categories }: { categories: ReturnType<typeof useLookups>["categories"] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["summary"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="size-4" /> Categories
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            act("add", () => api("/api/categories", { body: { name, emoji: emoji || "🏷️" } })).then(() => {
              setName("");
              setEmoji("");
            });
          }}
        >
          <Input className="w-14 text-center" placeholder="🏷️" value={emoji} maxLength={4} onChange={(e) => setEmoji(e.target.value)} />
          <Input placeholder="New category" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={busy === "add"}>
            Add
          </Button>
        </form>
        <ul className="divide-y text-sm">
          {categories.map((c) => (
            <li key={c.id} className={c.deletedAt ? "flex items-center py-1.5 opacity-45" : "flex items-center py-1.5"}>
              <span className="flex-1">
                {c.emoji} {c.name}
                {c.deletedAt && " (hidden)"}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={busy === c.id}
                aria-label={c.deletedAt ? "Restore category" : "Hide category"}
                onClick={() => act(c.id, () => api(`/api/categories/${c.id}`, { method: c.deletedAt ? "POST" : "DELETE" }))}
              >
                {c.deletedAt ? <RotateCcw /> : <Trash2 />}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function HouseCodeCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["house-code"],
    queryFn: () => api<{ code: string | null; updatedBy: string | null; updatedAt: string | null }>("/api/house-code"),
  });
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/house-code", { body: { code } });
      toast.success("House code changed. Share the new one with anyone who still needs to join.");
      setEditing(false);
      setCode("");
      await qc.invalidateQueries({ queryKey: ["house-code"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <House className="size-4" /> House code
        </CardTitle>
        <CardDescription>
          Share it with a new flatmate so they can ask to join. Someone already in the house still has to approve them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
          <code className="flex-1 truncate font-mono text-base">
            {data?.code ? (show ? data.code : "•".repeat(Math.min(data.code.length, 12))) : "…"}
          </code>
          <Button variant="ghost" size="icon" className="size-8" aria-label={show ? "Hide" : "Show"} onClick={() => setShow((v) => !v)}>
            {show ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Copy house code"
            onClick={() => data?.code && navigator.clipboard.writeText(data.code).then(() => toast.success("Copied"))}
          >
            <Copy />
          </Button>
        </div>
        {data?.updatedBy && data.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Set by {data.updatedBy} · {format(new Date(data.updatedAt), "d MMM yyyy")}
          </p>
        )}
        {editing ? (
          <form onSubmit={save} className="flex gap-2">
            <Input
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              placeholder="New house code (6+ characters)"
              value={code}
              maxLength={40}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" disabled={busy || code.trim().length < 6}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
          </form>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change house code
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function RecoveryCodeCard() {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ recoveryCode: string }>("/api/auth/recovery-code", { body: { pin } });
      setCode(r.recoveryCode);
      setPin("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LifeBuoy className="size-4" /> Recovery code
        </CardTitle>
        <CardDescription>
          Lets you set a new PIN if you forget it. Lost yours? Make a new one here; the old one stops working.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="rc-pin" className="text-xs">Your PIN</Label>
            <Input
              id="rc-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          <Button type="submit" disabled={busy || pin.length !== 4}>
            {busy && <Loader2 className="animate-spin" />} New code
          </Button>
        </form>
      </CardContent>
      <RecoveryCodeDialog code={code} onDone={() => setCode(null)} />
    </Card>
  );
}

function MembersCard({ users, meId }: { users: ReturnType<typeof useLookups>["users"]; meId: string }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/members/${target.id}/approve-reset`, { method: "POST" });
      toast.success(`${target.name} can now set a new PIN from the sign-in screen (within 24 hours).`);
      setTarget(null);
      await qc.invalidateQueries({ queryKey: ["summary"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="text-base">Members</CardTitle>
        <CardDescription>
          New flatmates ask to join with the house code, and any member can approve them. If someone forgot their PIN and lost their
          recovery code, you can approve a reset for them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 text-sm">
            <UserAvatar user={u} className="size-8 text-xs" />
            <span className="min-w-0 flex-1">
              {u.name} {u.id === meId && <span className="text-muted-foreground">(me)</span>}
              <span className="block text-xs text-muted-foreground">
                {u.addedBy
                  ? `Added by ${users.find((x) => x.id === u.addedBy)?.name ?? "a former member"}`
                  : "Created the house"}{" "}
                · {format(new Date(u.joinedAt), "d MMM yyyy")}
                {u.role === "guest" && " · Tour guest"}
                {u.needsPin && " · needs new PIN"}
              </span>
            </span>
            {u.id !== meId &&
              (u.resetApproved ? (
                <span className="text-xs text-positive">Reset approved</span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setTarget(u)}>
                  Approve PIN reset
                </Button>
              ))}
          </div>
        ))}
      </CardContent>
      <AlertDialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve PIN reset for {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Only do this if {target?.name} asked you in person. For the next 24 hours they (or anyone with the house
              code) can set a new PIN for this account. Everyone will be notified, and it&apos;s recorded in the
              activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                approve();
              }}
            >
              {busy && <Loader2 className="animate-spin" />} Approve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ChangePinCard() {
  const [currentPin, setCurrent] = useState("");
  const [newPin, setNew] = useState("");
  const [busy, setBusy] = useState(false);
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/auth/pin", { body: { currentPin, newPin } });
      toast.success("PIN changed");
      setCurrent("");
      setNew("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rise">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" /> Change PIN
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="cur" className="text-xs">Current</Label>
            <Input id="cur" type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={(e) => setCurrent(digits(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new" className="text-xs">New</Label>
            <Input id="new" type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNew(digits(e.target.value))} />
          </div>
          <Button type="submit" disabled={busy || currentPin.length !== 4 || newPin.length !== 4}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
