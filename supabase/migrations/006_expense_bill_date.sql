-- Bill date on expenses; the Expenses tab filters by bill date
-- (expense_date remains the payment date)
alter table public.expenses add column if not exists bill_date date;
update public.expenses set bill_date = expense_date where bill_date is null;
alter table public.expenses alter column bill_date set not null;
