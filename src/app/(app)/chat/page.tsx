"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Loader2, SendHorizontal, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { REACTIONS } from "@/lib/chat";
import { dayLabel } from "@/lib/dates";
import { markSeen } from "@/lib/seen";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLookups } from "@/hooks/use-data";
import { UserAvatar } from "@/components/member-avatar";

const EMOJIS =
  "😀 😂 🤣 😊 😍 🥰 😘 😎 🤔 😅 😭 😡 🥳 😴 🤤 🤗 🙏 👍 👎 👏 🙌 💪 👀 🔥 ❤️ 💯 ✅ ❌ 🎉 💸 💰 🛒 🍚 🍗 🍔 🍕 ☕ 🧾 🏠 🧹 💡 🚿 ⚡ 🌐 😬 🙃 🤝 👌".split(" ");
const POLL_MS = 2500;
const GROUP_GAP_MS = 5 * 60 * 1000;
const TYPING_PING_MS = 3000;

type Msg = ChatMessage & { sending?: boolean };

/** Tells the server "I'm typing" at most every few seconds, and "stopped" when the box is cleared. */
function pingTyping(last: { current: number }, value: string) {
  const now = Date.now();
  if (value.trim() && now - last.current > TYPING_PING_MS) {
    last.current = now;
    api("/api/chat/typing", { method: "POST" }).catch(() => {});
  } else if (!value.trim() && last.current) {
    last.current = 0;
    api("/api/chat/typing", { method: "DELETE" }).catch(() => {});
  }
}
type PollResponse = { items: ChatMessage[]; changed: ChatMessage[]; typing: string[]; now: string };

