import { createFileRoute } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDailyCosts } from "@/lib/server-queries";
import {
  DAILY_COST_CATEGORIES,
  money,
  todayISODate,
  type DailyCost,
} from "@/lib/shop";
import {
  KpiCard,
  PageHeader,
  Pending,
  LoadError,
  EmptyState,
} from "@/components/shop-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Banknote, CalendarDays, Trash2, Wallet } from "lucide-react";

const dailyCostsQo = queryOptions({
  queryKey: ["daily_costs"],
  queryFn: () => getDailyCosts(),
});

export const Route = createFileRoute("/_authenticated/daily-cost")({
  head: () => ({
    meta: [
      { title: "Daily Cost — Easy Link" },
      {
        name: "description",
        content: "Record cash taken from the drawer and daily expenses like food for Easy Link.",
      },
      { property: "og:title", content: "Daily Cost — Easy Link" },
      {
        property: "og:description",
        content: "Record cash taken from the drawer and daily expenses like food for Easy Link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dailyCostsQo),
  pendingComponent: Pending,
  errorComponent: ({ error }) => <LoadError error={error} />,
  notFoundComponent: () => <EmptyState title="Page not found" />,
  component: DailyCostPage,
});

function DailyCostPage() {
  const { data: costs } = useSuspenseQuery(dailyCostsQo);
  const queryClient = useQueryClient();

  const today = todayISODate();
  const [spentOn, setSpentOn] = useState(today);
  const [category, setCategory] = useState<string>(DAILY_COST_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DailyCost | null>(null);

  const totals = useMemo(() => {
    const monthPrefix = today.slice(0, 7);
    const monthCosts = costs.filter((c) => c.spent_on.startsWith(monthPrefix));
    const byCategory = new Map<string, number>();
    for (const c of monthCosts) {
      byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + Number(c.amount));
    }
    return {
      todayTotal: costs
        .filter((c) => c.spent_on === today)
        .reduce((a, c) => a + Number(c.amount), 0),
      monthTotal: monthCosts.reduce((a, c) => a + Number(c.amount), 0),
      byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [costs, today]);

  const addCost = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Enter the amount you took from cash.");
      }
      const { error } = await supabase.from("daily_costs").insert({
        spent_on: spentOn,
        category,
        description: description.trim() || null,
        amount: value,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(`${money(Number(amount))} saved as ${category}.`);
      setAmount("");
      setDescription("");
      await queryClient.invalidateQueries({ queryKey: ["daily_costs"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't save this entry."),
  });

  const removeCost = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("daily_costs").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success("Entry removed.");
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["daily_costs"] });
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Couldn't remove this entry."),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Cost"
        subtitle="Money you take from cash and what you use it for — food, bills, transport and more."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label="Taken from Cash Today"
          value={money(totals.todayTotal)}
          hint="total spent today"
          icon={<Banknote className="size-5" />}
        />
        <KpiCard
          label="This Month"
          value={money(totals.monthTotal)}
          hint={`${costs.filter((c) => c.spent_on.startsWith(today.slice(0, 7))).length} entries this month`}
          icon={<CalendarDays className="size-5" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-lg">Add Daily Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCost.mutate();
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="cost-date">Date</Label>
                  <Input
                    id="cost-date"
                    type="date"
                    value={spentOn}
                    max={today}
                    onChange={(e) => setSpentOn(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Used for</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAILY_COST_CATEGORIES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className={
                          "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors " +
                          (category === c
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground")
                        }
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cost-amount">Amount taken from cash (৳)</Label>
                  <Input
                    id="cost-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cost-note">Note (optional)</Label>
                  <Input
                    id="cost-note"
                    placeholder="Lunch, bus fare, mobile recharge…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={addCost.isPending}>
                  <Wallet className="size-4" /> Save Entry
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base">This Month by Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {totals.byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No entries yet this month.</p>
              ) : (
                totals.byCategory.map(([cat, sum]) => (
                  <div
                    key={cat}
                    className="flex items-center justify-between rounded-md border border-border/70 bg-muted/40 px-3 py-2"
                  >
                    <span className="text-sm font-medium">{cat}</span>
                    <Badge variant="secondary">{money(sum)}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 shadow-sm lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="font-display text-lg">All Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {costs.length === 0 ? (
              <EmptyState
                title="No daily costs yet"
                hint="Save your first cash entry with the form."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Used for</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costs.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          {c.spent_on}
                          {c.spent_on === today ? (
                            <Badge className="bg-success text-success-foreground">Today</Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{c.category}</TableCell>
                      <TableCell className="max-w-52 truncate text-muted-foreground">
                        {c.description || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">{money(c.amount)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                          title="Remove entry"
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

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${deleteTarget.spent_on} — ${deleteTarget.category} ${money(deleteTarget.amount)} will be deleted.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && removeCost.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
