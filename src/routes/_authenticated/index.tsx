import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSales, getPayments, getInventoryItems, getDailyCosts } from "@/lib/server-queries";
import {
  computeSaleDueStatus,
  money,
  fmtDateTime,
  startOfMonthISO,
  customerKey,
  todayISODate,
  type Sale,
  type InventoryItem,
  type CustomerPayment,
} from "@/lib/shop";
import { KpiCard, PageHeader, Pending, LoadError, EmptyState, DueBadge } from "@/components/shop-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ReceiptText,
  PackagePlus,
  TrendingUp,
  HandCoins,
  AlertTriangle,
  ArrowRight,
  Wallet,
  Banknote,
} from "lucide-react";

const salesQo = queryOptions({ queryKey: ["sales"], queryFn: () => getSales() });
const paymentsQo = queryOptions({
  queryKey: ["customer_payments"],
  queryFn: () => getPayments(),
});
const itemsQo = queryOptions({
  queryKey: ["inventory_items"],
  queryFn: () => getInventoryItems(),
});
const costsQo = queryOptions({
  queryKey: ["daily_costs"],
  queryFn: () => getDailyCosts(),
});

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Easy Link — Dashboard" },
      {
        name: "description",
        content: "Today's sales, dues, stock alerts and recent invoices for Easy Link.",
      },
      { property: "og:title", content: "Easy Link — Dashboard" },
      {
        property: "og:description",
        content: "Today's sales, dues, stock alerts and recent invoices for Easy Link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(salesQo),
      context.queryClient.ensureQueryData(paymentsQo),
      context.queryClient.ensureQueryData(itemsQo),
      context.queryClient.ensureQueryData(costsQo),
    ]),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: Dashboard,
});

function Dashboard() {
  const { data: sales } = useSuspenseQuery(salesQo);
  const { data: payments } = useSuspenseQuery(paymentsQo);
  const { data: items } = useSuspenseQuery(itemsQo);
  const { data: costs } = useSuspenseQuery(costsQo);
  const dueStatus = computeSaleDueStatus(sales, payments);

  // Today's date key. It updates itself at midnight, so the dashboard
  // starts a fresh day even if the page was left open overnight.
  const [todayKey, setTodayKey] = useState(todayISODate());
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      5,
    );
    const timer = setTimeout(
      () => setTodayKey(todayISODate()),
      nextMidnight.getTime() - now.getTime(),
    );
    return () => clearTimeout(timer);
  }, [todayKey]);

  // Local midnight at the start of today
  const startToday = new Date(`${todayKey}T00:00:00`).getTime();
  const isToday = (iso: string) => new Date(iso).getTime() >= startToday;

  const today = sales.filter((s) => isToday(s.created_at));
  const month = sales.filter((s) => s.created_at >= startOfMonthISO());

  const todayTotal = today.reduce((a, s) => a + Number(s.total), 0);
  const monthTotal = month.reduce((a, s) => a + Number(s.total), 0);

  const monthKey = todayKey.slice(0, 7);
  const todayCosts = costs.filter((c) => c.spent_on === todayKey);
  const cashOutToday = todayCosts.reduce((a, c) => a + Number(c.amount), 0);
  const cashOutMonth = costs
    .filter((c) => c.spent_on.startsWith(monthKey))
    .reduce((a, c) => a + Number(c.amount), 0);

  // Cash in hand today = money received today (paid on today's sales
  // plus customer dues collected today) minus cash taken out today
  const paidToday = today.reduce((a, s) => a + Number(s.paid), 0);
  const duesCollectedToday = payments
    .filter((p) => isToday(p.created_at))
    .reduce((a, p) => a + Number(p.amount), 0);
  const receivedToday = paidToday + duesCollectedToday;
  const cashInHand = receivedToday - cashOutToday;

  // Outstanding dues = unpaid remainders minus payments received
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

  const lowStock = items.filter(
    (i) => Number(i.stock) <= Number(i.low_stock_threshold),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Easy Link at a glance — sales, dues and stock."
        actions={
          <>
            <Button asChild>
              <Link to="/new-sale">
                <ReceiptText className="size-4" /> New Sale
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/inventory">
                <PackagePlus className="size-4" /> Add Items
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Today's Sales"
          value={money(todayTotal)}
          hint={`${today.length} invoice${today.length === 1 ? "" : "s"} today`}
          icon={<TrendingUp className="size-5" />}
        />
        <KpiCard
          label="Cash Used Today"
          value={money(cashOutToday)}
          hint={`${money(cashOutMonth)} this month`}
          icon={<Wallet className="size-5" />}
        />
        <KpiCard
          label="Cash In Hand Today"
          value={money(cashInHand)}
          hint={`${money(receivedToday)} received − ${money(cashOutToday)} used`}
          icon={<Banknote className="size-5" />}
        />
        <KpiCard
          label="This Month"
          value={money(monthTotal)}
          hint={`${month.length} invoice${month.length === 1 ? "" : "s"} this month`}
          icon={<ReceiptText className="size-5" />}
        />
        <KpiCard
          label="Customer Dues"
          value={money(outstanding)}
          hint="leftover to collect"
          icon={<HandCoins className="size-5" />}
        />
        <KpiCard
          label="Low Stock"
          value={String(lowStock.length)}
          hint={lowStock.length > 0 ? "items need restocking" : "stock is healthy"}
          icon={<AlertTriangle className="size-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/70 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-display text-lg">Today's Sales</CardTitle>
            <Link
              to="/sales-log"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Sales Log <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {today.length === 0 ? (
              <EmptyState
                title="No sales today"
                hint="New invoices show here. All past invoices stay in the Sales Log."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                    <TableHead className="text-right">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {today.slice(0, 6).map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          to="/invoice/$id"
                          params={{ id: String(s.id) }}
                          className="font-medium text-primary hover:underline"
                        >
                          {s.invoice_no ?? `EL-${String(s.id).padStart(5, "0")}`}
                        </Link>
                      </TableCell>
                      <TableCell>{s.customer_name || "Walk-in"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {money(s.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DueBadge due={s.due} status={dueStatus.get(s.id)} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {fmtDateTime(s.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-display text-lg">Stock Alerts</CardTitle>
            <Link
              to="/leftover"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Leftover <ArrowRight className="size-4" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.length === 0 ? (
              <EmptyState
                title="No inventory items yet"
                hint="Add your shop items in Inventory."
              />
            ) : lowStock.length === 0 ? (
              <EmptyState title="All items are well stocked" />
            ) : (
              lowStock.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between rounded-md border border-border/70 bg-muted/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Alert below {Number(i.low_stock_threshold)} {i.unit}
                    </div>
                  </div>
                  <Badge variant="destructive">
                    {Number(i.stock)} {i.unit}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="font-display text-lg">Today's Daily Costs</CardTitle>
          <Link
            to="/daily-cost"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Daily Cost <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
        <CardContent>
          {todayCosts.length === 0 ? (
            <EmptyState
              title="No cash used today"
              hint="Add cash you take out in Daily Cost. Past entries stay on the Daily Cost page."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Used for</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {todayCosts.slice(0, 5).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.spent_on}</TableCell>
                    <TableCell className="font-medium">{c.category}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.description || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {money(c.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Keep the supabase client import used for browser mutations elsewhere; this
// page only reads via server functions.
void supabase;
