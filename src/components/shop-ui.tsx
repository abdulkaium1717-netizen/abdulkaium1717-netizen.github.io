import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money, type SaleDueStatus } from "@/lib/shop";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
}) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="truncate font-display text-xl font-bold text-foreground">
            {value}
          </div>
          {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function Pending() {
  return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
}

export function LoadError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <div className="py-16 text-center">
      <p className="font-medium text-foreground">This page didn't load</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
      <Button className="mt-4" variant="outline" onClick={() => router.invalidate()}>
        Try again
      </Button>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-10 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Due / Paid / Cleared status for one invoice, after leftover payments. */
export function DueBadge({
  due,
  status,
}: {
  due: number | string;
  status?: SaleDueStatus | undefined;
}) {
  const original = Number(due);
  if (original <= 0) {
    return <Badge className="bg-success text-success-foreground">Paid</Badge>;
  }
  if (status?.cleared) {
    return (
      <Badge className="bg-success text-success-foreground" title={`Leftover ${money(original)} paid back`}>
        Leftover cleared
      </Badge>
    );
  }
  if (status && status.recovered > 0) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <Badge variant="destructive">{money(status.remaining)}</Badge>
        <span className="text-[11px] text-success">{money(status.recovered)} paid back</span>
      </span>
    );
  }
  return <Badge variant="destructive">{money(original)}</Badge>;
}
