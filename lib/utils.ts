import type { Tenant, Unit } from "./types";

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** First day of the current month as YYYY-MM-DD */
export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** YYYY-MM (for <input type="month">) -> YYYY-MM-01 */
export function monthToPeriod(month: string): string {
  return `${month}-01`;
}

/** YYYY-MM-01 -> YYYY-MM */
export function periodToMonth(period: string): string {
  return period.slice(0, 7);
}

export function formatPeriod(period: string): string {
  return new Date(period + "T00:00:00").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety",
];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
}

function threeDigitWords(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (hundred === 0) return twoDigitWords(rest);
  return (
    ONES[hundred] + " Hundred" + (rest ? " and " + twoDigitWords(rest) : "")
  );
}

/** Amount in words using the Indian numbering system (crore/lakh/thousand). */
export function amountInWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(twoDigitWords(crore) + " Crore");
  if (lakh) parts.push(twoDigitWords(lakh) + " Lakh");
  if (thousand) parts.push(twoDigitWords(thousand) + " Thousand");
  if (n) parts.push(threeDigitWords(n));
  return parts.join(" ");
}

/** Total rented area of a tenant, from its assigned units */
export function tenantArea(tenant: Tenant, units: Unit[]): number {
  const unitIds = (tenant.tenant_units ?? []).map((tu) => tu.unit_id);
  return units
    .filter((u) => unitIds.includes(u.id))
    .reduce((sum, u) => sum + Number(u.area_sqft), 0);
}

/**
 * Area-based allocation: each active tenant's share of a total amount,
 * proportional to its rented area. Used for common electricity, water,
 * BWSSB, security salary and DG cost.
 */
export function allocateByArea(
  total: number,
  tenants: Tenant[],
  units: Unit[]
): { tenant: Tenant; area: number; share: number; amount: number }[] {
  const active = tenants.filter((t) => t.active);
  const areas = active.map((t) => tenantArea(t, units));
  const totalArea = areas.reduce((a, b) => a + b, 0);
  return active.map((t, i) => {
    const share = totalArea > 0 ? areas[i] / totalArea : 0;
    return { tenant: t, area: areas[i], share, amount: total * share };
  });
}
