import type { RiceStatus } from "./rice";

export type User = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  needsPin: boolean;
  resetApproved: boolean;
  addedBy: string | null;
  joinedAt: string;
  /** Set when the member has a profile picture; changes whenever it's replaced. */
  avatarVersion: string | null;
};
export type PendingMember = { id: string; name: string; color: string; createdAt: string };
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
export type Transfer = Meta & {
  fromUserId: string;
  toUserId: string;
  amount: number;
  note: string;
  sentAt: string;
  /** pending = waiting for the receiver to confirm; only approved transfers count. */
  status: "pending" | "approved" | "declined";
  respondedBy: string | null;
  respondedAt: string | null;
};
export type RiceEntry = Meta & { userId: string; givenAt: string; note: string };

export type Summary = {
  meId: string;
  users: User[];
  pending: PendingMember[];
  categories: Category[];
  balances: Balance[];
  rice: RiceStatus;
  awaitingMe: Transfer[];
  lastChat: { id: number; userId: string; createdAt: string } | null;
  lastActivity: { id: number; userId: string | null } | null;
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
  /** 1 = Monday … 7 = Sunday */
  byWeekday: { dow: number; total: number; count: number }[];
  top: { id: string; description: string; amount: number; categoryId: string | null; payerId: string; spentAt: string }[];
  totals: { total: number; count: number; activeDays: number };
  /** Same-length period right before this one. */
  previous: { total: number; count: number };
};
export type ChatMessage = { id: number; userId: string; body: string; createdAt: string; deleted: boolean };
