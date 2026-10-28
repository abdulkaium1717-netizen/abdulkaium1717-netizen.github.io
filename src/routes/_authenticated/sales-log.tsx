import { createFileRoute, Link } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSales, getPayments } from "@/lib/server-queries";
import { money, fmtDateTime, computeSaleDueStatus, type Sale } from "@/lib/shop";
import { PageHeader, Pending, LoadError, EmptyState, DueBadge } from "@/components/shop-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Printer, Trash2, Eye } from "lucide-react";

const salesQo = queryOptions({ queryKey: ["sales"], queryFn: () => getSales() });
const paymentsQo = queryOptions({
  queryKey: ["customer_payments"],
  queryFn: () => getPayments(),
});

export const Route = createFileRoute("/_authenticated/sales-log")({
  head: () => ({
    meta: [
      { title: "Sales Log — Easy Link" },
      {
        name: "description",
        content: "All Easy Link sales and invoices, with print and search.",
      },
      { property: "og:title", content: "Sales Log — Easy Link" },
      {
        property: "og:description",
        content: "All Easy Link sales and invoices, with print and search.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(salesQo),
      context.queryClient.ensureQueryData(paymentsQo),
    ]),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: SalesLog,
});

function SalesLog() {
  const { data: sales } = useSuspenseQuery(salesQo);
  const { data: payments } = useSuspenseQuery(paymentsQo);
  const dueStatus = useMemo(() => computeSaleDueStatus(sales, payments), [sales, payments]);
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [deleting, setDeleting] = useState<Sale | null>(null);

  const filtered = useMemo(() => {
    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null;
    const needle = q.trim().toLowerCase();
    return sales.filter((s) => {
      const t = new Date(s.created_at).getTime();
      if (fromTime != null && t < fromTime) return false;
      if (toTime != null && t > toTime) return false;
      if (needle) {
        const hay = `${s.invoice_no ?? ""} ${s.customer_name ?? ""} ${
          s.customer_phone ?? ""
        }`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [sales, from, to, q]);

  const totals = useMemo(
    () => ({
      count: filtered.length,
      revenue: filtered.reduce((a, s) => a + Number(s.total), 0),
      collected: filtered.reduce(
        (a, s) => a + Number(s.paid) + (dueStatus.get(s.id)?.recovered ?? 0),
        0,
      ),
      due: filtered.reduce(
        (a, s) => a + (dueStatus.get(s.id)?.remaining ?? Number(s.due)),
        0,
      ),
      cleared: filtered.filter((s) => dueStatus.get(s.id)?.cleared).length,
    }),
    [filtered, dueStatus],
  );

  const removeSale = useMutation({
    mutationFn: async () => {
      if (!deleting) throw new Error("Nothing selected");
      const { error } = await supabase.from("sales").delete().eq("id", deleting.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      await queryClient.invalidateQueries({ queryKey: ["sale_items"] });
      toast.success("Invoice deleted and stock restored");
      setDeleting(null);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not delete the invoice"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Log"
        subtitle="Every invoice, searchable and printable."
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" /> Print Log
          </Button>
        }
      />

      {/* Print-only report header */}
      <div className="hidden print:block">
        <h1 className="font-display text-xl font-bold">Easy Link — Sales Log</h1>
        <p className="text-sm">
          {from || to
            ? `Period: ${from || "start"} to ${to || "today"} · `
            : "All time · "}
          {totals.count} invoices · Revenue {money(totals.revenue)} · Due{" "}
          {money(totals.due)}
        </p>
      </div>

      <div className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Invoices
          </div>
          <div className="font-display text-xl font-bold">{totals.count}</div>
        </Card>
        <Card className="border-border/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Revenue
          </div>
          <div className="font-display text-xl font-bold">{money(totals.revenue)}</div>
        </Card>
        <Card className="border-border/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Collected
          </div>
          <div className="font-display text-xl font-bold">
            {money(totals.collected)}
          </div>
        </Card>
        <Card className="border-border/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Due left
          </div>
          <div className="font-display text-xl font-bold text-destructive">
            {money(totals.due)}
          </div>
          {totals.cleared > 0 ? (
            <div className="mt-0.5 text-xs text-success">
              {totals.cleared} leftover{totals.cleared === 1 ? "" : "s"} cleared
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardContent className="pt-6">
          <div className="no-print mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr]">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search invoice no, customer, phone…"
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No invoices match"
              hint="Adjust the date range or search, or create a new sale."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="no-print w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
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
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(s.created_at)}
                    </TableCell>
                    <TableCell>
                      {s.customer_name || "Walk-in"}
                      {s.customer_phone ? (
                        <span className="block text-xs text-muted-foreground">
                          {s.customer_phone}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {money(s.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(Number(s.paid) + (dueStatus.get(s.id)?.recovered ?? 0))}
                    </TableCell>
                    <TableCell className="text-right">
<DueBadge due={s.due} status={dueStatus.get(s.id)} />
                    </TableCell>
                    <TableCell className="no-print text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          asChild
                          aria-label={`Open invoice ${s.invoice_no ?? s.id}`}
                        >
                          <Link to="/invoice/$id" params={{ id: String(s.id) }}>
                            <Eye className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          asChild
                          aria-label={`Print receipt ${s.invoice_no ?? s.id}`}
                        >
                          <Link
                            to="/invoice/$id"
                            params={{ id: String(s.id) }}
                            search={{ print: true }}
                          >
                            <Printer className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => setDeleting(s)}
                          aria-label={`Delete invoice ${s.invoice_no ?? s.id}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell colSpan={3}>Total — {totals.count} invoices</TableCell>
                  <TableCell className="text-right">{money(totals.revenue)}</TableCell>
                  <TableCell className="text-right">{money(totals.collected)}</TableCell>
                  <TableCell className="text-right">{money(totals.due)}</TableCell>
                  <TableCell className="no-print" />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete invoice {deleting?.invoice_no ?? deleting?.id}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Stock quantities for the items in this invoice are restored. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => removeSale.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
