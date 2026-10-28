import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard" },
  { to: "/new-sale", label: "New Sale" },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales-log", label: "Sales Log" },
  { to: "/leftover", label: "Leftover" },
  { to: "/analysis", label: "Analysis" },
] as const;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = Route.useRouteContext();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="no-print sticky top-0 z-40 border-b border-primary/20 bg-primary text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-md bg-accent font-display text-lg font-bold text-accent-foreground shadow-sm">
              EL
            </span>
            <span className="font-display text-xl font-bold tracking-tight">Easy Link</span>
          </Link>
          <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-accent text-accent-foreground shadow-sm"
                      : "text-primary-foreground/80 hover:bg-primary-foreground/10 hover:text-primary-foreground")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-primary-foreground/80 transition-colors hover:bg-primary-foreground/10 hover:text-primary-foreground"
            title={user.email ?? undefined}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="no-print border-t border-border bg-card py-4 text-center text-xs text-muted-foreground">
        Easy Link · Sales · Inventory · Leftover
      </footer>
    </div>
  );
}
