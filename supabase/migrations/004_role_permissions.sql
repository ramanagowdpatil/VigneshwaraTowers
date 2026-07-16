-- =====================================================================
-- Role permissions v2
--   admin  : full control (unchanged)
--   editor : meter readings only (loses read access to rents/bills)
--   viewer : sees only the tenants assigned to them (e.g. Zvky floors)
--            across readings, rents and invoices
-- =====================================================================

-- Which tenants a (viewer) user is allowed to see
create table public.profile_tenants (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  tenant_id int not null references public.tenants (id) on delete cascade,
  primary key (profile_id, tenant_id)
);

alter table public.profile_tenants enable row level security;

create policy "profile_tenants_select" on public.profile_tenants for select
  using (profile_id = auth.uid() or public.my_role() = 'admin');
create policy "profile_tenants_admin" on public.profile_tenants for all
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Helpers
create or replace function public.my_tenant_ids()
returns setof int
language sql stable security definer set search_path = public
as $$
  select tenant_id from public.profile_tenants where profile_id = auth.uid();
$$;

create or replace function public.my_unit_ids()
returns setof int
language sql stable security definer set search_path = public
as $$
  select tu.unit_id from public.tenant_units tu
  where tu.tenant_id in (select public.my_tenant_ids());
$$;

-- ---------------------------------------------------------------
-- Tighten SELECT policies
-- (units / tenants / tenant_units / meters stay readable by all
--  signed-in users: they hold no financial data and are needed to
--  compute area-based shares correctly.)
-- ---------------------------------------------------------------

drop policy "leases_select" on public.leases;
create policy "leases_select" on public.leases for select using (
  public.my_role() = 'admin'
  or (public.my_role() = 'viewer'
      and tenant_id in (select public.my_tenant_ids()))
);

drop policy "rent_payments_select" on public.rent_payments;
create policy "rent_payments_select" on public.rent_payments for select using (
  public.my_role() = 'admin'
  or (public.my_role() = 'viewer'
      and lease_id in (select id from public.leases
                       where tenant_id in (select public.my_tenant_ids())))
);

drop policy "meter_readings_select" on public.meter_readings;
create policy "meter_readings_select" on public.meter_readings for select using (
  public.my_role() in ('admin', 'editor')
  or (public.my_role() = 'viewer'
      and meter_id in (select id from public.meters
                       where unit_id in (select public.my_unit_ids())))
);

drop policy "electricity_bills_select" on public.electricity_bills;
create policy "electricity_bills_select" on public.electricity_bills for select using (
  public.my_role() = 'admin'
  or (public.my_role() = 'viewer'
      and meter_id in (select id from public.meters
                       where unit_id in (select public.my_unit_ids())
                          or code = 'COMMON'))
);

drop policy "monthly_charges_select" on public.monthly_charges;
create policy "monthly_charges_select" on public.monthly_charges for select using (
  public.my_role() in ('admin', 'viewer')
);

drop policy "dg_usage_select" on public.dg_usage;
create policy "dg_usage_select" on public.dg_usage for select using (
  public.my_role() in ('admin', 'viewer')
);

drop policy "floor_charges_select" on public.floor_charges;
create policy "floor_charges_select" on public.floor_charges for select using (
  public.my_role() = 'admin'
  or (public.my_role() = 'viewer'
      and unit_id in (select public.my_unit_ids()))
);

-- Give the existing viewer test user access to all Zvky floors
insert into public.profile_tenants (profile_id, tenant_id)
select u.id, t.id
from auth.users u, public.tenants t
where u.email = 'viewer@vigneshwara.test' and t.name like 'Zvky%'
on conflict do nothing;
