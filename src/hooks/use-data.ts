"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Category, Page, Summary, User } from "@/lib/types";

export type Kind = "expenses" | "transfers" | "rice";

export function useSummary() {
  return useQuery({
    queryKey: ["summary"],
    queryFn: () => api<Summary>("/api/summary"),
    // Keep badges (chat, approvals) fresh while the app is open.
    refetchInterval: 30_000,
  });
}

/** Receiver approves or declines a transfer. */
export function useRespondTransfer() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (a: { id: string; version: number; decision: "approve" | "decline" }) =>
      api(`/api/records/transfers/${a.id}/respond`, { body: { decision: a.decision, version: a.version } }),
    onSuccess: (_d, a) => {
      toast.success(a.decision === "approve" ? "Payment confirmed" : "Payment declined");
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message);
      invalidate();
    },
  });
}

/** Lookups derived from the summary: users by id, categories by id, my id. */
export function useLookups() {
  const { data } = useSummary();
  return useMemo(() => {
    const users = data?.users ?? [];
    const guests = data?.guests ?? [];
    const categories = data?.categories ?? [];
    // Names/avatars resolve for home sharers and tour guests alike.
    const userById = new Map<string, User>([...users, ...guests].map((u) => [u.id, u]));
    const catById = new Map<string, Category>(categories.map((c) => [c.id, c]));
    return {
      meId: data?.meId ?? "",
      role: data?.role ?? "member",
      isGuest: data?.role === "guest",
      users,
      guests,
      tours: data?.tours ?? [],
      categories,
      activeCategories: categories.filter((c) => !c.deletedAt),
      userById,
      catById,
      name: (id: string | null | undefined) => (id ? (userById.get(id)?.name ?? "Unknown") : "—"),
    };
  }, [data]);
}

export function useRecords<T>(kind: Kind, params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  return useInfiniteQuery({
    queryKey: [kind, search.toString()],
    queryFn: ({ pageParam }) => {
      const s = new URLSearchParams(search);
      if (pageParam) s.set("cursor", pageParam);
      return api<Page<T>>(`/api/records/${kind}?${s}`);
    },
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Any write: refreshes every view that could be affected. */
export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

type RecordAction =
  | { op: "create"; kind: Kind; body: unknown }
  | { op: "update"; kind: Kind; id: string; body: unknown }
  | { op: "delete" | "restore"; kind: Kind; id: string; version: number };

export function useRecordMutation() {
  const invalidate = useInvalidateAll();
  return useMutation({
    mutationFn: (a: RecordAction) => {
      switch (a.op) {
        case "create":
          return api(`/api/records/${a.kind}`, { body: a.body });
        case "update":
          return api(`/api/records/${a.kind}/${a.id}`, { method: "PATCH", body: a.body });
        case "delete":
          return api(`/api/records/${a.kind}/${a.id}`, { method: "DELETE", body: { version: a.version } });
        case "restore":
          return api(`/api/records/${a.kind}/${a.id}/restore`, { body: { version: a.version } });
      }
    },
    onSuccess: (_d, a) => {
      toast.success({ create: "Saved", update: "Updated", delete: "Deleted", restore: "Restored" }[a.op]);
      invalidate();
    },
    onError: (err: Error) => {
      toast.error(err.message);
      invalidate();
    },
  });
}
