-- Address per tenant, shown on invoices under the tenant name
alter table public.tenants add column if not exists address text;
