create table public.services (
  id bigint generated always as identity primary key,
  name text not null,
  default_rate numeric(12,2) not null default 0,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table public.inventory_items (
  id bigint generated always as identity primary key,
  name text not null,
  unit text not null default 'pcs',
  stock numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  low_stock_threshold numeric(12,2) not null default 5,
  created_at timestamptz not null default now()
);
create table public.sales (
  id bigint generated always as identity primary key,
  invoice_no text,
  customer_name text,
  customer_phone text,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  due numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create table public.sale_items (
  id bigint generated always as identity primary key,
  sale_id bigint not null references public.sales(id) on delete cascade,
  kind text not null check (kind in ('service','inventory')),
  service_id bigint references public.services(id) on delete set null,
  inventory_item_id bigint references public.inventory_items(id) on delete set null,
  name text not null,
  qty numeric(12,2) not null default 1,
  rate numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0
);
create table public.customer_payments (
  id bigint generated always as identity primary key,
  customer_name text not null,
  customer_phone text,
  amount numeric(12,2) not null default 0,
  note text,
  sale_id bigint references public.sales(id) on delete set null,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.services, public.inventory_items, public.sales, public.sale_items, public.customer_payments TO authenticated;
GRANT ALL ON public.services, public.inventory_items, public.sales, public.sale_items, public.customer_payments TO service_role;

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signed-in staff full access" ON public.services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "signed-in staff full access" ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "signed-in staff full access" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "signed-in staff full access" ON public.sale_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "signed-in staff full access" ON public.customer_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

create or replace function public.set_invoice_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.invoice_no is null or NEW.invoice_no = '' then
    NEW.invoice_no := 'EL-' || lpad(NEW.id::text, 5, '0');
  end if;
  return NEW;
end; $$;
create trigger trg_set_invoice_no before insert on public.sales
for each row execute function public.set_invoice_no();

create or replace function public.adjust_stock_on_sale_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.kind = 'inventory' and NEW.inventory_item_id is not null then
    update public.inventory_items set stock = stock - NEW.qty where id = NEW.inventory_item_id;
  end if;
  return NEW;
end; $$;
create or replace function public.restore_stock_on_sale_item_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if OLD.kind = 'inventory' and OLD.inventory_item_id is not null then
    update public.inventory_items set stock = stock + OLD.qty where id = OLD.inventory_item_id;
  end if;
  return OLD;
end; $$;
create trigger trg_stock_on_insert after insert on public.sale_items
for each row execute function public.adjust_stock_on_sale_item();
create trigger trg_stock_on_delete after delete on public.sale_items
for each row execute function public.restore_stock_on_sale_item_delete();

insert into public.services (name, default_rate, sort_order) values
  ('Color Print', 10, 1),
  ('Laser Print', 5, 2),
  ('Photocopy', 2, 3),
  ('LGL Photocopy', 3, 4),
  ('Picture to Picture', 20, 5),
  ('Compose', 20, 6),
  ('Online Application', 50, 7),
  ('Stationary Items', 0, 8);