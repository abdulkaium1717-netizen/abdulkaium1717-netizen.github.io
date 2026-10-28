import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getSales, getSaleItems, getPayments } from "@/lib/server-queries";
import {
  money,
  dayKey,
  daysAgoISO,
  startOfMonthISO,
  customerKey,
  type Sale,
  type SaleItem,
  type CustomerPayment,
} from "@/lib/shop";
import { KpiCard, PageHeader, Pending, LoadError, EmptyState } from "@/components/shop-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { TrendingUp, HandCoins, BadgePercent, ReceiptText } from "lucide-react";

const salesQo = queryOptions({ queryKey: ["sales"], queryFn: () => getSales() });
const saleItemsQo = queryOptions({
  queryKey: ["sale_items"],
  queryFn: () => getSaleItems(),
});
const paymentsQo = queryOptions({
  queryKey: ["customer_payments"],
  queryFn: () => getPayments(),
});

export const Route = createFileRoute("/_authenticated/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis — Easy Link" },
      {
        name: "description",
        content: "Easy Link business analysis: revenue, service breakdown, top items and dues.",
      },
      { property: "og:title", content: "Analysis — Easy Link" },
      {
        property: "og:description",
        content: "Easy Link business analysis: revenue, service breakdown, top items and dues.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(salesQo),
      context.queryClient.ensureQueryData(saleItemsQo),
      context.queryClient.ensureQueryData(paymentsQo),
    ]),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: AnalysisPage,
});

type Period = "month" | "30d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  month: "This Month",
  "30d": "Last 30 Days",
  all: "All Time",
};

function BreakdownBars({
  rows,
  emptyText,
}: {
  rows: { name: string; amount: number }[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="truncate font-medium">{r.name}</span>
            <span className="ml-2 shrink-0 text-muted-foreground">{money(r.amount)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max((r.amount / max) * 100, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalysisPage() {
  const { data: sales } = useSuspenseQuery(salesQo);
  const { data: saleItems } = useSuspenseQuery(saleItemsQo);
  const { data: payments } = useSuspenseQuery(paymentsQo);
  const [period, setPeriod] = useState<Period>("month");

  const since = useMemo(() => {
    if (period === "month") return startOfMonthISO();
    if (period === "30d") return daysAgoISO(30);
    return "";
  }, [period]);

  const filtered = useMemo(
    () => sales.filter((s) => (since ? s.created_at >= since : true)),
    [sales, since],
  );
  const saleIds = useMemo(() => new Set(filtered.map((s) => s.id)), [filtered]);
  const items = useMemo(
    () => saleItems.filter((i) => saleIds.has(i.sale_id)),
    [saleItems, saleIds],
  );

  const revenue = filtered.reduce((a, s) => a + Number(s.total), 0);
  const collected = filtered.reduce((a, s) => a + Number(s.paid), 0);
  const discountGiven = filtered.reduce((a, s) => a + Number(s.discount_amount), 0);
  const dueCreated = filtered.reduce((a, s) => a + Number(s.due), 0);

  // Dues actually outstanding right now (all time)
  const billedByCustomer = new Map<string, number>();
  for (const s of sales) {
    if (Number(s.due) > 0) {
      const key = customerKey(s.customer_name, s.customer_phone);
      billedByCustomer.set(key, (billedByCustomer.get(key) ?? 0) + Number(s.due));
    }
  }
  const paidBackByCustomer = new Map<string, number>();
  for (const p of payments) {
    const key = customerKey(p.customer_name, p.customer_phone);
    paidBackByCustomer.set(key, (paidBackByCustomer.get(key) ?? 0) + Number(p.amount));
  }
  let outstanding = 0;
  for (const [key, billed] of billedByCustomer) {
    outstanding += Math.max(0, billed - (paidBackByCustomer.get(key) ?? 0));
  }

  const serviceRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      if (i.kind === "service") {
        map.set(i.name, (map.get(i.name) ?? 0) + Number(i.amount));
      }
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [items]);

  const itemRows = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) {
      if (i.kind === "inventory") {
        map.set(i.name, (map.get(i.name) ?? 0) + Number(i.amount));
      }
    }
    return [...map.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [items]);

  const dailySeries = useMemo(() => {
    const chartDays = period === "month" ? 30 : 30;
    const from = daysAgoISO(chartDays - 1);
    const map = new Map<string, number>();
    for (const s of sales) {
      if (s.created_at >= from) {
        const k = dayKey(s.created_at);
        map.set(k, (map.get(k) ?? 0) + Number(s.total));
      }
    }
    const out: { day: string; total: number }[] = [];
    for (let d = chartDays - 1; d >= 0; d--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      const key = dt.toISOString().slice(0, 10);
      out.push({
        day: dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        total: Math.round(map.get(key) ?? 0),
      });
    }
    return out;
  }, [sales, period]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analysis"
        subtitle="Where your money comes from and what is left to collect."
        actions={
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={money(revenue)}
          hint={`${filtered.length} invoices`}
          icon={<TrendingUp className="size-5" />}
        />
        <KpiCard
          label="Collected"
          value={money(collected)}
          hint="cash received"
          icon={<ReceiptText className="size-5" />}
        />
        <KpiCard
          label="Discount Given"
          value={money(discountGiven)}
          hint="on these invoices"
          icon={<BadgePercent className="size-5" />}
        />
        <KpiCard
          label="Dues Created"
          value={money(dueCreated)}
          hint={`${money(outstanding)} still outstanding`}
          icon={<HandCoins className="size-5" />}
        />
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Daily Revenue — last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  interval="preserveStartEnd"
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                  tickLine={false}
                  width={54}
                />
                <Tooltip
                  formatter={(value) => [money(Number(value)), "Revenue"]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Service-wise Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars rows={serviceRows} emptyText="No service sales in this period." />
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg">Top Selling Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars rows={itemRows} emptyText="No stock item sales in this period." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Keep types referenced for clarity of query results
export type { Sale, SaleItem, CustomerPayment };
