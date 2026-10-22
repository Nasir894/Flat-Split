import type { RiceStatus } from "./rice";

export type User = { id: string; name: string; color: string; createdAt: string; needsPin: boolean; resetApproved: boolean };
export type Category = { id: string; name: string; emoji: string; isDefault: boolean; deletedAt: string | null };
export type Balance = { id: string; balance: number; paid: number; consumed: number };

type Meta = {
  id: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
  deletedBy: string | null;
  deletedAt: string | null;
  version: number;
};

export type Expense = Meta & {
  payerId: string;
  amount: number;
  categoryId: string | null;
  description: string;
  spentAt: string;
  shares: { userId: string; amount: number }[];
};
export type Transfer = Meta & { fromUserId: string; toUserId: string; amount: number; note: string; sentAt: string };
export type RiceEntry = Meta & { userId: string; givenAt: string; note: string };

export type Summary = {
  meId: string;
  users: User[];
  categories: Category[];
  balances: Balance[];
  rice: RiceStatus;
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type AuditEntry = {
  id: number;
  entity: string;
  entityId: string | null;
  action: "create" | "update" | "delete" | "restore" | "import";
  actorId: string | null;
  summary: string;
  createdAt: string;
  before?: unknown;
  after?: unknown;
};

export type Analytics = {
  daily: { day: string; total: number }[];
  byCategory: { categoryId: string | null; total: number; count: number }[];
  byPayer: { userId: string; total: number }[];
  byConsumer: { userId: string; total: number }[];
  totals: { total: number; count: number; largest: number };
};
