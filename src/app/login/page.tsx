"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Home, Hourglass, Loader2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { PinPad } from "@/components/pin-pad";
import { MemberAvatar } from "@/components/member-avatar";
import { RecoveryCodeDialog } from "@/components/recovery-code-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markUnlocked } from "@/components/app-lock";

type Member = { id: string; name: string; color: string; needsPin: boolean; resetApproved: boolean };
type MembersResponse = {
  members: Member[];
  meId: string | null;
  houseExists: boolean;
  pending: { id: string; name: string } | null;
};
type SignupResult = { id: string; pending: boolean; recoveryCode: string };

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["members"],
    queryFn: () => api<MembersResponse>("/api/auth/members"),
    staleTime: 0,
  });
  const [picked, setPicked] = useState<Member | null>(null);
  const [chosenMode, setMode] = useState<"pick" | "join" | "recover">("pick");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A freshly issued recovery code, and what to do once the user has saved it.
  const [recovery, setRecovery] = useState<{ code: string; then: "enter" | "wait" } | null>(null);
  const [justRequested, setJustRequested] = useState<string | null>(null);

  const waitingFor = justRequested ?? data?.pending?.name ?? null;
  const mode = !data?.houseExists ? "create" : waitingFor && !recovery ? "waiting" : chosenMode;

  useEffect(() => {
    // Already signed in on this device (and not in the middle of showing a recovery code).
    if (data?.meId && !recovery) router.replace("/");
  }, [data, router, recovery]);

  const enter = async () => {
    markUnlocked();
    await qc.resetQueries();
    router.replace("/");
  };

  const afterSignup = async (r: SignupResult, name: string) => {
    if (r.pending) setJustRequested(name);
    setRecovery({ code: r.recoveryCode, then: r.pending ? "wait" : "enter" });
  };

  const login = async (pin: string) => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { userId: picked.id, pin } });
      await enter();
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

      {isLoading || !data ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : mode === "create" ? (
        <SignupForm create onDone={afterSignup} />
      ) : mode === "waiting" ? (
        <WaitingForApproval
          name={waitingFor!}
          onApproved={enter}
          onGone={async () => {
            setJustRequested(null);
            await refetch();
            setMode("join");
          }}
        />
      ) : mode === "join" ? (
        <SignupForm onDone={afterSignup} onBack={back} />
      ) : mode === "recover" && picked ? (
        <RecoverForm member={picked} onDone={async (code) => setRecovery({ code, then: "enter" })} onBack={back} />
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
            {data.members.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setPicked(m);
                  // Restored from a backup without a PIN: go straight to setting one.
                  if (m.needsPin) setMode("recover");
                }}
                className="flex flex-col items-center gap-2 rounded-xl border bg-card p-3 transition active:scale-95"
              >
                <MemberAvatar name={m.name} color={m.color} className="size-12" />
                <span className="w-full truncate text-sm">{m.name}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" className="w-full" onClick={() => setMode("join")}>
            <UserPlus /> New here? Ask to join
          </Button>
        </div>
      )}

      <RecoveryCodeDialog
        code={recovery?.code ?? null}
        onDone={() => {
          const then = recovery?.then;
          setRecovery(null);
          if (then === "enter") enter();
        }}
      />
    </main>
  );
}

/** Shown on a newcomer's device until someone already in the house approves (or declines) them. */
function WaitingForApproval({
  name,
  onApproved,
  onGone,
}: {
  name: string;
  onApproved: () => Promise<void>;
  onGone: () => Promise<void>;
}) {
  const [declined, setDeclined] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const entered = useRef(false);
  const { data } = useQuery({
    queryKey: ["join-status"],
    queryFn: () => api<{ status: "pending" | "approved" | "declined" | "none"; approvedBy?: string }>("/api/auth/join-status"),
    refetchInterval: (q) => (q.state.data?.status === "pending" || !q.state.data ? 4000 : false),
    refetchOnWindowFocus: true,
    gcTime: 0,
  });

  useEffect(() => {
    if (data?.status === "approved") {
      if (!entered.current) {
        entered.current = true;
        onApproved();
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a polled server result
    else if (data?.status === "declined" || data?.status === "none") setDeclined(true);
  }, [data, onApproved]);

  if (declined) {
    return (
      <div className="rise space-y-4 text-center">
        <p className="font-medium">Your request wasn&apos;t approved</p>
        <p className="text-sm text-muted-foreground">Talk to your flatmates, then you can ask again.</p>
        <Button className="w-full" onClick={onGone}>
          OK
        </Button>
      </div>
    );
  }

  return (
    <div className="rise flex flex-col items-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
        <Hourglass className="size-7 animate-pulse text-primary" />
      </div>
      <div className="space-y-1">
        <p className="text-lg font-semibold">Waiting for approval</p>
        <p className="text-sm text-muted-foreground">
          Hi {name}! Your flatmates have been notified. As soon as someone already in the house approves you, you&apos;ll
          get in automatically. You can keep this screen open.
        </p>
      </div>
      {data?.status === "approved" && (
        <p className="text-sm text-positive">Approved by {data.approvedBy}! Opening…</p>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={cancelling}
        onClick={async () => {
          setCancelling(true);
          await api("/api/auth/join-status", { method: "DELETE" }).catch(() => {});
          await onGone();
        }}
      >
        Cancel request
      </Button>
    </div>
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

/** `create`: the very first person sets up the house and picks its code. Otherwise: request to join. */
function SignupForm({
  create,
  onDone,
  onBack,
}: {
  create?: boolean;
  onDone: (r: SignupResult, name: string) => Promise<void>;
  onBack?: () => void;
}) {
  const [form, setForm] = useState({ houseCode: "", name: "" });
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = create && form.houseCode.trim().length < 6 ? "House code must be at least 6 characters" : pinProblem(pin, pin2);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const r = await api<SignupResult>("/api/auth/signup", { body: { ...form, pin } });
      await onDone(r, form.name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rise w-full space-y-4">
      {create ? (
        <div className="space-y-1 text-center">
          <p className="flex items-center justify-center gap-2 font-semibold">
            <Home className="size-4 text-primary" /> Create your house
          </p>
          <p className="text-sm text-muted-foreground">
            You&apos;re the first one here. Choose a house code: flatmates need it to ask to join, and you approve them.
          </p>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Enter the house code from a flatmate. Someone already in the house must approve your request.
        </p>
      )}
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
      <div className="space-y-2">
        <Label htmlFor="code">{create ? "Choose a house code" : "House code"}</Label>
        <Input
          id="code"
          autoComplete="off"
          autoCapitalize="none"
          placeholder={create ? "e.g. green-door-42" : undefined}
          value={form.houseCode}
          onChange={(e) => setForm((f) => ({ ...f, houseCode: e.target.value }))}
          required
        />
        {create && <p className="text-xs text-muted-foreground">At least 6 characters. You can change it later in Settings.</p>}
      </div>
      <NewPinFields pin={pin} pin2={pin2} onPin={setPin} onPin2={setPin2} label="Your 4-digit PIN" />
      {error && <p className="text-sm text-negative">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />} {create ? "Create house" : "Send join request"}
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
