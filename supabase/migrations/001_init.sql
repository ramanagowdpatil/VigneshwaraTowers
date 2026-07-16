-- ============================================================
-- Vigneshwara Towers — Building Management Schema
-- Run this in the Supabase SQL Editor (or via supabase db push)
-- ============================================================

-- ---------- Roles & Profiles ----------
create type user_role as enum ('admin', 'editor', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up / is invited
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: current user's role (security definer avoids RLS recursion)
create or replace function public.my_role()
returns user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---------- Units (floors) ----------
create table public.units (
  id serial primary key,
  code text unique not null,          -- GF, FF, SFF, SFB, TF, TERR
  name text not null,
  area_sqft numeric not null default 0,  -- used for area-based cost allocation
  sort_order int not null default 0
);

-- ---------- Tenants ----------
create table public.tenants (
  id serial primary key,
  name text not null,
  contact_name text,
  phone text,
  email text,
  gstin text,
  is_owner_occupied boolean not null default false, -- true = no rent tracking (e.g. Anugiri Dental)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tenant_units (
  tenant_id int not null references public.tenants (id) on delete cascade,
  unit_id int not null references public.units (id) on delete cascade,
  primary key (tenant_id, unit_id)
);

-- ---------- Leases (advance, rent, start/end) ----------
create table public.leases (
  id serial primary key,
  tenant_id int not null references public.tenants (id) on delete cascade,
  monthly_rent numeric not null default 0,
  advance_amount numeric not null default 0,
  advance_paid_date date,
  start_date date not null,
  end_date date,
  gst_percent numeric not null default 18,   -- GST applied on rent invoice
  tds_percent numeric not null default 10,   -- TDS deducted by tenant
  maintenance_percent numeric not null default 5, -- monthly maintenance = % of rent
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Monthly rent tracking ----------
create table public.rent_payments (
  id serial primary key,
  lease_id int not null references public.leases (id) on delete cascade,
  period date not null,               -- first day of the month
  rent_claimed numeric not null default 0,
  claim_date date,
  gst_amount numeric not null default 0,
  tds_amount numeric not null default 0,
  amount_received numeric not null default 0,
  payment_mode text,                  -- NEFT / UPI / Cheque / Cash
  received_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (lease_id, period)
);

-- ---------- Meters & daily readings ----------
create type meter_kind as enum ('electric', 'water', 'dg');

create table public.meters (
  id serial primary key,
  code text unique not null,          -- GF, FF, SF1, SF2, TF, COMMON, BWSSB, WATER_INT, DG
  name text not null,
  kind meter_kind not null,
  unit_id int references public.units (id),  -- null for common/building meters
  sort_order int not null default 0
);

create table public.meter_readings (
  id serial primary key,
  meter_id int not null references public.meters (id) on delete cascade,
  reading_date date not null,
  reading numeric not null,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (meter_id, reading_date)
);

-- ---------- Electricity bills (per meter, monthly) ----------
create table public.electricity_bills (
  id serial primary key,
  meter_id int not null references public.meters (id) on delete cascade,
  period date not null,               -- first day of the month
  fixed_kw numeric not null default 0,
  fixed_rate numeric not null default 0,       -- Rs per KW
  energy_kwh numeric not null default 0,
  energy_rate numeric not null default 0,      -- Rs per KWh
  fca_kwh numeric not null default 0,
  fca_rate numeric not null default 0,         -- Fuel Cost Adjustment, Rs per KWh
  tax_amount numeric not null default 0,
  png_surcharge numeric not null default 0,    -- P&G surcharge
  total_amount numeric generated always as (
    (fixed_kw * fixed_rate) + (energy_kwh * energy_rate)
    + (fca_kwh * fca_rate) + tax_amount + png_surcharge
  ) stored,
  due_date date,
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (meter_id, period)
);

-- ---------- Other monthly charges, split by rental area ----------
-- water = internal water supply, bwssb = BWSSB bill, security = guard salary
create type charge_category as enum ('water', 'bwssb', 'security', 'other');

create table public.monthly_charges (
  id serial primary key,
  category charge_category not null,
  period date not null,               -- first day of the month
  amount numeric not null default 0,
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  unique (category, period)
);

-- ---------- Generator (DG) usage ----------
create table public.dg_usage (
  id serial primary key,
  period date not null unique,        -- first day of the month
  hours_used numeric not null default 0,
  diesel_litres numeric not null default 0,
  diesel_price_per_litre numeric not null default 0,
  maintenance_cost numeric not null default 0,
  total_cost numeric generated always as (
    (diesel_litres * diesel_price_per_litre) + maintenance_cost
  ) stored,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
--   viewer : read everything
--   editor : read everything + enter/update daily meter readings
--   admin  : full access
-- ============================================================
alter table public.profiles enable row level security;
alter table public.units enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_units enable row level security;
alter table public.leases enable row level security;
alter table public.rent_payments enable row level security;
alter table public.meters enable row level security;
alter table public.meter_readings enable row level security;
alter table public.electricity_bills enable row level security;
alter table public.monthly_charges enable row level security;
alter table public.dg_usage enable row level security;

-- profiles: read own row; admin reads/updates all
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.my_role() = 'admin');
create policy "profiles_admin_update" on public.profiles for update
  using (public.my_role() = 'admin');

-- everything readable by any signed-in user
create policy "units_select" on public.units for select using (auth.uid() is not null);
create policy "tenants_select" on public.tenants for select using (auth.uid() is not null);
create policy "tenant_units_select" on public.tenant_units for select using (auth.uid() is not null);
create policy "leases_select" on public.leases for select using (auth.uid() is not null);
create policy "rent_payments_select" on public.rent_payments for select using (auth.uid() is not null);
create policy "meters_select" on public.meters for select using (auth.uid() is not null);
create policy "meter_readings_select" on public.meter_readings for select using (auth.uid() is not null);
create policy "electricity_bills_select" on public.electricity_bills for select using (auth.uid() is not null);
create policy "monthly_charges_select" on public.monthly_charges for select using (auth.uid() is not null);
create policy "dg_usage_select" on public.dg_usage for select using (auth.uid() is not null);

-- meter readings: editor + admin can insert/update; admin can delete
create policy "meter_readings_write" on public.meter_readings for insert
  with check (public.my_role() in ('admin', 'editor'));
create policy "meter_readings_update" on public.meter_readings for update
  using (public.my_role() in ('admin', 'editor'));
create policy "meter_readings_delete" on public.meter_readings for delete
  using (public.my_role() = 'admin');

-- all other writes: admin only
create policy "units_admin" on public.units for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "tenants_admin" on public.tenants for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "tenant_units_admin" on public.tenant_units for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "leases_admin" on public.leases for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "rent_payments_admin" on public.rent_payments for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "meters_admin" on public.meters for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "electricity_bills_admin" on public.electricity_bills for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "monthly_charges_admin" on public.monthly_charges for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "dg_usage_admin" on public.dg_usage for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ============================================================
-- Seed data
-- NOTE: update area_sqft values to actual rental areas — they
-- drive the area-based cost allocation.
-- ============================================================
insert into public.units (code, name, area_sqft, sort_order) values
  ('GF',   'Ground Floor',        1200, 1),
  ('FF',   'First Floor',         1200, 2),
  ('SFF',  'Second Floor Front',   600, 3),
  ('SFB',  'Second Floor Behind',  600, 4),
  ('TF',   'Third Floor',         1200, 5),
  ('TERR', 'Terrace',                0, 6);

-- Zvky Design Studio is tracked as a separate tenant per floor so each
-- floor gets its own lease, rent tracking and invoice.
insert into public.tenants (name, is_owner_occupied) values
  ('Zvky Design Studio - Ground Floor', false),
  ('Zvky Design Studio - First Floor', false),
  ('Zvky Design Studio - Third Floor', false),
  ('Zvky Design Studio - Terrace', false),
  ('Ortho & Physio Clinic', false),
  ('Anugiri Dental Clinic', true);

insert into public.tenant_units (tenant_id, unit_id)
select t.id, u.id from public.tenants t, public.units u
where (t.name = 'Zvky Design Studio - Ground Floor' and u.code = 'GF')
   or (t.name = 'Zvky Design Studio - First Floor'  and u.code = 'FF')
   or (t.name = 'Zvky Design Studio - Third Floor'  and u.code = 'TF')
   or (t.name = 'Zvky Design Studio - Terrace'      and u.code = 'TERR')
   or (t.name = 'Ortho & Physio Clinic'             and u.code = 'SFB')
   or (t.name = 'Anugiri Dental Clinic'             and u.code = 'SFF');

insert into public.meters (code, name, kind, unit_id, sort_order) values
  ('GF',        'Ground Floor Electric',        'electric', (select id from public.units where code = 'GF'),  1),
  ('FF',        'First Floor Electric',         'electric', (select id from public.units where code = 'FF'),  2),
  ('SF1',       'Second Floor Front Electric',  'electric', (select id from public.units where code = 'SFF'), 3),
  ('SF2',       'Second Floor Behind Electric', 'electric', (select id from public.units where code = 'SFB'), 4),
  ('TF',        'Third Floor Electric',         'electric', (select id from public.units where code = 'TF'),  5),
  ('COMMON',    'Common Area Electric',         'electric', null, 6),
  ('BWSSB',     'BWSSB Water',                  'water',    null, 7),
  ('WATER_INT', 'Internal Water',               'water',    null, 8),
  ('DG',        'Generator (DG)',               'dg',       null, 9);
