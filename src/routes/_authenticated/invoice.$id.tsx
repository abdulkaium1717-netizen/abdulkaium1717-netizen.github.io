import { useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getSaleWithItems } from "@/lib/server-queries";
import { money, fmtDateTime } from "@/lib/shop";
import { Pending, LoadError, EmptyState } from "@/components/shop-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Printer } from "lucide-react";

const saleQo = (id: number) =>
  queryOptions({
    queryKey: ["sale", id],
    queryFn: () => getSaleWithItems({ data: { id } }),
  });

export const Route = createFileRoute("/_authenticated/invoice/$id")({
  validateSearch: (search: Record<string, unknown>): { print?: boolean | undefined } => ({
    print: search["print"] === "1" || search["print"] === true ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Invoice — Easy Link" },
      {
        name: "description",
        content: "Printable sales invoice for Easy Link.",
      },
      { property: "og:title", content: "Invoice — Easy Link" },
      {
        property: "og:description",
        content: "Printable sales invoice for Easy Link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(saleQo(Number(params.id))),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: InvoicePage,
});

function InvoicePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(saleQo(Number(id)));
  const { print: autoPrint } = Route.useSearch();

  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 200);
    return () => clearTimeout(t);
  }, [autoPrint]);

  if (!data) {
    return <EmptyState title="Invoice not found" hint="It may have been deleted." />;
  }
  const { sale, items } = data;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex justify-between">
        <Button variant="outline" asChild>
          <Link to="/sales-log">
            <ArrowLeft className="size-4" /> Sales Log
          </Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print Invoice
        </Button>
      </div>

      <div className="print-sheet rounded-xl border border-border bg-card p-6 shadow-md sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-primary-foreground">
              EL
            </span>
            <div>
              <div className="font-display text-2xl font-bold">Easy Link</div>
              <div className="text-xs text-muted-foreground">
                Stationery · Printing · Photocopy · Online Services
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="font-display text-lg font-bold">
              {sale.invoice_no ?? `EL-${String(sale.id).padStart(5, "0")}`}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtDateTime(sale.created_at)}
            </div>
            <div className="mt-1">
              {Number(sale.due) > 0 ? (
                <Badge variant="destructive">Due {money(sale.due)}</Badge>
              ) : (
                <Badge className="bg-success text-success-foreground">Paid in full</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 py-5 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Bill To
            </div>
            <div className="mt-1 font-medium">{sale.customer_name || "Walk-in Customer"}</div>
            {sale.customer_phone ? (
              <div className="text-sm text-muted-foreground">{sale.customer_phone}</div>
            ) : null}
          </div>
          {sale.notes ? (
            <div className="sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notes
              </div>
              <div className="mt-1 text-sm">{sale.notes}</div>
            </div>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((i, idx) => (
              <TableRow key={i.id}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>
                  {i.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {i.kind === "service" ? "service" : "stock"}
                  </span>
                </TableCell>
                <TableCell className="text-right">{Number(i.qty)}</TableCell>
                <TableCell className="text-right">{money(i.rate)}</TableCell>
                <TableCell className="text-right font-medium">{money(i.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{money(sale.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-destructive">− {money(sale.discount_amount)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold">
              <span>Total</span>
              <span>{money(sale.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <span>{money(sale.paid)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className={Number(sale.due) > 0 ? "text-destructive" : "text-muted-foreground"}>
                Due
              </span>
              <span className={Number(sale.due) > 0 ? "text-destructive" : ""}>
                {money(sale.due)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          Thank you for shopping at Easy Link! · Please keep this invoice for any service
          claims.
        </div>
      </div>
    </div>
  );
}
