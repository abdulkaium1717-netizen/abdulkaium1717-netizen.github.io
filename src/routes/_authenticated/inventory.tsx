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
  getServices,
  getInventoryItems,
  getServiceSupplies,
} from "@/lib/server-queries";
import {
  money,
  INVENTORY_CATEGORIES,
  type Service,
  type InventoryItem,
  type ServiceSupply,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Trash2, Link2 } from "lucide-react";

const itemsQo = queryOptions({
  queryKey: ["inventory_items"],
  queryFn: () => getInventoryItems(),
});
const servicesQo = queryOptions({ queryKey: ["services"], queryFn: () => getServices() });
const suppliesQo = queryOptions({
  queryKey: ["service_supplies"],
  queryFn: () => getServiceSupplies(),
});

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Easy Link" },
      {
        name: "description",
        content: "Manage Easy Link stock items and service rates.",
      },
      { property: "og:title", content: "Inventory — Easy Link" },
      {
        property: "og:description",
        content: "Manage Easy Link stock items and service rates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(itemsQo),
      context.queryClient.ensureQueryData(servicesQo),
      context.queryClient.ensureQueryData(suppliesQo),
    ]),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: InventoryPage,
});

type ItemForm = {
  name: string;
  category: string;
  customCategory: string;
  unit: string;
  stock: string;
  sale_price: string;
  low_stock_threshold: string;
};

const emptyItemForm: ItemForm = {
  name: "",
  category: "Other",
  customCategory: "",
  unit: "pcs",
  stock: "0",
  sale_price: "0",
  low_stock_threshold: "5",
};

type ServiceForm = { name: string; default_rate: string };

const emptyServiceForm: ServiceForm = { name: "", default_rate: "0" };

type SupplyRow = { key: string; inventory_item_id: string; qty_per_unit: string };

