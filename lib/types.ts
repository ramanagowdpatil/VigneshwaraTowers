export type UserRole = "admin" | "editor" | "viewer";

export type ExpenseCategory =
  | "bescom"
  | "bwssb"
  | "diesel"
  | "security_salary"
  | "lift_amc"
  | "dg_amc"
  | "bbmp"
  | "other";

export interface Expense {
  id: number;
  category: ExpenseCategory;
  expense_date: string;
  amount: number;
  description: string | null;
  attachment_path: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: UserRole;
}

export interface Unit {
  id: number;
  code: string;
  name: string;
  area_sqft: number;
  sort_order: number;
}

export interface Tenant {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  is_owner_occupied: boolean;
  active: boolean;
  tenant_units?: { unit_id: number }[];
}

export interface Lease {
  id: number;
  tenant_id: number;
  monthly_rent: number;
  advance_amount: number;
  advance_paid_date: string | null;
  start_date: string;
  end_date: string | null;
  gst_percent: number;
  tds_percent: number;
  maintenance_percent: number;
  notes: string | null;
  active: boolean;
  tenants?: Tenant;
}

export interface RentPayment {
  id: number;
  lease_id: number;
  period: string;
  rent_claimed: number;
  claim_date: string | null;
  gst_amount: number;
  tds_amount: number;
  amount_received: number;
  payment_mode: string | null;
  received_date: string | null;
  notes: string | null;
  leases?: Lease;
}

export type MeterKind = "electric" | "water" | "dg";

export interface Meter {
  id: number;
  code: string;
  name: string;
  kind: MeterKind;
  unit_id: number | null;
  sort_order: number;
}

export interface MeterReading {
  id: number;
  meter_id: number;
  reading_date: string;
  reading: number;
  meters?: Meter;
}

export interface ElectricityBill {
  id: number;
  meter_id: number;
  period: string;
  fixed_kw: number;
  fixed_rate: number;
  energy_kwh: number;
  energy_rate: number;
  fca_kwh: number;
  fca_rate: number;
  tax_amount: number;
  png_surcharge: number;
  total_amount: number;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  meters?: Meter;
}

export type ChargeCategory = "water" | "bwssb" | "security" | "other";

export interface MonthlyCharge {
  id: number;
  category: ChargeCategory;
  period: string;
  amount: number;
  paid_date: string | null;
  notes: string | null;
}

export interface DgUsage {
  id: number;
  period: string;
  hours_used: number;
  diesel_litres: number;
  diesel_price_per_litre: number;
  maintenance_cost: number;
  total_cost: number;
  notes: string | null;
}
