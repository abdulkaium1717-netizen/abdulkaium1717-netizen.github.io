create table public.daily_costs (
  id bigint generated always as identity primary key,
  spent_on date not null default current_date,
  category text not null default 'Other',
  description text,
  amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_costs TO authenticated;
GRANT ALL ON public.daily_costs TO service_role;

ALTER TABLE public.daily_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signed-in staff full access" ON public.daily_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);