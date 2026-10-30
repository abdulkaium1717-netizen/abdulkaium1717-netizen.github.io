import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  Sale,
  SaleItem,
  Service,
  InventoryItem,
  CustomerPayment,
  DailyCost,
} from "@/lib/shop";

export const getSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase
    .from("sales")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Sale[];
});

export const getSaleItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase
    .from("sale_items")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SaleItem[];
});

export const getServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Service[];
});

export const getInventoryItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase
    .from("inventory_items")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryItem[];
});

export const getPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase
    .from("customer_payments")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CustomerPayment[];
});

export const getDailyCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase
    .from("daily_costs")
    .select("*")
    .order("spent_on", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as DailyCost[];
});

export const getSaleWithItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: number }) => input)
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: sale, error } = await db
      .from("sales")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!sale) return null;
    const { data: items, error: itemsError } = await db
      .from("sale_items")
      .select("*")
      .eq("sale_id", data.id)
      .order("id", { ascending: true });
    if (itemsError) throw new Error(itemsError.message);
    return { sale: sale as Sale, items: (items ?? []) as SaleItem[] };
  });
