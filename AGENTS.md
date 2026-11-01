<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
## Project rules
- All shop pages live under `src/routes/_authenticated/`; data reads use `requireSupabaseAuth` server functions — the shop is staff-only, public sign-up is disabled.
- A sale's leftover status is derived by `computeSaleDueStatus` (customer payments applied oldest-invoice-first); never mutate `sales.paid/due` when receiving payments, so all pages share one source of truth.
- Percentage discounts are hard-capped at `MAX_PERCENT_DISCOUNT` (2.5%); money (৳) discounts have no cap. Keep both behaviors in `clampPercentDiscount`/New Sale.
- Service supplies (`service_supplies`) are deducted automatically by database triggers when a service line is sold and restored on deletion; they are never invoice lines and never billed to the customer.
- Customer returns restore stock via `customer_return_items` triggers and refund money is subtracted in Dashboard "Cash In Hand" and Analysis "Collected" — keep every money flow (paid now, dues received, refunds, daily costs) in those two calculations.
