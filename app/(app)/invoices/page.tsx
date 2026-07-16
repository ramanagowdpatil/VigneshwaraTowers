"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/RoleProvider";
import { PageTitle, Field, Button, AccessDenied, inputCls } from "@/components/ui";
import {
  currentPeriod,
  monthToPeriod,
  periodToMonth,
  formatINR,
  amountInWords,
  allocateByArea,
  tenantArea,
} from "@/lib/utils";
import type {
  Unit,
  Tenant,
  Lease,
  ElectricityBill,
  MonthlyCharge,
  DgUsage,
  Meter,
} from "@/lib/types";

interface InvoiceRow {
  label: string;
  amount: number;
  bold?: boolean;
}

const OWNER_BLOCK = (
  <>
    Dr. Revathi Patil &amp; Ramana Gowd Patil
    <br />
    A901, Hoysala Infantry Towers, Sanjay Nagar Main Road,
    <br />
    Bengaluru – 560094
    <br />
    Dr. Revathi Patil - PAN No. AHBPR9180Q
    <br />
    Mr. Ramana Gowd Patil - PAN No. AJEPP7844C
  </>
);

const BANK_DETAILS: [string, string][] = [
  ["A/c Holder's Name", "Dr. Revathi Patil and Ramana Gowd Patil"],
  ["Bank Name", "Bank: HDFC"],
  ["A/c No.", "A/c No. 06281870000201"],
  ["Branch & IFS Code", "New BEL Road, HDFC0000628"],
];

