import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getSales,
  getSaleItems,
  getInventoryItems,
  getReturns,
} from "@/lib/server-queries";
import { money, fmtDateTime, round2, type Sale, type SaleItem, type InventoryItem, type CustomerReturn } from "@/lib/shop";
import { PageHeader, Pending, LoadError, EmptyState } from "@/components/shop-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Save } from "lucide-react";

const salesQo = queryOptions({ queryKey: ["sales"], queryFn: () => getSales() });
const saleItemsQo = queryOptions({
  queryKey: ["sale_items"],
  queryFn: () => getSaleItems(),
});
const itemsQo = queryOptions({
  queryKey: ["inventory_items"],
  queryFn: () => getInventoryItems(),
});
const returnsQo = queryOptions({ queryKey: ["customer_returns"], queryFn: () => getReturns() });

export const Route = createFileRoute("/_authenticated/customer-return")({
  head: () => ({
    meta: [
      { title: "Customer Return — Easy Link" },
      {
        name: "description",
        content: "Record goods a customer returned: stock goes back on the shelf and money is refunded.",
      },
      { property: "og:title", content: "Customer Return — Easy Link" },
      {
        property: "og:description",
        content: "Record goods a customer returned: stock goes back on the shelf and money is refunded.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(salesQo),
      context.queryClient.ensureQueryData(saleItemsQo),
      context.queryClient.ensureQueryData(itemsQo),
      context.queryClient.ensureQueryData(returnsQo),
    ]),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: CustomerReturnPage,
});

type ReturnLine = {
  key: string;
  saleItemId: number;
  inventoryItemId: number | null;
  name: string;
  unit: string;
  soldQty: number;
  rate: number;
  returnQty: string;
};

function CustomerReturnPage() {
  const { data: sales } = useSuspenseQuery(salesQo);
  const { data: saleItems } = useSuspenseQuery(saleItemsQo);
  const { data: items } = useSuspenseQuery(itemsQo);
  const { data: returns } = useSuspenseQuery(returnsQo);
  const queryClient = useQueryClient();

  const [saleId, setSaleId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [refundStr, setRefundStr] = useState("");
  const [refundDirty, setRefundDirty] = useState(false);
  const [note, setNote] = useState("");

  const computedRefund = round2(
    lines.reduce((a, l) => a + (Number(l.returnQty) || 0) * l.rate, 0),
  );
  const refund = refundDirty ? Number(refundStr) || 0 : computedRefund;

  const pickSale = (value: string) => {
    setSaleId(value);
    setRefundDirty(false);
    if (!value) {
      setLines([]);
      setCustomerName("");
      setCustomerPhone("");
      return;
    }
    const sale = sales.find((s) => String(s.id) === value);
    if (!sale) return;
    setCustomerName(sale.customer_name ?? "");
    setCustomerPhone(sale.customer_phone ?? "");
    const rows = saleItems.filter(
      (i) => i.sale_id === sale.id && i.kind === "inventory" && i.inventory_item_id,
    );
    setLines(
      rows.map((i: SaleItem) => ({
        key: String(i.id),
        saleItemId: i.id,
        inventoryItemId: i.inventory_item_id,
        name: i.name,
        unit: items.find((x: InventoryItem) => x.id === i.inventory_item_id)?.unit ?? "pcs",
        soldQty: Number(i.qty),
        rate: Number(i.rate),
        returnQty: "",
      })),
    );
  };

  const saveReturn = useMutation({
    mutationFn: async () => {
      const returned = lines.filter((l) => (Number(l.returnQty) || 0) > 0);
      if (returned.length === 0)
        throw new Error("Enter the quantity being returned on at least one item");
      for (const l of returned) {
        if (Number(l.returnQty) > l.soldQty)
          throw new Error(`Cannot return more than the ${l.soldQty} ${l.unit} sold of ${l.name}`);
      }
      if (refund < 0) throw new Error("Refund cannot be negative");
      const sale = saleId ? sales.find((s) => String(s.id) === saleId) : null;
      const { data: ret, error } = await supabase
        .from("customer_returns")
        .insert({
          sale_id: sale?.id ?? null,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          amount: round2(refund),
          note: note.trim() || null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      const rows = returned.map((l) => ({
        return_id: ret.id,
        inventory_item_id: l.inventoryItemId,
        name: l.name,
        qty: Number(l.returnQty),
        rate: l.rate,
        amount: round2(Number(l.returnQty) * l.rate),
      }));
      const { error: itemsError } = await supabase
        .from("customer_return_items")
        .insert(rows);
      if (itemsError) throw new Error(itemsError.message);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customer_returns"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory_items"] }),
      ]);
      toast.success("Return saved — stock is back on the shelf");
      setSaleId("");
      setCustomerName("");
      setCustomerPhone("");
      setLines([]);
      setRefundStr("");
      setRefundDirty(false);
      setNote("");
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save the return"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Return"
        subtitle="Goods come back to the shelf and the money goes back to the customer."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/70 shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">New Return</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Original invoice (optional)</Label>
              <Select value={saleId} onValueChange={pickSale}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick the invoice the items came from…" />
                </SelectTrigger>
                <SelectContent>
                  {sales.map((s: Sale) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.invoice_no ?? `EL-${String(s.id).padStart(5, "0")}`} ·{" "}
                      {s.customer_name || "Walk-in"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pick an invoice to pull up what was sold, or leave empty for a return without one.
              </p>
            </div>

            {lines.length === 0 ? (
              <EmptyState
                title="No items to return yet"
                hint="Choose the original invoice above to list what was sold."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-28 text-right">Sold</TableHead>
                    <TableHead className="w-32">Return qty</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {l.soldQty} {l.unit}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={l.soldQty}
                          className="h-8"
                          value={l.returnQty}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((x) =>
                                x.key === l.key ? { ...x, returnQty: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {money((Number(l.returnQty) || 0) * l.rate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Customer & Refund</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ret-name">Customer name</Label>
                <Input
                  id="ret-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahim Uddin"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-phone">Phone</Label>
                <Input
                  id="ret-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-refund">Money refunded (৳)</Label>
                <Input
                  id="ret-refund"
                  type="number"
                  min="0"
                  value={refundDirty ? refundStr : String(computedRefund)}
                  onChange={(e) => {
                    setRefundDirty(true);
                    setRefundStr(e.target.value);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Filled from the returned items — adjust if you refunded a different amount.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-note">Note (optional)</Label>
                <Input
                  id="ret-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for the return…"
                />
              </div>
              <div className="flex justify-between border-t border-border pt-3 font-display text-lg font-bold">
                <span>Refund</span>
                <span className="text-destructive">{money(refund)}</span>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={() => saveReturn.mutate()}
                disabled={saveReturn.isPending}
              >
                <Save className="size-4" />
                {saveReturn.isPending ? "Saving…" : "Save Return"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Saving adds the items back to stock automatically and records the refund in
                today's cash calculations.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Return History</CardTitle>
        </CardHeader>
        <CardContent>
          {returns.length === 0 ? (
            <EmptyState
              title="No returns recorded"
              hint="When a customer brings something back, record it here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r: CustomerReturn) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {fmtDateTime(r.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.customer_name || "Walk-in"}
                      {r.sale_id ? (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          invoice #{r.sale_id}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-52 truncate text-muted-foreground">
                      {r.note || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium text-destructive">
                      − {money(r.amount)}
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
