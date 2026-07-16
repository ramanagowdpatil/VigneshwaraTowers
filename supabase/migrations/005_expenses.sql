-- =====================================================================
-- Expenses (admin only) + private storage bucket for bill attachments
-- =====================================================================

create type expense_category as enum (
  'bescom',          -- monthly electricity payment
  'bwssb',           -- monthly water payment
  'diesel',          -- ad hoc
  'security_salary', -- monthly
  'lift_amc',        -- annual
  'dg_amc',          -- annual
  'bbmp',            -- annual property tax
  'other'
);

create table public.expenses (
  id serial primary key,
  category expense_category not null,
  expense_date date not null,
  amount numeric not null default 0,
  description text,
  attachment_path text,   -- file path inside the expense-bills bucket
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy "expenses_admin" on public.expenses for all
  using (public.my_role() = 'admin')
  with check (public.my_role() = 'admin');

-- Private bucket for uploaded bills / receipts (admin only)
insert into storage.buckets (id, name, public)
values ('expense-bills', 'expense-bills', false)
on conflict (id) do nothing;

create policy "expense_bills_admin" on storage.objects for all
  using (bucket_id = 'expense-bills' and public.my_role() = 'admin')
  with check (bucket_id = 'expense-bills' and public.my_role() = 'admin');
