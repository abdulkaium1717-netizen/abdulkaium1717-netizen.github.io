import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getServices, getInventoryItems } from "@/lib/server-queries";
import { money, round2, type Sale, type Service, type InventoryItem } from "@/lib/shop";
import { PageHeader, Pending, LoadError, EmptyState } from "@/components/shop-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Plus, Trash2, Save, BadgePercent } from "lucide-react";

const servicesQo = queryOptions({ queryKey: ["services"], queryFn: () => getServices() });
const itemsQo = queryOptions({
  queryKey: ["inventory_items"],
  queryFn: () => getInventoryItems(),
});

export const Route = createFileRoute("/_authenticated/new-sale")({
  head: () => ({
    meta: [
      { title: "New Sale — Easy Link" },
      {
        name: "description",
        content: "Create a sales invoice for Easy Link: services, stock items, discount and dues.",
      },
      { property: "og:title", content: "New Sale — Easy Link" },
      {
        property: "og:description",
        content: "Create a sales invoice for Easy Link: services, stock items, discount and dues.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(servicesQo),
      context.queryClient.ensureQueryData(itemsQo),
    ]),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: NewSale,
});

type Line = {
  key: string;
  kind: "service" | "inventory";
  refId: number | null;
  name: string;
  unit?: string;
  stock?: number | null;
  qty: string;
  rate: string;
};

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

function NewSale() {
  const { data: services } = useSuspenseQuery(servicesQo);
  const { data: items } = useSuspenseQuery(itemsQo);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [lines, setLines] = useState<Line[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [serviceQty, setServiceQty] = useState("1");
  const [itemId, setItemId] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [discountMode, setDiscountMode] = useState<"percent" | "flat">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [paidStr, setPaidStr] = useState("");
  const [paidDirty, setPaidDirty] = useState(false);

  const subtotal = round2(
    lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0),
  );
  const rawDiscount =
    discountMode === "percent"
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : Number(discountValue) || 0;
  const discountAmount = round2(Math.min(Math.max(rawDiscount, 0), subtotal));
  const total = round2(subtotal - discountAmount);
  const paid = paidDirty ? Number(paidStr) || 0 : total;
  const due = round2(Math.max(total - paid, 0));

  useEffect(() => {
    if (!paidDirty) setPaidStr(total ? String(total) : "0");
  }, [total, paidDirty]);

  const addServiceLine = () => {
    const svc = services.find((s) => String(s.id) === serviceId);
    if (!svc) {
      toast.error("Choose a service first");
      return;
    }
    const qty = Number(serviceQty) || 0;
    if (qty <= 0) {
      toast.error("Quantity must be at least 1");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: "service",
        refId: svc.id,
        name: svc.name,
        qty: serviceQty,
        rate: String(Number(svc.default_rate)),
      },
    ]);
    setServiceId("");
    setServiceQty("1");
  };

  const addItemLine = () => {
    const item = items.find((i) => String(i.id) === itemId);
    if (!item) {
      toast.error("Choose a stock item first");
      return;
    }
    const qty = Number(itemQty) || 0;
    if (qty <= 0) {
      toast.error("Quantity must be at least 1");
      return;
    }
    if (Number(item.stock) <= 0) {
      toast.error(`${item.name} is out of stock`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: newKey(),
        kind: "inventory",
        refId: item.id,
        name: item.name,
        unit: item.unit,
        stock: Number(item.stock),
        qty: itemQty,
        rate: String(Number(item.sale_price)),
      },
    ]);
    setItemId("");
    setItemQty("1");
  };

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const removeLine = (key: string) =>
    setLines((prev) => prev.filter((l) => l.key !== key));

  const saveSale = useMutation({
    mutationFn: async () => {
      if (lines.length === 0)
        throw new Error("Add at least one service or item to the invoice");
      for (const l of lines) {
        if ((Number(l.qty) || 0) <= 0)
          throw new Error(`Quantity must be at least 1 for ${l.name}`);
        if ((Number(l.rate) || 0) < 0)
          throw new Error(`Rate cannot be negative for ${l.name}`);
        if (l.kind === "inventory" && l.stock != null && Number(l.qty) > l.stock)
          throw new Error(
            `Only ${l.stock} ${l.unit ?? "pcs"} of ${l.name} left in stock`,
          );
      }
      if (due > 0 && !customerName.trim())
        throw new Error(
          "Customer name is needed when part of the bill is due (leftover)",
        );
      const payload = {
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        subtotal,
        discount_amount: discountAmount,
        total,
        paid,
        due,
        notes: notes.trim() || null,
      };
      const { data: sale, error } = await supabase
        .from("sales")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      const rows = lines.map((l) => ({
        sale_id: sale.id,
        kind: l.kind,
        service_id: l.kind === "service" ? l.refId : null,
        inventory_item_id: l.kind === "inventory" ? l.refId : null,
        name: l.name,
        qty: Number(l.qty) || 0,
        rate: Number(l.rate) || 0,
        amount: round2((Number(l.qty) || 0) * (Number(l.rate) || 0)),
      }));
      const { error: itemsError } = await supabase.from("sale_items").insert(rows);
      if (itemsError) throw new Error(itemsError.message);
      return sale as Sale;
    },
    onSuccess: async (sale) => {
      await queryClient.invalidateQueries({ queryKey: ["sales"] });
      await queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success(`Invoice ${sale.invoice_no ?? sale.id} saved`);
      await navigate({
        to: "/invoice/$id",
        params: { id: String(sale.id) },
        search: { print: true },
      });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save the invoice"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Sale"
        subtitle="Build an invoice from services and stock items."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Add to Invoice</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_96px_auto]">
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Service — Color Print, Photocopy…" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((s: Service) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name} · {money(s.default_rate)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={serviceQty}
                  onChange={(e) => setServiceQty(e.target.value)}
                  placeholder="Qty"
                />
                <Button onClick={addServiceLine}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_96px_auto]">
                <Select value={itemId} onValueChange={setItemId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Stock item — pens, paper…" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i: InventoryItem) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.name} · {money(i.sale_price)} ({Number(i.stock)} {i.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  placeholder="Qty"
                />
                <Button variant="secondary" onClick={addItemLine}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Missing something? Add shop items in Inventory first.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Invoice Lines</CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <EmptyState
                  title="No items added yet"
                  hint="Pick a service or stock item above and press Add."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-24">Qty</TableHead>
                      <TableHead className="w-28">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.key}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{l.name}</span>
                            <Badge
                              variant={l.kind === "service" ? "secondary" : "outline"}
                              className="text-[10px]"
                            >
                              {l.kind === "service" ? "Service" : "Stock"}
                            </Badge>
                          </div>
                          {l.kind === "inventory" && l.stock != null ? (
                            <div className="text-xs text-muted-foreground">
                              {l.stock} {l.unit ?? "pcs"} in stock
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            className="h-8"
                            value={l.qty}
                            onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            className="h-8"
                            value={l.rate}
                            onChange={(e) => updateLine(l.key, { rate: e.target.value })}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {money((Number(l.qty) || 0) * (Number(l.rate) || 0))}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => removeLine(l.key)}
                            aria-label={`Remove ${l.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">
                Customer (optional)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-name">Name</Label>
                <Input
                  id="cust-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahim Uddin"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input
                  id="cust-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-notes">Notes</Label>
                <Input
                  id="cust-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything to remember"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty for a walk-in. Required only if some amount stays due.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-lg">Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{money(subtotal)}</span>
              </div>
              <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <BadgePercent className="size-4" /> Discount (auto)
                  </span>
                  <div className="flex overflow-hidden rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => setDiscountMode("percent")}
                      className={
                        "px-2 py-1 text-xs font-medium transition-colors " +
                        (discountMode === "percent"
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent hover:bg-muted")
                      }
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountMode("flat")}
                      className={
                        "px-2 py-1 text-xs font-medium transition-colors " +
                        (discountMode === "flat"
                          ? "bg-primary text-primary-foreground"
                          : "bg-transparent hover:bg-muted")
                      }
                    >
                      ৳
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountMode === "percent" ? "Discount %" : "Discount ৳"}
                    className="h-8"
                  />
                  <span className="whitespace-nowrap text-sm font-medium text-destructive">
                    − {money(discountAmount)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between border-t border-border pt-3 font-display text-lg font-bold">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="paid">Paid now</Label>
                <Input
                  id="paid"
                  type="number"
                  min="0"
                  value={paidStr}
                  onChange={(e) => {
                    setPaidDirty(true);
                    setPaidStr(e.target.value);
                  }}
                />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Due (leftover)</span>
                <span
                  className={
                    "font-semibold " + (due > 0 ? "text-destructive" : "text-success")
                  }
                >
                  {money(due)}
                </span>
              </div>
              {due > 0 ? (
                <p className="text-xs text-muted-foreground">
                  This due is added to the customer's leftover record.
                </p>
              ) : null}
              <Button
                className="w-full"
                size="lg"
                onClick={() => saveSale.mutate()}
                disabled={saveSale.isPending}
              >
                <Save className="size-4" />
                {saveSale.isPending ? "Saving…" : "Save Invoice"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
