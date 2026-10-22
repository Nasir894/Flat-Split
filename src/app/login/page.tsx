"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { PinPad } from "@/components/pin-pad";
import { MemberAvatar } from "@/components/member-avatar";
import { RecoveryCodeDialog } from "@/components/recovery-code-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markUnlocked } from "@/components/app-lock";

type Member = { id: string; name: string; color: string; needsPin: boolean; resetApproved: boolean };

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["members"],
    queryFn: () => api<{ members: Member[]; meId: string | null }>("/api/auth/members"),
    staleTime: 0,
  });
  const [picked, setPicked] = useState<Member | null>(null);
  const [chosenMode, setMode] = useState<"pick" | "join" | "recover">("pick");
  const mode = data && data.members.length === 0 ? "join" : chosenMode;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  useEffect(() => {
    // Already signed in on this device (and not in the middle of showing a recovery code).
    if (data?.meId && !recoveryCode) router.replace("/");
  }, [data, router, recoveryCode]);

  const done = async () => {
    markUnlocked();
    await qc.resetQueries();
    router.replace("/");
  };
  // Sign-up and PIN recovery both hand back a new recovery code to show before entering the app.
  const doneWithCode = async (code: string) => setRecoveryCode(code);

  const login = async (pin: string) => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { userId: picked.id, pin } });
      await done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setMode("pick");
    setError(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="rise text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-700 text-xl font-extrabold text-white shadow-lg">
          FS
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Flat Split</h1>
        <p className="text-sm text-muted-foreground">Shared spending, split fairly.</p>
      </div>

      {isLoading ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : mode === "join" ? (
        <JoinForm onDone={doneWithCode} onBack={data?.members.length ? back : undefined} />
      ) : mode === "recover" && picked ? (
        <RecoverForm member={picked} onDone={doneWithCode} onBack={back} />
      ) : picked ? (
        <div className="rise flex flex-col items-center gap-4">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground"
            onClick={() => {
              setPicked(null);
              setError(null);
            }}
          >
            <ArrowLeft className="size-4" /> Not {picked.name}?
          </button>
          <MemberAvatar name={picked.name} color={picked.color} className="size-14 text-lg" />
          <p className="font-medium">Enter your PIN</p>
          <PinPad onComplete={login} busy={busy} error={error} />
          <Button variant="link" className="text-muted-foreground" onClick={() => (setError(null), setMode("recover"))}>
            Forgot PIN?
          </Button>
        </div>
      ) : (
        <div className="rise w-full space-y-4">
          <p className="text-center text-sm font-medium">Who are you?</p>
          <div className="grid grid-cols-3 gap-3">
            {data?.members.map((m) => (
              <button
                key={m.id}
                onClick={() => (m.needsPin ? setMode("join") : setPicked(m))}
                className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3 transition active:scale-95"
              >
                <MemberAvatar name={m.name} color={m.color} className="size-12" />
                <span className="w-full truncate text-sm">{m.name}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={() => setMode("join")}>
            <UserPlus /> Join the flat
          </Button>
        </div>
      )}

      <RecoveryCodeDialog code={recoveryCode} onDone={done} />
    </main>
  );
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

function NewPinFields({
  pin,
  pin2,
  onPin,
  onPin2,
  label = "4-digit PIN",
}: {
  pin: string;
  pin2: string;
  onPin: (v: string) => void;
  onPin2: (v: string) => void;
  label?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="pin">{label}</Label>
        <Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => onPin(digits(e.target.value))} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pin2">Repeat PIN</Label>
        <Input id="pin2" type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => onPin2(digits(e.target.value))} required />
      </div>
    </div>
  );
}

function pinProblem(pin: string, pin2: string) {
  if (pin.length !== 4) return "PIN must be 4 digits";
  if (pin !== pin2) return "PINs don't match";
  return null;
}

function JoinForm({ onDone, onBack }: { onDone: (code: string) => Promise<void>; onBack?: () => void }) {
  const [form, setForm] = useState({ houseCode: "", name: "" });
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = pinProblem(pin, pin2);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const r = await api<{ recoveryCode: string }>("/api/auth/signup", { body: { ...form, pin } });
      await onDone(r.recoveryCode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rise w-full space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        Ask a flatmate for the house code. Restored from a backup? Use your old name to set a new PIN.
      </p>
      <div className="space-y-2">
        <Label htmlFor="code">House code</Label>
        <Input
          id="code"
          autoComplete="off"
          autoCapitalize="none"
          value={form.houseCode}
          onChange={(e) => setForm((f) => ({ ...f, houseCode: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          autoComplete="nickname"
          value={form.name}
          maxLength={40}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
      </div>
      <NewPinFields pin={pin} pin2={pin2} onPin={setPin} onPin2={setPin2} />
      {error && <p className="text-sm text-negative">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Join
      </Button>
      {onBack && (
        <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
          <ArrowLeft /> Back to sign in
        </Button>
      )}
    </form>
  );
}

function RecoverForm({
  member,
  onDone,
  onBack,
}: {
  member: Member;
  onDone: (code: string) => Promise<void>;
  onBack: () => void;
}) {
  // If a flatmate approved a reset, default to that path (the member likely lost their code too).
  const [useApproval, setUseApproval] = useState(member.resetApproved);
  const [secret, setSecret] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = pinProblem(pin, pin2);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const r = await api<{ recoveryCode: string }>("/api/auth/recover", {
        body: {
          userId: member.id,
          newPin: pin,
          ...(useApproval ? { houseCode: secret } : { recoveryCode: secret }),
        },
      });
      await onDone(r.recoveryCode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rise w-full space-y-4">
      <div className="flex flex-col items-center gap-2">
        <MemberAvatar name={member.name} color={member.color} className="size-12" />
        <p className="font-medium">Reset PIN for {member.name}</p>
      </div>

      {useApproval ? (
        <div className="space-y-2">
          <p className="rounded-lg bg-positive/10 p-2 text-sm text-positive">
            A flatmate approved your PIN reset. Enter the house code to continue.
          </p>
          <Label htmlFor="secret">House code</Label>
          <Input id="secret" autoComplete="off" autoCapitalize="none" value={secret} onChange={(e) => setSecret(e.target.value)} required />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="secret">Recovery code</Label>
          <Input
            id="secret"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="XXXX-XXXX"
            className="font-mono tracking-widest uppercase"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Lost it too? Ask any flatmate to open <b>Settings → Members</b> and tap <b>Approve PIN reset</b> for you,
            then come back here.
          </p>
        </div>
      )}
      {member.resetApproved && (
        <button
          type="button"
          className="text-xs text-primary"
          onClick={() => (setUseApproval((u) => !u), setSecret(""))}
        >
          {useApproval ? "Use my recovery code instead" : "Use the approved reset instead"}
        </button>
      )}

      <NewPinFields pin={pin} pin2={pin2} onPin={setPin} onPin2={setPin2} label="New PIN" />
      {error && <p className="text-sm text-negative">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} Set new PIN
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
        <ArrowLeft /> Back to sign in
      </Button>
    </form>
  );
}
