import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type Service = Tables["services"]["Row"];
export type InventoryItem = Tables["inventory_items"]["Row"];
export type Sale = Tables["sales"]["Row"];
export type SaleItem = Tables["sale_items"]["Row"];
export type CustomerPayment = Tables["customer_payments"]["Row"];

export type ServiceInsert = Tables["services"]["Insert"];
export type InventoryItemInsert = Tables["inventory_items"]["Insert"];

/** The seven service lines Easy Link sells. */
export const SERVICE_TYPES = [
  "Color Print",
  "Laser Print",
  "Photocopy",
  "LGL Photocopy",
  "Picture to Picture",
  "Compose",
  "Online Application",
  "Stationary Items",
] as const;

export const money = (value: number | string | null | undefined) =>
  "\u09F3" +
  Number(value ?? 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });

export const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const startOfTodayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const startOfMonthISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

export const daysAgoISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const dayKey = (iso: string) => iso.slice(0, 10);

export function customerKey(name: string | null, phone: string | null) {
  return `${(name ?? "").trim().toLowerCase()}|${(phone ?? "").trim()}`;
}

export type SaleDueStatus = {
  /** Due left on this invoice after leftover payments are applied. */
  remaining: number;
  /** Amount of this invoice's due that was paid back later. */
  recovered: number;
  /** The invoice had a due that has now been fully cleared. */
  cleared: boolean;
};

/**
 * Applies each customer's leftover payments to their unpaid invoices,
 * oldest invoice first, so every sale knows how much of its due is left.
 */
export function computeSaleDueStatus(
  sales: Pick<Sale, "id" | "due" | "created_at" | "customer_name" | "customer_phone">[],
  payments: Pick<CustomerPayment, "amount" | "customer_name" | "customer_phone">[],
): Map<number, SaleDueStatus> {
  const pool = new Map<string, number>();
  for (const p of payments) {
    const k = customerKey(p.customer_name, p.customer_phone);
    pool.set(k, (pool.get(k) ?? 0) + Number(p.amount));
  }
  const result = new Map<number, SaleDueStatus>();
  const ordered = [...sales].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const s of ordered) {
    const due = Number(s.due);
    if (due <= 0) {
      result.set(s.id, { remaining: 0, recovered: 0, cleared: false });
      continue;
    }
    const k = customerKey(s.customer_name, s.customer_phone);
    const available = pool.get(k) ?? 0;
    const recovered = round2(Math.min(due, available));
    pool.set(k, available - recovered);
    const remaining = round2(due - recovered);
    result.set(s.id, { remaining, recovered, cleared: remaining <= 0 });
  }
  return result;
}

export type DailyCost = Tables["daily_costs"]["Row"];

/** Quick-pick categories for cash taken out of the shop drawer. */
export const DAILY_COST_CATEGORIES = [
  "Food",
  "Tea/Snacks",
  "Transport",
  "Bill",
  "Shopping",
  "Other",
] as const;

/** Local calendar date (YYYY-MM-DD) for today, matching the `spent_on` date column. */
export const todayISODate = () => {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
};
