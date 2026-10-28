import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set New Password — Easy Link" },
      { name: "description", content: "Choose a new password for your Easy Link staff account." },
      { property: "og:title", content: "Set New Password — Easy Link" },
      { property: "og:description", content: "Choose a new password for your Easy Link staff account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session && isRecovery) setReady(true);
      else if (s.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (password !== confirm) { toast.error("The two passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message || "Couldn't update the password. The link may have expired.");
      return;
    }
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-border/70 shadow-md">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <KeyRound className="size-6" />
            </span>
            <h1 className="font-display text-2xl font-bold">Set a new password</h1>
          </div>
          {!ready ? (
            <div className="space-y-4 text-center text-sm text-muted-foreground">
              <p>Open this page from the reset link in your email. Links expire after a while.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" required minLength={8}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" required minLength={8}
                  value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