function InventoryPage() {
  const { data: items } = useSuspenseQuery(itemsQo);
  const { data: services } = useSuspenseQuery(servicesQo);
  const { data: supplies } = useSuspenseQuery(suppliesQo);
  const queryClient = useQueryClient();

  const [itemDialog, setItemDialog] = useState<{
    open: boolean;
    editing: InventoryItem | null;
    form: ItemForm;
  }>({ open: false, editing: null, form: emptyItemForm });
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);

  const [serviceDialog, setServiceDialog] = useState<{
    open: boolean;
    editing: Service | null;
    form: ServiceForm;
  }>({ open: false, editing: null, form: emptyServiceForm });
  const [deleteService, setDeleteService] = useState<Service | null>(null);

  const [suppliesDialog, setSuppliesDialog] = useState<{
    open: boolean;
    service: Service | null;
    rows: SupplyRow[];
  }>({ open: false, service: null, rows: [] });

  const saveItem = useMutation({
    mutationFn: async () => {
      const f = itemDialog.form;
      if (!f.name.trim()) throw new Error("Item name is required");
      const category =
        f.category === "Other" && f.customCategory.trim()
          ? f.customCategory.trim()
          : f.category;
      const values = {
        name: f.name.trim(),
        category,
        unit: f.unit.trim() || "pcs",
        stock: Number(f.stock) || 0,
        sale_price: Number(f.sale_price) || 0,
        low_stock_threshold: Number(f.low_stock_threshold) || 0,
      };
      if (itemDialog.editing) {
        const { error } = await supabase
          .from("inventory_items")
          .update(values)
          .eq("id", itemDialog.editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("inventory_items").insert(values);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success(itemDialog.editing ? "Item updated" : "Item added to inventory");
      setItemDialog({ open: false, editing: null, form: emptyItemForm });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save the item"),
  });

  const saveSupplies = useMutation({
    mutationFn: async () => {
      const service = suppliesDialog.service;
      if (!service) throw new Error("Nothing selected");
      const rows = suppliesDialog.rows
        .filter((r) => r.inventory_item_id)
        .map((r) => ({
          service_id: service.id,
          inventory_item_id: Number(r.inventory_item_id),
          qty_per_unit: Number(r.qty_per_unit) || 1,
        }));
      const seen = new Set<number>();
      for (const r of rows) {
        if (seen.has(r.inventory_item_id))
          throw new Error("Each stock item can be listed only once per service");
        seen.add(r.inventory_item_id);
        if (r.qty_per_unit <= 0)
          throw new Error("Quantity used per service must be at least 1");
      }
      const { error: delError } = await supabase
        .from("service_supplies")
        .delete()
        .eq("service_id", service.id);
      if (delError) throw new Error(delError.message);
      if (rows.length) {
        const { error } = await supabase.from("service_supplies").insert(rows);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["service_supplies"] });
      toast.success("Service supplies saved");
      setSuppliesDialog({ open: false, service: null, rows: [] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save the supplies"),
  });

  const removeItem = useMutation({
    mutationFn: async () => {
      if (!deleteItem) throw new Error("Nothing selected");
      const { error } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", deleteItem.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["inventory_items"] });
      toast.success("Item deleted");
      setDeleteItem(null);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not delete the item"),
  });

  const saveService = useMutation({
    mutationFn: async () => {
      const f = serviceDialog.form;
      if (!f.name.trim()) throw new Error("Service name is required");
      const values = { name: f.name.trim(), default_rate: Number(f.default_rate) || 0 };
      if (serviceDialog.editing) {
        const { error } = await supabase
          .from("services")
          .update(values)
          .eq("id", serviceDialog.editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("services")
          .insert({ ...values, sort_order: services.length + 1 });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success(serviceDialog.editing ? "Service updated" : "Service added");
      setServiceDialog({ open: false, editing: null, form: emptyServiceForm });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save the service"),
  });

  const removeService = useMutation({
    mutationFn: async () => {
      if (!deleteService) throw new Error("Nothing selected");
      const { error } = await supabase
        .from("services")
        .delete()
        .eq("id", deleteService.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["services"] });
      toast.success("Service deleted");
      setDeleteService(null);
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not delete the service"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="Your shop items and service rates."
      />

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Stock Items</TabsTrigger>
          <TabsTrigger value="services">Service Rates</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="pt-6">
              <div className="mb-4 flex justify-end">
                <Button
                  onClick={() =>
                    setItemDialog({ open: true, editing: null, form: emptyItemForm })
                  }
                >
                  <Plus className="size-4" /> Add Item
                </Button>
              </div>
              {items.length === 0 ? (
                <EmptyState
                  title="No items in inventory yet"
                  hint="Add your first shop item — pens, paper, ink, anything you sell."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Sale Price</TableHead>
                      <TableHead className="text-right">Alert Below</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => {
                      const stock = Number(i.stock);
                      const low = stock <= Number(i.low_stock_threshold);
                      return (
                        <TableRow key={i.id}>
                          <TableCell>
                            <div className="font-medium">{i.name}</div>
                            <div className="text-xs text-muted-foreground">{i.unit}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {i.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{stock}</TableCell>
                          <TableCell className="text-right">{money(i.sale_price)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {Number(i.low_stock_threshold)}
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
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() =>
                                  setItemDialog({
                                    open: true,
                                    editing: i,
                                    form: {
                                      name: i.name,
                                      category: i.category,
                                      customCategory: "",
                                      unit: i.unit,
                                      stock: String(Number(i.stock)),
                                      sale_price: String(Number(i.sale_price)),
                                      low_stock_threshold: String(
                                        Number(i.low_stock_threshold),
                                      ),
                                    },
                                  })
                                }
                                aria-label={`Edit ${i.name}`}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-destructive"
                                onClick={() => setDeleteItem(i)}
                                aria-label={`Delete ${i.name}`}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
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

        <TabsContent value="services" className="mt-4">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="pt-6">
              <div className="mb-4 flex justify-end">
                <Button
                  onClick={() =>
                    setServiceDialog({
                      open: true,
                      editing: null,
                      form: emptyServiceForm,
                    })
                  }
                >
                  <Plus className="size-4" /> Add Service
                </Button>
              </div>
              <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead className="text-right">Default Rate</TableHead>
                      <TableHead>Stock used automatically</TableHead>
                      <TableHead className="w-32 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services.map((s) => {
                      const used = supplies.filter(
                        (sp: ServiceSupply) => sp.service_id === s.id,
                      );
                      const usedLabel =
                        used.length === 0
                          ? "—"
                          : used
                              .map((sp) => {
                                const it = items.find((i) => i.id === sp.inventory_item_id);
                                return `${Number(sp.qty_per_unit)} ${it?.name ?? "?"}`;
                              })
                              .join(", ");
                      return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{money(s.default_rate)}</TableCell>
                      <TableCell className="max-w-64 truncate text-sm text-muted-foreground">
                        {usedLabel}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() =>
                              setSuppliesDialog({
                                open: true,
                                service: s,
                                rows: used.map((sp) => ({
                                  key: String(sp.id),
                                  inventory_item_id: String(sp.inventory_item_id),
                                  qty_per_unit: String(Number(sp.qty_per_unit)),
                                })),
                              })
                            }
                            aria-label={`Supplies used by ${s.name}`}
                            title="Stock used automatically"
                          >
                            <Link2 className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() =>
                              setServiceDialog({
                                open: true,
                                editing: s,
                                form: {
                                  name: s.name,
                                  default_rate: String(Number(s.default_rate)),
                                },
                              })
                            }
                            aria-label={`Edit ${s.name}`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() => setDeleteService(s)}
                            aria-label={`Delete ${s.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                         </div>
                      </TableCell>
                    </TableRow>
                      );
                    })}
                  </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Item add/edit dialog */}
      <Dialog
        open={itemDialog.open}
        onOpenChange={(open) =>
          setItemDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {itemDialog.editing ? "Edit Item" : "Add Item"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-name">Item name</Label>
              <Input
                id="item-name"
                value={itemDialog.form.name}
                onChange={(e) =>
                  setItemDialog((prev) => ({
                    ...prev,
                    form: { ...prev.form, name: e.target.value },
                  }))
                }
                placeholder="e.g. A4 Paper Ream"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {INVENTORY_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() =>
                      setItemDialog((prev) => ({
                        ...prev,
                        form: { ...prev.form, category: c },
                      }))
                    }
                    className={
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                      (itemDialog.form.category === c
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
              {itemDialog.form.category === "Other" ? (
                <Input
                  value={itemDialog.form.customCategory}
                  onChange={(e) =>
                    setItemDialog((prev) => ({
                      ...prev,
                      form: { ...prev.form, customCategory: e.target.value },
                    }))
                  }
                  placeholder="Or type your own category…"
                />
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-unit">Unit</Label>
                <Input
                  id="item-unit"
                  value={itemDialog.form.unit}
                  onChange={(e) =>
                    setItemDialog((prev) => ({
                      ...prev,
                      form: { ...prev.form, unit: e.target.value },
                    }))
                  }
                  placeholder="pcs, box, ream…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-stock">Stock quantity</Label>
                <Input
                  id="item-stock"
                  type="number"
                  min="0"
                  value={itemDialog.form.stock}
                  onChange={(e) =>
                    setItemDialog((prev) => ({
                      ...prev,
                      form: { ...prev.form, stock: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-price">Sale price (৳)</Label>
                <Input
                  id="item-price"
                  type="number"
                  min="0"
                  value={itemDialog.form.sale_price}
                  onChange={(e) =>
                    setItemDialog((prev) => ({
                      ...prev,
                      form: { ...prev.form, sale_price: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-low">Alert below</Label>
                <Input
                  id="item-low"
                  type="number"
                  min="0"
                  value={itemDialog.form.low_stock_threshold}
                  onChange={(e) =>
                    setItemDialog((prev) => ({
                      ...prev,
                      form: { ...prev.form, low_stock_threshold: e.target.value },
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setItemDialog({ open: false, editing: null, form: emptyItemForm })}
            >
              Cancel
            </Button>
            <Button onClick={() => saveItem.mutate()} disabled={saveItem.isPending}>
              {itemDialog.editing ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service add/edit dialog */}
      <Dialog
        open={serviceDialog.open}
        onOpenChange={(open) => setServiceDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              {serviceDialog.editing ? "Edit Service" : "Add Service"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-name">Service name</Label>
              <Input
                id="svc-name"
                value={serviceDialog.form.name}
                onChange={(e) =>
                  setServiceDialog((prev) => ({
                    ...prev,
                    form: { ...prev.form, name: e.target.value },
                  }))
                }
                placeholder="e.g. Lamination"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-rate">Default rate (৳)</Label>
              <Input
                id="svc-rate"
                type="number"
                min="0"
                value={serviceDialog.form.default_rate}
                onChange={(e) =>
                  setServiceDialog((prev) => ({
                    ...prev,
                    form: { ...prev.form, default_rate: e.target.value },
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setServiceDialog({ open: false, editing: null, form: emptyServiceForm })
              }
            >
              Cancel
            </Button>
            <Button onClick={() => saveService.mutate()} disabled={saveService.isPending}>
              {serviceDialog.editing ? "Save Changes" : "Add Service"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service supplies dialog */}
      <Dialog
        open={suppliesDialog.open}
        onOpenChange={(open) => setSuppliesDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">
              Stock used by “{suppliesDialog.service?.name}”
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Every time this service is sold, the listed stock is deducted
            automatically — you never add these lines to the invoice. The
            customer is not charged for them.
          </p>
          <div className="space-y-2">
            {suppliesDialog.rows.map((r, idx) => (
              <div key={r.key} className="grid grid-cols-[1fr_96px_auto] items-center gap-2">
                <Select
                  value={r.inventory_item_id}
                  onValueChange={(v) =>
                    setSuppliesDialog((prev) => ({
                      ...prev,
                      rows: prev.rows.map((row, i) =>
                        i === idx ? { ...row, inventory_item_id: v } : row,
                      ),
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Stock item — paper, ink…" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.name} ({Number(i.stock)} {i.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={r.qty_per_unit}
                  onChange={(e) =>
                    setSuppliesDialog((prev) => ({
                      ...prev,
                      rows: prev.rows.map((row, i) =>
                        i === idx ? { ...row, qty_per_unit: e.target.value } : row,
                      ),
                    }))
                  }
                  placeholder="Qty"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  onClick={() =>
                    setSuppliesDialog((prev) => ({
                      ...prev,
                      rows: prev.rows.filter((_, i) => i !== idx),
                    }))
                  }
                  aria-label="Remove this supply"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSuppliesDialog((prev) => ({
                  ...prev,
                  rows: [
                    ...prev.rows,
                    {
                      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                      inventory_item_id: "",
                      qty_per_unit: "1",
                    },
                  ],
                }))
              }
            >
              <Plus className="size-4" /> Add supply
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSuppliesDialog({ open: false, service: null, rows: [] })}
            >
              Cancel
            </Button>
            <Button onClick={() => saveSupplies.mutate()} disabled={saveSupplies.isPending}>
              Save Supplies
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmations */}
      <AlertDialog open={!!deleteItem} onOpenChange={(o) => !o && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteItem?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Old invoices keep their records, but this item disappears from your
              inventory list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => removeItem.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteService} onOpenChange={(o) => !o && setDeleteService(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteService?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The service disappears from the New Sale list. Old invoices are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => removeService.mutate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
