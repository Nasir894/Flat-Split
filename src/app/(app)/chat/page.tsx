"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Loader2, SendHorizontal, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { dayLabel } from "@/lib/dates";
import { markSeen } from "@/lib/seen";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLookups } from "@/hooks/use-data";
import { UserAvatar } from "@/components/member-avatar";

const EMOJIS =
  "😀 😂 🤣 😊 😍 🥰 😘 😎 🤔 😅 😭 😡 🥳 😴 🤤 🤗 🙏 👍 👎 👏 🙌 💪 👀 🔥 ❤️ 💯 ✅ ❌ 🎉 💸 💰 🛒 🍚 🍗 🍔 🍕 ☕ 🧾 🏠 🧹 💡 🚿 ⚡ 🌐 😬 🙃 🤝 👌".split(" ");
const POLL_MS = 3000;
const GROUP_GAP_MS = 5 * 60 * 1000;

type Pending = ChatMessage & { sending?: boolean };

export default function ChatPage() {
  const { meId, userById } = useLookups();
  const [messages, setMessages] = useState<Pending[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(0);

  const scrollToEnd = (smooth = true) =>
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" }));

  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    markSeen("chat", lastId.current);
  }, []);

  // First load.
  useEffect(() => {
    api<{ items: ChatMessage[]; hasMore: boolean }>("/api/chat")
      .then((r) => {
        merge(r.items);
        setHasMore(r.hasMore);
        scrollToEnd(false);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [merge]);

  // New messages: poll while this screen is visible.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || !lastId.current) return;
      try {
        const r = await api<{ items: ChatMessage[] }>(`/api/chat?after=${lastId.current}`);
        if (!stopped && r.items.length) {
          const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
          merge(r.items);
          if (nearBottom) scrollToEnd();
        }
      } catch {}
    };
    const t = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [merge]);

  const loadOlder = async () => {
    const first = messages.find((m) => m.id > 0)?.id;
    if (!first) return;
    setLoadingOlder(true);
    try {
      const r = await api<{ items: ChatMessage[]; hasMore: boolean }>(`/api/chat?before=${first}`);
      setMessages((prev) => [...r.items, ...prev]);
      setHasMore(r.hasMore);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const tempId = -Date.now();
    setMessages((prev) => [...prev, { id: tempId, userId: meId, body, createdAt: new Date().toISOString(), deleted: false, sending: true }]);
    setText("");
    setShowEmoji(false);
    scrollToEnd();
    try {
      const saved = await api<ChatMessage>("/api/chat", { body: { body } });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      lastId.current = Math.max(lastId.current, saved.id);
      markSeen("chat", saved.id);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(body);
      toast.error((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    setSelected(null);
    try {
      await api(`/api/chat/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: "", deleted: true } : m)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const addEmoji = (e: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + e + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + e.length, start + e.length);
    });
  };

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col">
      <div className="flex-1 space-y-1 pb-4">
        {hasMore && (
          <button onClick={loadOlder} className="mx-auto mb-2 flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            {loadingOlder && <Loader2 className="size-3 animate-spin" />} Load older messages
          </button>
        )}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            <p className="text-4xl">👋</p>
            <p className="mt-2">Say hi to your flatmates!</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const mine = m.userId === meId;
            const newDay = !prev || !isSameDay(new Date(prev.createdAt), new Date(m.createdAt));
            const startsGroup =
              newDay || !prev || prev.userId !== m.userId || +new Date(m.createdAt) - +new Date(prev.createdAt) > GROUP_GAP_MS;
            const endsGroup =
              !next || next.userId !== m.userId || +new Date(next.createdAt) - +new Date(m.createdAt) > GROUP_GAP_MS ||
              !isSameDay(new Date(next.createdAt), new Date(m.createdAt));
            const user = userById.get(m.userId);
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                      {dayLabel(m.createdAt)}
                    </span>
                  </div>
                )}
                <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", startsGroup && "mt-3")}>
                  {!mine && <div className="w-8 shrink-0">{endsGroup && <UserAvatar user={user} className="size-8 text-[10px]" />}</div>}
                  <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                    {!mine && startsGroup && <span className="mb-1 ml-1 text-[11px] font-medium text-muted-foreground">{user?.name ?? "Former member"}</span>}
                    <button
                      type="button"
                      disabled={!mine || m.deleted || m.id < 0}
                      onClick={() => setSelected(selected === m.id ? null : m.id)}
                      className={cn(
                        "rise px-3.5 py-2 text-left text-[15px] leading-snug break-words whitespace-pre-wrap",
                        mine
                          ? "rounded-2xl rounded-br-md bg-brand text-brand-foreground"
                          : "rounded-2xl rounded-bl-md border bg-card text-card-foreground",
                        !startsGroup && (mine ? "rounded-tr-md" : "rounded-tl-md"),
                        m.deleted && "border border-dashed bg-transparent text-muted-foreground italic",
                        m.sending && "opacity-60",
                      )}
                    >
                      {m.deleted ? "Message deleted" : m.body}
                    </button>
                    {endsGroup && (
                      <span className="mt-1 px-1 text-[10px] text-muted-foreground">
                        {m.sending ? "Sending…" : format(new Date(m.createdAt), "h:mm a")}
                      </span>
                    )}
                    {selected === m.id && (
                      <button
                        onClick={() => remove(m.id)}
                        className="rise mt-1 flex items-center gap-1 rounded-full border bg-card px-3 py-1 text-xs text-negative"
                      >
                        <Trash2 className="size-3" /> Delete for everyone
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottom} />
      </div>

      {/* Composer: text and emoji only */}
      <div className="sticky bottom-0 -mx-4 border-t bg-background/85 px-3 pt-2 backdrop-blur-xl" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}>
        {showEmoji && (
          <div className="rise mb-2 grid max-h-44 grid-cols-8 gap-1 overflow-y-auto rounded-2xl border bg-card p-2">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => addEmoji(e)} className="rounded-lg p-1 text-2xl transition active:scale-90 active:bg-muted">
                {e}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button
            type="button"
            aria-label="Emoji"
            onClick={() => setShowEmoji((v) => !v)}
            className={cn("flex size-11 shrink-0 items-center justify-center rounded-full border bg-card transition", showEmoji && "bg-brand text-brand-foreground")}
          >
            <Smile className="size-5" />
          </button>
          <textarea
            ref={input}
            rows={1}
            value={text}
            maxLength={1000}
            placeholder="Message the house…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border bg-card px-4 py-2.5 text-[15px] outline-none field-sizing-content focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!text.trim()}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground transition active:scale-90 disabled:opacity-40"
          >
            <SendHorizontal className="size-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