/** "Rs. 4,000.0" style used on the printed invoice */
function rs(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}`;
}

function ddmmyyyy(d: Date, sep = "/"): string {
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join(sep);
}

const cell = "border border-slate-900 px-2 py-1 align-top";

export default function InvoicesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { role, tenantIds } = useRole();

  const [period, setPeriod] = useState(currentPeriod());
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [bills, setBills] = useState<ElectricityBill[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  const [charges, setCharges] = useState<MonthlyCharge[]>([]);
  const [dg, setDg] = useState<DgUsage | null>(null);
  const [floorWater, setFloorWater] = useState<Record<number, number>>({});
  const [loaded, setLoaded] = useState(false);
  // When set, only this tenant's invoice is visible during printing
  const [printOnly, setPrintOnly] = useState<number | null>(null);

  function printSingle(tenantId: number) {
    setPrintOnly(tenantId);
    setTimeout(() => {
      window.print();
      setPrintOnly(null);
    }, 100);
  }

  const load = useCallback(
    async (p: string) => {
      const [u, t, l, eb, mc, dgu, fw, mt] = await Promise.all([
        supabase.from("units").select("*").order("sort_order"),
        supabase
          .from("tenants")
          .select("*, tenant_units(unit_id)")
          .eq("active", true)
          .order("id"),
        supabase.from("leases").select("*").eq("active", true),
        supabase
          .from("electricity_bills")
          .select("*, meters(code, name, unit_id)")
          .eq("period", p),
        supabase.from("monthly_charges").select("*").eq("period", p),
        supabase.from("dg_usage").select("*").eq("period", p).maybeSingle(),
        supabase
          .from("floor_charges")
          .select("*")
          .eq("period", p)
          .eq("category", "water"),
        supabase.from("meters").select("*").eq("kind", "electric"),
      ]);
      setUnits((u.data ?? []) as Unit[]);
      setTenants((t.data ?? []) as Tenant[]);
      setLeases((l.data ?? []) as Lease[]);
      setBills((eb.data ?? []) as ElectricityBill[]);
      setMeters((mt.data ?? []) as Meter[]);
      setCharges((mc.data ?? []) as MonthlyCharge[]);
      setDg((dgu.data as DgUsage) ?? null);
      const w: Record<number, number> = {};
      (fw.data ?? []).forEach((r: { unit_id: number; amount: number }) => {
        w[r.unit_id] = Number(r.amount);
      });
      setFloorWater(w);
      setLoaded(true);
    },
    [supabase]
  );

  useEffect(() => {
    load(currentPeriod());
  }, [load]);

  async function changeMonth(month: string) {
    const p = monthToPeriod(month);
    setPeriod(p);
    await load(p);
  }

  function chargeAmount(category: string): number {
    return Number(charges.find((c) => c.category === category)?.amount ?? 0);
  }

  const commonBill = bills.find((b) => b.meters?.code === "COMMON") ?? null;
  const commonTotal = Number(commonBill?.total_amount ?? 0);
  const totalArea = units.reduce((s, u) => s + Number(u.area_sqft), 0);
  const securityTotal = chargeAmount("security");
  const securityRate = totalArea > 0 ? securityTotal / totalArea : 0;
  const dgCost = Number(dg?.total_cost ?? 0);
  const dgLitres = Number(dg?.diesel_litres ?? 0);

  const commonElecAlloc = allocateByArea(commonTotal, tenants, units);
  const bwssbAlloc = allocateByArea(chargeAmount("bwssb"), tenants, units);
  const securityAlloc = allocateByArea(securityTotal, tenants, units);
  const dgAlloc = allocateByArea(dgCost, tenants, units);

  function shareFor(
    alloc: ReturnType<typeof allocateByArea>,
    tenantId: number
  ) {
    return alloc.find((a) => a.tenant.id === tenantId);
  }

  const n = (v: number | string | null | undefined) => Number(v) || 0;
  const q = (v: number) =>
    v.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  function invoiceFor(tenant: Tenant): { rows: InvoiceRow[]; total: number } {
    const rows: InvoiceRow[] = [];
    const lease = leases.find((l) => l.tenant_id === tenant.id);
    const unitIds = (tenant.tenant_units ?? []).map((tu) => tu.unit_id);
    const share = shareFor(commonElecAlloc, tenant.id)?.share ?? 0;
    const pctLabel = `${(share * 100).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
    const area = tenantArea(tenant, units);

    // ---- Electricity ----
    const ownMeter = meters.find(
      (m) =>
        m.code !== "COMMON" && m.unit_id != null && unitIds.includes(m.unit_id)
    );
    const ownBill = ownMeter
      ? bills.find((b) => b.meter_id === ownMeter.id)
      : undefined;
    const fixed = n(ownBill?.fixed_kw) * n(ownBill?.fixed_rate);
    const energy = n(ownBill?.energy_kwh) * n(ownBill?.energy_rate);
    const fca = n(ownBill?.fca_kwh) * n(ownBill?.fca_rate);
    const tax = n(ownBill?.tax_amount);
    const png = n(ownBill?.png_surcharge);
    const commonShare = commonTotal * share;
    const elecTotal = fixed + energy + fca + tax + png + commonShare;

    if (ownMeter) {
      rows.push(
        {
          label: `Fixed charges: ${q(n(ownBill?.fixed_kw))} KW at Rs ${q(n(ownBill?.fixed_rate))} per KW`,
          amount: fixed,
        },
        {
          label: `Energy Charges: ${q(n(ownBill?.energy_kwh))} kWh at Rs ${q(n(ownBill?.energy_rate))} per kWh`,
          amount: energy,
        },
        {
          label: `Fuel Cost Adjustment Charges: ${q(n(ownBill?.fca_kwh))} KWH at Rs ${q(n(ownBill?.fca_rate))} per KWH`,
          amount: fca,
        },
        { label: "Tax", amount: tax },
        { label: "P&G Surcharge", amount: png }
      );
    }
    rows.push({
      label: `Common Area Ele Charges @ ${pctLabel} of ${rs(commonTotal)}`,
      amount: commonShare,
    });
    rows.push({ label: "Electricity Total", amount: elecTotal, bold: true });

    // ---- Maintenance ----
    const maintenance = lease
      ? (n(lease.monthly_rent) * n(lease.maintenance_percent)) / 100
      : 0;
    rows.push({
      label: lease
        ? `Maintenance @ ${q(n(lease.maintenance_percent))}%`
        : "Maintenance",
      amount: maintenance,
    });

    // ---- Security (rate per sqft) ----
    const security = shareFor(securityAlloc, tenant.id)?.amount ?? 0;
    rows.push({
      label: `Security for ${q(area)} SQFT @ ${securityRate.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
      amount: security,
    });

    // ---- Water (entered per floor) ----
    const water = unitIds.reduce((s, id) => s + (floorWater[id] ?? 0), 0);
    rows.push({ label: "Water Charges", amount: water });

    // ---- Sanitary ----
    const sanitary = shareFor(bwssbAlloc, tenant.id)?.amount ?? 0;
    rows.push({ label: `Sanitary Charges @ ${pctLabel}`, amount: sanitary });

    // ---- DG fuel ----
    const dgShare = shareFor(dgAlloc, tenant.id)?.amount ?? 0;
    rows.push({
      label: `Fuel for DG Set for ${q(dgLitres * share)} litres`,
      amount: dgShare,
    });

    const total =
      elecTotal + maintenance + security + water + sanitary + dgShare;
    return { rows, total };
  }

  // Ref no: month serial + tenant id, e.g. 2607-04
  const refFor = (tenant: Tenant) =>
    `${periodToMonth(period).slice(2, 4)}${periodToMonth(period).slice(5, 7)}-${String(tenant.id).padStart(2, "0")}`;

  const periodStart = new Date(period + "T00:00:00");
  const periodEnd = new Date(
    periodStart.getFullYear(),
    periodStart.getMonth() + 1,
    0
  );

  if (role === "editor") {
    return (
      <div>
        <PageTitle>Invoices</PageTitle>
        <AccessDenied />
      </div>
    );
  }

  // Viewers only see invoices for their assigned tenants (e.g. Zvky floors)
  const visibleTenants =
    role === "viewer"
      ? tenants.filter((t) => tenantIds.includes(t.id))
      : tenants;

  return (
    <div className="space-y-3">
      <div className="print:hidden">
        <PageTitle sub="Electricity, maintenance & other charges — invoice per floor">
          Invoices
        </PageTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div className="max-w-xs flex-1 min-w-40">
            <Field label="Month">
              <input
                type="month"
                value={periodToMonth(period)}
                onChange={(e) => changeMonth(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          <Button variant="secondary" onClick={() => window.print()}>
            Print all / Save PDF
          </Button>
        </div>
      </div>

      {loaded && visibleTenants.length === 0 && (
        <p className="text-sm text-slate-400">No invoices available.</p>
      )}

      {visibleTenants.map((tenant) => {
        const { rows, total } = invoiceFor(tenant);
        return (
          <div
            key={tenant.id}
            className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-8 text-[15px] leading-snug text-slate-900 print:shadow-none print:border-0 print:rounded-none print:break-inside-avoid print:break-after-page ${
              printOnly !== null && printOnly !== tenant.id
                ? "print:hidden"
                : ""
            }`}
          >
            {/* From / To */}
            <div className="flex justify-between gap-6 mb-5">
              <div className="text-sm">
                <p>From,</p>
                <p className="mt-1.5">{OWNER_BLOCK}</p>
              </div>
              <div className="text-sm max-w-60">
                <p>To,</p>
                <p className="mt-1.5 font-semibold uppercase">{tenant.name}</p>
                {tenant.address && (
                  <p className="whitespace-pre-line">{tenant.address}</p>
                )}
              </div>
            </div>

            {/* Title */}
            <h2 className="text-center font-bold underline underline-offset-2 mb-4">
              ELECTRICITY, MAINTENANCE and Others INVOICE
            </h2>

            {/* Ref / Date */}
            <div className="flex justify-between border border-slate-900 px-2 py-1 mb-3 text-sm">
              <span>Ref: {refFor(tenant)}</span>
              <span>Date: {ddmmyyyy(new Date())}</span>
            </div>

            <p className="text-sm mb-3">
              Month: {ddmmyyyy(periodStart, "-")} to {ddmmyyyy(periodEnd, "-")}
            </p>

            {/* Charges table */}
            <table className="w-full border-collapse border border-slate-900 text-sm mb-5">
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className={`${cell} ${row.bold ? "font-bold" : ""}`}>
                      {row.label}
                    </td>
                    <td
                      className={`${cell} text-right w-28 whitespace-nowrap ${
                        row.bold ? "font-bold" : ""
                      }`}
                    >
                      {rs(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total in words */}
            <div className="flex justify-between gap-4 border border-slate-900 px-2 py-2 text-sm font-semibold mb-8">
              <span>
                Total Amount: {amountInWords(total)} Only
              </span>
              <span className="whitespace-nowrap">{rs(total)}</span>
            </div>

            {/* Bank details */}
            <table className="w-full sm:w-4/5 mx-auto border-collapse border border-slate-900 text-sm mb-5">
              <thead>
                <tr>
                  <th
                    colSpan={2}
                    className={`${cell} text-center font-bold`}
                  >
                    Bank Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {BANK_DETAILS.map(([k, v]) => (
                  <tr key={k}>
                    <td className={`${cell} w-2/5`}>{k}</td>
                    <td className={cell}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-sm">
              Note: This communication is done by my personal email and does
              not require signature.
            </p>

            <div className="print:hidden mt-4 flex justify-end gap-3 items-center border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-400">
                Total: {formatINR(total)}
              </span>
              <button
                onClick={() => printSingle(tenant.id)}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded-lg px-2.5 py-1"
              >
                Print this invoice
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
