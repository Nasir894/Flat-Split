"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Home, Hourglass, Loader2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { PinPad } from "@/components/pin-pad";
import { MemberAvatar } from "@/components/member-avatar";
import { Logo } from "@/components/logo";
import { RecoveryCodeDialog } from "@/components/recovery-code-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markUnlocked } from "@/components/app-lock";
import { BiometricButton } from "@/components/biometric-button";
import { biometricEnabledHere } from "@/lib/biometric";

type MembersResponse = {
  meId: string | null;
  houseExists: boolean;
  pending: { id: string; name: string } | null;
};
type SignupResult = { id: string; pending: boolean; recoveryCode: string };

// The device remembers who signed in last, so next time it goes straight to the PIN pad.
const LAST_NAME_KEY = "fs_last_name";
const rememberName = (name: string) => {
  try {
    localStorage.setItem(LAST_NAME_KEY, name);
  } catch {}
};
const forgetName = () => {
  try {
    localStorage.removeItem(LAST_NAME_KEY);
  } catch {}
};

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isLoading, error: loadError, refetch, isFetching } = useQuery({
    queryKey: ["members"],
    queryFn: () => api<MembersResponse>("/api/auth/members"),
    staleTime: 0,
    retry: 1,
    retryDelay: 300,
  });
  // `name` set = PIN step for that name; null = ask for the name.
  const [name, setName] = useState<string | null>(null);
  const [chosenMode, setMode] = useState<"signin" | "join" | "recover">("signin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A freshly issued recovery code, and what to do once the user has saved it.
  const [recovery, setRecovery] = useState<{ code: string; then: "enter" | "wait" } | null>(null);
  const [justRequested, setJustRequested] = useState<string | null>(null);
  const [bioHere, setBioHere] = useState(false);

  const waitingFor = justRequested ?? data?.pending?.name ?? null;
  const mode = !data?.houseExists ? "create" : waitingFor && !recovery ? "waiting" : chosenMode;

  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_NAME_KEY);
      // localStorage is browser-only, so the remembered name is read after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last) setName(last);
    } catch {}
    setBioHere(biometricEnabledHere());
  }, []);

  const bioLogin = async (who: { name: string }) => {
    rememberName(who.name);
    await enter();
  };

  useEffect(() => {
    // Already signed in on this device (and not in the middle of showing a recovery code).
    if (data?.meId && !recovery) router.replace("/");
  }, [data, router, recovery]);

  const enter = async () => {
    markUnlocked();
    await qc.resetQueries();
    router.replace("/");
  };

  const afterSignup = async (r: SignupResult, newName: string) => {
    rememberName(newName);
    if (r.pending) setJustRequested(newName);
    setRecovery({ code: r.recoveryCode, then: r.pending ? "wait" : "enter" });
  };

  const login = async (pin: string) => {
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { name, pin } });
      rememberName(name);
      await enter();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setMode("signin");
    setError(null);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="text-center">
        <Logo animate loading={isLoading} className="mx-auto mb-3 size-16 drop-shadow-lg" />
        <h1 className="rise text-2xl font-bold tracking-tight">Flat Split</h1>
        <p className="rise text-sm text-muted-foreground">Shared spending, split fairly.</p>
      </div>

      {!data && loadError ? (
        <div className="rise w-full space-y-3 rounded-xl border border-negative/30 bg-negative/5 p-4 text-center">
          <p className="font-medium">Couldn&apos;t reach the server</p>
          <p className="text-sm break-words text-muted-foreground">{loadError.message}</p>
          <Button variant="outline" className="w-full" onClick={() => refetch()} disabled={isFetching}>
            {isFetching && <Loader2 className="animate-spin" />} Try again
          </Button>
        </div>
      ) : !data ? (
        <p className="h-6 text-sm text-muted-foreground">Connecting…</p>
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
      ) : mode === "recover" ? (
        <RecoverForm
          initialName={name ?? ""}
          onDone={async (code, recoveredName) => {
            rememberName(recoveredName);
            setRecovery({ code, then: "enter" });
          }}
          onBack={back}
        />
      ) : name ? (
        <div className="rise flex flex-col items-center gap-4">
          <MemberAvatar name={name} color="#14b8a6" className="size-14 text-lg" />
          <p className="font-medium">Hi {name}, enter your PIN</p>
          {bioHere && (
            <div className="w-full">
              <BiometricButton purpose="login" autoStart onSuccess={bioLogin} onError={setError} />
            </div>
          )}
          <PinPad onComplete={login} busy={busy} error={error} />
          <div className="flex gap-2">
            <Button
              variant="link"
              className="text-muted-foreground"
              onClick={() => {
                forgetName();
                setName(null);
                setError(null);
              }}
            >
              Not {name}?
            </Button>
            <Button variant="link" className="text-muted-foreground" onClick={() => (setError(null), setMode("recover"))}>
              Forgot PIN?
            </Button>
          </div>
        </div>
      ) : (
        <div className="w-full space-y-4">
          {bioHere && <BiometricButton purpose="login" onSuccess={bioLogin} onError={setError} />}
          {error && !name && <p className="text-center text-sm text-negative">{error}</p>}
          <NameStep onNext={(n) => (setError(null), setName(n))} onJoin={() => setMode("join")} />
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

function NameStep({ onNext, onJoin }: { onNext: (name: string) => void; onJoin: () => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="rise w-full space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onNext(value.trim());
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="signin-name">Your name</Label>
        <Input
          id="signin-name"
          autoFocus
          autoComplete="username"
          autoCapitalize="words"
          placeholder="The name you joined with"
          value={value}
          maxLength={40}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={!value.trim()}>
        Continue <ArrowRight />
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={onJoin}>
        <UserPlus /> New here? Ask to join
      </Button>
    </form>
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
  initialName,
  onDone,
  onBack,
}: {
  initialName: string;
  onDone: (code: string, name: string) => Promise<void>;
  onBack: () => void;
}) {
  const [name, setName] = useState(initialName);
  // "code": my recovery code. "approved": a flatmate approved my reset; prove membership with the house code.
  const [method, setMethod] = useState<"code" | "approved">("code");
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
          name,
          newPin: pin,
          ...(method === "approved" ? { houseCode: secret } : { recoveryCode: secret }),
        },
      });
      await onDone(r.recoveryCode, name.trim());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rise w-full space-y-4">
      <p className="text-center font-medium">Reset your PIN</p>
      <div className="space-y-2">
        <Label htmlFor="r-name">Your name</Label>
        <Input id="r-name" autoComplete="username" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(
          [
            ["code", "Recovery code"],
            ["approved", "Flatmate approved"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => (setMethod(m), setSecret(""), setError(null))}
            className={method === m ? "rounded-md bg-background py-1.5 font-medium shadow-sm" : "py-1.5 text-muted-foreground"}
          >
            {label}
          </button>
        ))}
      </div>

      {method === "code" ? (
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
            then choose &ldquo;Flatmate approved&rdquo;.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="secret">House code</Label>
          <Input id="secret" autoComplete="off" autoCapitalize="none" value={secret} onChange={(e) => setSecret(e.target.value)} required />
          <p className="text-xs text-muted-foreground">Works for 24 hours after a flatmate approves your reset.</p>
        </div>
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
