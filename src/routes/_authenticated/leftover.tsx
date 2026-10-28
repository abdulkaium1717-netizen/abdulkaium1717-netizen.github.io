import { createFileRoute, Link } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSales, getPayments, getInventoryItems } from "@/lib/server-queries";
import {
  money,
  fmtDate,
  customerKey,
  type Sale,
  type CustomerPayment,
  type InventoryItem,
} from "@/lib/shop";
import { PageHeader, Pending, LoadError, EmptyState } from "@/components/shop-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronDown,
  ChevronUp,
  HandCoins,
  Boxes,
  PackagePlus,
  Printer,
  Trash2,
} from "lucide-react";
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

type DeleteTarget =
  | { kind: "customer"; customer: CustomerDue }
  | { kind: "payment"; payment: CustomerPayment }
  | { kind: "item"; item: InventoryItem };

const salesQo = queryOptions({ queryKey: ["sales"], queryFn: () => getSales() });
const paymentsQo = queryOptions({
  queryKey: ["customer_payments"],
  queryFn: () => getPayments(),
});
const itemsQo = queryOptions({
  queryKey: ["inventory_items"],
  queryFn: () => getInventoryItems(),
});

export const Route = createFileRoute("/_authenticated/leftover")({
  head: () => ({
    meta: [
      { title: "Leftover — Easy Link" },
      {
        name: "description",
        content: "Customer dues (baki) and leftover stock for Easy Link.",
      },
      { property: "og:title", content: "Leftover — Easy Link" },
      {
        property: "og:description",
        content: "Customer dues (baki) and leftover stock for Easy Link.",
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
    ]),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: LeftoverPage,
});

type CustomerDue = {
  key: string;
  name: string;
  phone: string | null;
  billed: number;
  paidBack: number;
  outstanding: number;
  sales: Sale[];
  payments: CustomerPayment[];
};

function LeftoverPage() {
  const { data: sales } = useSuspenseQuery(salesQo);
  const { data: payments } = useSuspenseQuery(paymentsQo);
  const { data: items } = useSuspenseQuery(itemsQo);
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [receiveFor, setReceiveFor] = useState<CustomerDue | null>(null);
  const [receiveAmount, setReceiveAmount] = useState("");
  const [receiveNote, setReceiveNote] = useState("");
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const [printCustomer, setPrintCustomer] = useState<CustomerDue | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    if (!printCustomer) return;
    const t = setTimeout(() => {
      window.print();
      setPrintCustomer(null);
    }, 200);
    return () => clearTimeout(t);
  }, [printCustomer]);

  const customers = useMemo<CustomerDue[]>(() => {
    const map = new Map<string, CustomerDue>();
    const ensure = (name: string | null, phone: string | null): CustomerDue => {
      const key = customerKey(name, phone);
      let c = map.get(key);
      if (!c) {
        c = {
          key,
          name: (name ?? "").trim() || "Walk-in",
          phone: (phone ?? "").trim() || null,
          billed: 0,
          paidBack: 0,
          outstanding: 0,
          sales: [],
          payments: [],
        };
        map.set(key, c);
      }
      return c;
    };
    for (const s of sales) {
      if (Number(s.due) > 0) {
        const c = ensure(s.customer_name, s.customer_phone);
        c.billed += Number(s.due);
        c.sales.push(s);
      }
    }
    for (const p of payments) {
      const c = ensure(p.customer_name, p.customer_phone);
      c.paidBack += Number(p.amount);
      c.payments.push(p);
    }
    for (const c of map.values()) {
      c.outstanding = Math.max(0, c.billed - c.paidBack);
    }
    return [...map.values()]
      .filter((c) => c.billed > 0 || c.paidBack > 0)
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [sales, payments]);

  const totalOutstanding = customers.reduce((a, c) => a + c.outstanding, 0);

  const receivePayment = useMutation({
    mutationFn: async () => {
      if (!receiveFor) throw new Error("Nothing selected");
      const amount = Number(receiveAmount) || 0;
      if (amount <= 0) throw new Error("Enter the amount received");
      const { error } = await supabase.from("customer_payments").insert({
        customer_name: receiveFor.name,
        customer_phone: receiveFor.phone,
        amount,
        note: receiveNote.trim() || null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer_payments"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
      ]);
      toast.success("Payment received — Sales Log and Recent Sales updated");
      setReceiveFor(null);
      setReceiveAmount("");
      setReceiveNote("");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not record the payment"),
  });

  const removeTarget = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) throw new Error("Nothing selected");
      if (deleteTarget.kind === "payment") {
        const { error } = await supabase
          .from("customer_payments")
          .delete()
          .eq("id", deleteTarget.payment.id);
        if (error) throw new Error(error.message);
      } else if (deleteTarget.kind === "item") {
        const { error } = await supabase
          .from("inventory_items")
          .delete()
          .eq("id", deleteTarget.item.id);
        if (error) throw new Error(error.message);
      } else {
        const c = deleteTarget.customer;
        const saleIds = c.sales.map((x) => x.id);
        const paymentIds = c.payments.map((x) => x.id);
        if (paymentIds.length) {
          const { error } = await supabase
            .from("customer_payments")
            .delete()
            .in("id", paymentIds);
          if (error) throw new Error(error.message);
        }
        if (saleIds.length) {
          const { error } = await supabase
            .from("sales")
            .update({ due: 0 })
            .in("id", saleIds);
          if (error) throw new Error(error.message);
        }
      }
    },
    onSuccess: async () => {
      const kind = deleteTarget?.kind;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer_payments"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory_items"] }),
      ]);
      toast.success(
        kind === "payment"
          ? "Payment entry deleted"
          : kind === "item"
            ? "Stock item deleted"
            : "Leftover entry deleted",
      );
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  const restock = useMutation({
    mutationFn: async () => {
      if (!restockItem) throw new Error("Nothing selected");
      const qty = Number(restockQty) || 0;
      if (qty <= 0) throw new Error("Enter how many units arrived");
      const { error } = await supabase
        .from("inventory_items")
        .update({ stock: Number(restockItem.stock) + qty })
        .eq("id", restockItem.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success("Stock updated");
      setRestockItem(null);
      setRestockQty("");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not update the stock"),
  });

  return (
    <div className="space-y-6">
      <div className={printCustomer ? "print:hidden" : ""}>
      <PageHeader
        title="Leftover"
        subtitle="Customer dues to collect and stock left on the shelf."
      />

      <Tabs defaultValue="dues">
        <TabsList>
          <TabsTrigger value="dues">Customer Dues</TabsTrigger>
          <TabsTrigger value="stock">Leftover Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="dues" className="mt-4 space-y-3">
          {customers.length === 0 ? (
            <Card className="border-border/70 shadow-sm">
              <CardContent>
                <EmptyState
                  title="No customer dues"
                  hint="When an invoice is not fully paid, the customer appears here with their leftover amount."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card px-4 py-3 shadow-sm">
                <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <HandCoins className="size-4" /> Total leftover to collect
                </span>
                <span className="font-display text-xl font-bold text-destructive">
                  {money(totalOutstanding)}
                </span>
              </div>
              {customers.map((c) => (
                <Card key={c.key} className="border-border/70 shadow-sm">
                  <CardContent className="p-0">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <div className="font-medium">{c.name}</div>
                        {c.phone ? (
                          <div className="text-xs text-muted-foreground">{c.phone}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Billed due</div>
                          <div className="text-sm font-medium">{money(c.billed)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Paid back</div>
                          <div className="text-sm font-medium text-success">
                            {money(c.paidBack)}
                          </div>
                        </div>
                        <Badge
                          variant={c.outstanding > 0 ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {c.outstanding > 0 ? `${money(c.outstanding)} left` : "Cleared"}
                        </Badge>
                        {c.outstanding > 0 ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setReceiveFor(c);
                              setReceiveAmount(String(c.outstanding));
                              setReceiveNote("");
                            }}
                          >
                            <HandCoins className="size-4" /> Receive
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ kind: "customer", customer: c })}
                          aria-label={`Delete leftover for ${c.name}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setPrintCustomer(c)}
                          aria-label={`Print dues statement for ${c.name}`}
                        >
                          <Printer className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setExpanded(expanded === c.key ? null : c.key)}
                          aria-label={expanded === c.key ? "Hide details" : "Show details"}
                        >
                          {expanded === c.key ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    {expanded === c.key ? (
                      <div className="grid gap-4 border-t border-border px-4 py-3 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Unpaid invoices
                          </h4>
                          {c.sales.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No unpaid invoices — dues cleared.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {c.sales.map((s) => (
                                <li
                                  key={s.id}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <Link
                                    to="/invoice/$id"
                                    params={{ id: String(s.id) }}
                                    className="text-primary hover:underline"
                                  >
                                    {s.invoice_no ?? `EL-${String(s.id).padStart(5, "0")}`}
                                  </Link>
                                  <span className="text-muted-foreground">
                                    {fmtDate(s.created_at)} ·{" "}
                                    <span className="font-medium text-destructive">
                                      {money(s.due)} due
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Payments received
                          </h4>
                          {c.payments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No payments recorded yet.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {c.payments.map((p) => (
                                <li
                                  key={p.id}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span className="text-muted-foreground">
                                    {fmtDate(p.created_at)}
                                    {p.note ? ` · ${p.note}` : ""}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="font-medium text-success">
                                      {money(p.amount)}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 text-destructive hover:text-destructive"
                                      onClick={() =>
                                        setDeleteTarget({ kind: "payment", payment: p })
                                      }
                                      aria-label="Delete this payment entry"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="stock" className="mt-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="pt-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Boxes className="size-4" />
                  {items.length} items · total value{" "}
                  <span className="font-semibold text-foreground">
                    {money(
                      items.reduce((a, i) => a + Number(i.stock) * Number(i.sale_price), 0),
                    )}
                  </span>
                </span>
                <Button asChild variant="outline">
                  <Link to="/inventory">
                    <PackagePlus className="size-4" /> Manage Inventory
                  </Link>
                </Button>
              </div>
              {items.length === 0 ? (
                <EmptyState
                  title="No stock recorded yet"
                  hint="Add items in Inventory to track what is left on the shelf."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Left</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead className="text-right">Remaining Value</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="w-40 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => {
                      const stock = Number(i.stock);
                      const low = stock <= Number(i.low_stock_threshold);
                      return (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{i.name}</TableCell>
                          <TableCell className="text-right">
                            {stock} {i.unit}
                          </TableCell>
                          <TableCell className="text-right">{money(i.sale_price)}</TableCell>
                          <TableCell className="text-right">
                            {money(stock * Number(i.sale_price))}
                          </TableCell>
                          <TableCell className="text-right">
                            {stock <= 0 ? (
                              <Badge variant="destructive">Out of stock</Badge>
                            ) : low ? (
                              <Badge className="bg-accent text-accent-foreground">Low</Badge>
                            ) : (
                              <Badge className="bg-success text-success-foreground">In stock</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setRestockItem(i);
                                setRestockQty("");
                              }}
                            >
                              <PackagePlus className="size-4" /> Restock
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="ml-1 size-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget({ kind: "item", item: i })}
                              aria-label={`Delete ${i.name}`}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Receive payment dialog */}
      <Dialog open={!!receiveFor} onOpenChange={(o) => !o && setReceiveFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              Receive payment from {receiveFor?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Leftover outstanding: <span className="font-semibold text-foreground">{money(receiveFor?.outstanding ?? 0)}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount received (৳)</Label>
              <Input
                id="pay-amount"
                type="number"
                min="0"
                value={receiveAmount}
                onChange={(e) => setReceiveAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Input
                id="pay-note"
                value={receiveNote}
                onChange={(e) => setReceiveNote(e.target.value)}
                placeholder="e.g. cash, bKash"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => receivePayment.mutate()} disabled={receivePayment.isPending}>
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              {deleteTarget?.kind === "customer"
                ? `Delete leftover for ${deleteTarget.customer.name}?`
                : deleteTarget?.kind === "payment"
                  ? `Delete this ${money(deleteTarget.payment.amount)} payment?`
                  : `Delete ${deleteTarget?.kind === "item" ? deleteTarget.item.name : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "customer"
                ? "Their unpaid amount is written off and their payment history removed. The invoices stay in the Sales Log."
                : deleteTarget?.kind === "payment"
                  ? "The customer's leftover goes back up by this amount."
                  : "This item is removed from your stock list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                removeTarget.mutate();
              }}
              disabled={removeTarget.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restock dialog */}
      <Dialog open={!!restockItem} onOpenChange={(o) => !o && setRestockItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Restock {restockItem?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Currently {Number(restockItem?.stock ?? 0)} {restockItem?.unit} on the shelf.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="restock-qty">Units arrived</Label>
              <Input
                id="restock-qty"
                type="number"
                min="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="e.g. 50"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockItem(null)}>
              Cancel
            </Button>
            <Button onClick={() => restock.mutate()} disabled={restock.isPending}>
              Add Stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>

      {printCustomer ? (
        <div className="hidden print:block">
          <div className="print-sheet mx-auto rounded-xl border border-border bg-card p-6 shadow-md sm:p-8">
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
                <div className="font-display text-lg font-bold">Dues Statement</div>
                <div className="text-xs text-muted-foreground">{fmtDate(new Date().toISOString())}</div>
              </div>
            </div>

            <div className="grid gap-4 py-5 sm:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer
                </div>
                <div className="mt-1 font-medium">{printCustomer.name}</div>
                {printCustomer.phone ? (
                  <div className="text-sm text-muted-foreground">{printCustomer.phone}</div>
                ) : null}
              </div>
            </div>

            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Unpaid invoices
            </h4>
            {printCustomer.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">No unpaid invoices — dues cleared.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {printCustomer.sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.invoice_no ?? `EL-${String(s.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(s.created_at)}</TableCell>
                      <TableCell className="text-right font-medium text-destructive">
                        {money(s.due)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Payments received
            </h4>
            {printCustomer.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {printCustomer.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground">{fmtDate(p.created_at)}</TableCell>
                      <TableCell>{p.note ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">{money(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-xs space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total billed due</span>
                  <span>{money(printCustomer.billed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Paid back</span>
                  <span>{money(printCustomer.paidBack)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-display text-base font-bold">
                  <span>Outstanding</span>
                  <span className={printCustomer.outstanding > 0 ? "text-destructive" : ""}>
                    {money(printCustomer.outstanding)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4 text-center text-xs text-muted-foreground">
              Please settle the outstanding amount at your earliest convenience. · Thank you for
              shopping at Easy Link!
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
