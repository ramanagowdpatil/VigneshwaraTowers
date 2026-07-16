# Vigneshwara Towers — Building Management

Web app for tracking rents, utilities, meter readings and monthly invoices for
Vigneshwara Towers. Built with **Next.js + Supabase**, deployable on
**Vercel**, and fully mobile-responsive.

## What it does

| Area | Details |
|---|---|
| **Rent tracking** | Advance, rent start/end dates, monthly claims, GST, TDS, amount received, payment mode & dates. Anugiri Dental (own premises) is excluded from rent tracking. |
| **Maintenance** | 5% of monthly rent (configurable per lease), shown on invoices. |
| **Electricity** | Monthly bill per meter with all components: fixed charges (KW × ₹/KW), energy charges (KWh × ₹/KWh), fuel cost adjustment, tax, P&G surcharge. Common-area bill is split among tenants by rental area. |
| **Water** | Entered separately for each floor every month (not split by area). |
| **Sanitary (BWSSB) / Security** | Monthly amounts split among floors by rental area. |
| **Generator (DG)** | Hours of usage, diesel litres × price, maintenance — total split by rental area. |
| **Daily readings** | GF, FF, SF1, SF2, TF & Common electric meters, BWSSB & internal water meters, DG meter. |
| **Invoices** | Printable monthly invoice per tenant (rent + GST + maintenance + shared costs). Use *Print / Save PDF*. |

## Roles

| Role | Access |
|---|---|
| **admin** | Everything — rents, bills, leases, areas, user roles |
| **editor** | Enter/update daily meter readings; view everything else |
| **viewer** | Read-only access to all pages and reports |

## 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. In the dashboard open **SQL Editor**, paste the contents of
   [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) and run it.
   This creates all tables, row-level-security policies and seeds the floors,
   tenants and meters.
3. In **Authentication → Sign In / Up**, keep Email enabled (you can disable
   sign-ups; users are invited by you).
4. Create the three users under **Authentication → Users → Add user**
   (e.g. admin, data-entry, viewer accounts) with passwords.
5. After creating users, set the admin's role in **SQL Editor**:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'YOUR-ADMIN-EMAIL');
   ```

   The admin can then assign `editor` / `viewer` roles to the other users from
   the app's **Setup** page.
6. Copy the **Project URL** and **anon public key** from
   **Project Settings → API**.

## 2. Run locally

```bash
# .env.local — replace the placeholder values
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY

npm install
npm run dev
```

Open http://localhost:3000 and sign in.

## 3. First-time data setup (in the app, as admin)

1. **Setup → Floors & rental area** — enter the actual sq-ft of each floor
   (seeded with placeholder values). This drives all area-based cost splits.
2. **Setup → Leases** — add a lease for Zvky Design Studio and the Ortho &
   Physio clinic: monthly rent, advance, start/end dates, GST/TDS/maintenance %.
3. **Bills** — enter each month's electricity bills, water/BWSSB/security
   amounts and DG usage.
4. **Readings** — the editor enters daily meter readings.
5. **Invoices** — pick a month and print each tenant's invoice.

## 4. Deploy to Vercel

1. Push this folder to a GitHub repository.
2. In [vercel.com](https://vercel.com) → **Add New Project** → import the repo
   (framework auto-detected as Next.js).
3. Add the two environment variables under **Settings → Environment Variables**:
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy. The app works on phones — the site is responsive and all entry
   forms are usable on mobile.

## Project structure

```
supabase/migrations/001_init.sql   Database schema, RLS policies, seed data
proxy.ts                           Auth session refresh + route protection
lib/supabase/                      Browser & server Supabase clients
lib/utils.ts                       INR/date formatting, area-based allocation
app/login/                         Sign-in page
app/(app)/                         Authenticated app
  page.tsx                         Dashboard
  readings/                        Daily meter readings (editor+admin entry)
  rents/                           Monthly rent claims & payments (admin entry)
  bills/                           Electricity / water / BWSSB / security / DG
  invoices/                        Printable monthly invoices per tenant
  setup/                           Areas, tenants, leases, user roles (admin)
```

## Notes

- Security is enforced in the database via Supabase **row level security** —
  even if someone tampers with the UI, viewers cannot write and editors can
  only write meter readings.
- All amounts are in ₹ (INR).
- The seeded tenants/floors match the building: Zvky Design Studio (Ground,
  1st, 3rd, Terrace), Ortho & Physio (2nd floor behind), Anugiri Dental
  (2nd floor front, owner-occupied).
