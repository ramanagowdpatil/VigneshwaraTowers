-- Per-floor charges (e.g. water) that are entered separately for each floor
-- rather than split by rental area.
create table public.floor_charges (
  id serial primary key,
  unit_id int not null references public.units (id) on delete cascade,
  period date not null,               -- first day of the month
  category charge_category not null default 'water',
  amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  unique (unit_id, period, category)
);

alter table public.floor_charges enable row level security;

create policy "floor_charges_select" on public.floor_charges for select
  using (auth.uid() is not null);
create policy "floor_charges_admin" on public.floor_charges for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