export default function ChatPage() {
  const { meId, userById } = useLookups();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef(0);
  const since = useRef<string | null>(null);
  const lastTypingPing = useRef(0);

  const nearBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
  const scrollToEnd = (smooth = true) =>
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" }));

  /** Adds new messages and replaces updated ones (reactions / deletions). */
  const merge = useCallback((incoming: ChatMessage[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const byId = new Map(incoming.map((m) => [m.id, m]));
      const updated = prev.map((m) => byId.get(m.id) ?? m);
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...updated, ...fresh].sort((a, b) => a.id - b.id) : updated;
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
    markSeen("chat", lastId.current);
  }, []);

  // First load.
  useEffect(() => {
    api<{ items: ChatMessage[]; hasMore: boolean; now: string }>("/api/chat")
      .then((r) => {
        since.current = r.now;
        merge(r.items);
        setHasMore(r.hasMore);
        scrollToEnd(false);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [merge]);

  // Poll for new messages, reaction changes and typing while this screen is visible.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== "visible" || !since.current) return;
      try {
        const qs = new URLSearchParams({ after: String(lastId.current || 0), since: since.current });
        const r = await api<PollResponse>(`/api/chat?${qs}`);
        if (stopped) return;
        since.current = r.now;
        const stick = nearBottom();
        merge([...r.changed, ...r.items]);
        setTyping(r.typing);
        if (r.items.length && stick) scrollToEnd();
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

  const onType = (value: string) => {
    setText(value);
    pingTyping(lastTypingPing, value);
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const tempId = -Date.now();
    setMessages((prev) => [
      ...prev,
      { id: tempId, userId: meId, body, createdAt: new Date().toISOString(), deleted: false, reactions: [], sending: true },
    ]);
    setText("");
    setShowEmoji(false);
    lastTypingPing.current = 0;
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

  const react = async (m: Msg, emoji: string) => {
    setSelected(null);
    // Show it right away; the next poll brings the server's version.
    const mineNow = m.reactions.find((r) => r.userId === meId)?.emoji;
    const others = m.reactions.filter((r) => r.userId !== meId);
    const next = mineNow === emoji ? others : [...others, { emoji, userId: meId }];
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: next } : x)));
    try {
      await api(`/api/chat/${m.id}/react`, { body: { emoji } });
    } catch (e) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, reactions: m.reactions } : x)));
      toast.error((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    setSelected(null);
    try {
      await api(`/api/chat/${id}`, { method: "DELETE" });
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: "", deleted: true, reactions: [] } : m)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const addEmoji = (e: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    onType(text.slice(0, start) + e + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + e.length, start + e.length);
    });
  };

  const typingNames = typing.map((id) => userById.get(id)?.name).filter(Boolean) as string[];

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col" onClick={() => setSelected(null)}>
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
              !next ||
              next.userId !== m.userId ||
              +new Date(next.createdAt) - +new Date(m.createdAt) > GROUP_GAP_MS ||
              !isSameDay(new Date(next.createdAt), new Date(m.createdAt));
            const user = userById.get(m.userId);
            const myReaction = m.reactions.find((r) => r.userId === meId)?.emoji;
            const counts = Object.entries(
              m.reactions.reduce<Record<string, number>>((acc, r) => ((acc[r.emoji] = (acc[r.emoji] ?? 0) + 1), acc), {}),
            );
            const isSelected = selected === m.id;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">{dayLabel(m.createdAt)}</span>
                  </div>
                )}
                <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", startsGroup && "mt-3")}>
                  {!mine && <div className="w-8 shrink-0">{endsGroup && <UserAvatar user={user} className="size-8 text-[10px]" />}</div>}
                  <div className={cn("relative flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
                    {!mine && startsGroup && (
                      <span className="mb-1 ml-1 text-[11px] font-medium text-muted-foreground">{user?.name ?? "Former member"}</span>
                    )}

                    {/* Reaction bar (tap a message to open) */}
                    {isSelected && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "rise absolute -top-12 z-10 flex items-center gap-0.5 rounded-full border bg-popover p-1 shadow-xl",
                          mine ? "right-0" : "left-0",
                        )}
                      >
                        {REACTIONS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => react(m, e)}
                            className={cn(
                              "flex size-9 items-center justify-center rounded-full text-xl transition active:scale-90",
                              myReaction === e && "bg-brand/25",
                            )}
                            aria-label={`React ${e}`}
                          >
                            {e}
                          </button>
                        ))}
                        {mine && (
                          <button
                            type="button"
                            onClick={() => remove(m.id)}
                            aria-label="Delete for everyone"
                            className="ml-0.5 flex size-9 items-center justify-center rounded-full text-negative transition active:scale-90"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={m.deleted || m.id < 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(isSelected ? null : m.id);
                      }}
                      onDoubleClick={() => !m.deleted && m.id > 0 && react(m, "❤️")}
                      className={cn(
                        "px-3.5 py-2 text-left text-[15px] leading-snug break-words whitespace-pre-wrap transition",
                        mine ? "rounded-2xl rounded-br-md bg-brand text-brand-foreground" : "rounded-2xl rounded-bl-md border bg-card text-card-foreground",
                        !startsGroup && (mine ? "rounded-tr-md" : "rounded-tl-md"),
                        m.deleted && "border border-dashed bg-transparent text-muted-foreground italic",
                        m.sending && "opacity-60",
                        isSelected && "scale-[1.02] ring-2 ring-brand/50",
                      )}
                    >
                      {m.deleted ? "Message deleted" : m.body}
                    </button>

                    {counts.length > 0 && (
                      <div className={cn("-mt-1.5 flex flex-wrap gap-1", mine ? "mr-2 justify-end" : "ml-2")}>
                        {counts.map(([emoji, n]) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              react(m, emoji);
                            }}
                            className={cn(
                              "rise flex items-center gap-0.5 rounded-full border bg-popover px-1.5 py-0.5 text-xs shadow-sm",
                              myReaction === emoji && "border-brand/60 bg-brand/15",
                            )}
                          >
                            <span>{emoji}</span>
                            {n > 1 && <span className="font-medium tabular">{n}</span>}
                          </button>
                        ))}
                      </div>
                    )}

                    {endsGroup && (
                      <span className="mt-1 px-1 text-[10px] text-muted-foreground">
                        {m.sending ? "Sending…" : format(new Date(m.createdAt), "h:mm a")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* "… is typing" */}
        {typingNames.length > 0 && (
          <div className="rise mt-3 flex items-end gap-2">
            <div className="w-8 shrink-0">
              <UserAvatar user={userById.get(typing[0])} className="size-8 text-[10px]" />
            </div>
            <div className="flex flex-col items-start">
              <span className="mb-1 ml-1 text-[11px] font-medium text-muted-foreground">
                {typingNames.length === 1 ? `${typingNames[0]} is typing` : `${typingNames.join(", ")} are typing`}
              </span>
              <span className="flex items-center gap-1 rounded-2xl rounded-bl-md border bg-card px-4 py-3" aria-label="typing">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="typing-dot size-2 rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 160}ms` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* Composer: text and emoji only */}
      <div
        className="sticky bottom-0 -mx-4 border-t bg-background/85 px-3 pt-2 backdrop-blur-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
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
            onChange={(e) => onType(e.target.value)}
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
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">Tap a message to react · double-tap for ❤️</p>
      </div>
    </div>
  );
}
