import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function hasAnyUser() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw new Error("Could not check accounts");
  return data.users.length > 0;
}

// Public on purpose: only works while the shop has zero accounts (first owner setup).
export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { needsOwner: !(await hasAnyUser()) };
});

export const createOwnerAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().trim().email().max(255), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    if (await hasAnyUser()) throw new Error("Owner account already exists");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
