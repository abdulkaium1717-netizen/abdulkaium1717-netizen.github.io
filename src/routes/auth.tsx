import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOwnerAccount, getSetupStatus } from "@/lib/setup.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Staff Sign In — Easy Link" },
      { name: "description", content: "Authorized staff sign in to the Easy Link shop manager." },
      { property: "og:title", content: "Staff Sign In — Easy Link" },
      {
        property: "og:description",
        content: "Authorized staff sign in to the Easy Link shop manager.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error("Couldn't send the reset email. Please try again in a minute.");
      return;
    }
    toast.success("If this email belongs to a staff account, a reset link is on its way.");
    setMode("signin");
  }

  const [needsOwner, setNeedsOwner] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
    getSetupStatus()
      .then((s) => setNeedsOwner(s.needsOwner))
      .catch(() => {});
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (needsOwner) {
      if (password.length < 8) {
        setBusy(false);
        toast.error("Password must be at least 8 characters.");
        return;
      }
      try {
        await createOwnerAccount({ data: { email: email.trim(), password } });
      } catch (err) {
        setBusy(false);
        toast.error(err instanceof Error ? err.message : "Couldn't create the account.");
        return;
      }
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error(
        needsOwner
          ? "That password was rejected (it may be a known leaked password). Try a stronger one."
          : "Wrong email or password, or this account is not authorized.",
      );
      return;
    }
    navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border/70 shadow-md">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-md bg-primary font-display text-xl font-bold text-primary-foreground">
              EL
            </span>
            <h1 className="font-display text-2xl font-bold">Easy Link</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <LockKeyhole className="size-4" /> Authorized staff only
            </p>
          </div>
          {mode === "forgot" ? (
            <form onSubmit={onForgot} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enter your staff email and we'll send you a link to set a new password.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </button>
            </form>
          ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {needsOwner && (
              <p className="rounded-md bg-accent/30 p-3 text-sm">
                First-time setup: choose the owner email and password (min 8 characters). This works only once.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete={needsOwner ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : needsOwner ? "Create owner account" : "Sign in"}
            </Button>
          </form>
          )}
          <p className="text-center text-xs text-muted-foreground">
            No public sign-up. Ask the shop owner to add your account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
