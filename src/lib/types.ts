import type { RiceStatus } from "./rice";

export type User = {
  id: string;
  name: string;
  color: string;
  /** member = home sharer (admin); guest = tour-only */
  role: "member" | "guest";
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
export type Balance = { id: string; balance: number; paid: number; consumed: number; planBalance: number };

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
  tourId: string | null;
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
  tourId: string | null;
  /** Created when a tour closes: a guest settling with one home sharer. */
  settlement: boolean;
};
export type RiceEntry = Meta & { userId: string; givenAt: string; note: string; trackerId: string };

export type Summary = {
  meId: string;
  role: "member" | "guest";
  /** Home sharers (for guests: only the ones on their tours). */
  users: User[];
  /** Tour guests. */
  guests: User[];
  tours: TourBrief[];
  pending: PendingMember[];
  categories: Category[];
  balances: Balance[];
  rice: RiceStatus;
  awaitingMe: Transfer[];
  lastChat: { id: number; userId: string; createdAt: string } | null;
  lastActivity: { id: number; userId: string | null } | null;
  trackers: Tracker[];
};

export type Tracker = {
  id: string;
  name: string;
  emoji: string;
  isDefault: boolean;
  /** Participants (everyone when \everyone\ is true). */
  memberIds: string[];
  everyone: boolean;
  status: RiceStatus;
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
export type ChatMessage = {
  id: number;
  userId: string;
  body: string;
  createdAt: string;
  deleted: boolean;
  reactions: { emoji: string; userId: string }[];
};

export type TourStatus = "planned" | "active" | "closed";
export type TourBrief = {
  id: string;
  name: string;
  emoji: string;
  status: TourStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  participantIds: string[];
  spent: number;
  planned: number;
};
export type TourPlanItem = { id: string; label: string; categoryId: string | null; amount: number };
export type TourDetail = {
  tour: TourBrief;
  plan: TourPlanItem[];
  byCategory: { categoryId: string | null; total: number; count: number }[];
  nets: { id: string; paid: number; consumed: number; net: number }[];
  settlements: { id: string; fromUserId: string; toUserId: string; amount: number; status: Transfer["status"]; version: number }[];
  preview: { from: string; to: string; amount: number }[] | null;
};