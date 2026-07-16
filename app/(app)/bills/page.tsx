"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsAdmin } from "@/components/RoleProvider";
import {
  PageTitle,
  Field,
  Button,
  Notice,
  AccessDenied,
  inputCls,
  thCls,
  tdCls,
} from "@/components/ui";
import {
  currentPeriod,
  monthToPeriod,
  periodToMonth,
  formatPeriod,
  formatINR,
} from "@/lib/utils";
import type { Meter, Unit, Tenant, Lease, ChargeCategory } from "@/lib/types";

interface ElecDraft {
  fixed_kw: string;
  fixed_rate: string;
  energy_kwh: string;
  energy_rate: string;
  fca_kwh: string;
  fca_rate: string;
  tax_amount: string;
  png_surcharge: string;
}

const EMPTY_ELEC: ElecDraft = {
  fixed_kw: "",
  fixed_rate: "",
  energy_kwh: "",
  energy_rate: "",
  fca_kwh: "",
  fca_rate: "",
  tax_amount: "",
  png_surcharge: "",
};

const CHARGE_LABELS: { key: ChargeCategory; label: string }[] = [
  { key: "bwssb", label: "Sanitary charges (BWSSB)" },
  { key: "security", label: "Security" },
];

function elecTotal(d: ElecDraft): number {
  return (
    (Number(d.fixed_kw) || 0) * (Number(d.fixed_rate) || 0) +
    (Number(d.energy_kwh) || 0) * (Number(d.energy_rate) || 0) +
    (Number(d.fca_kwh) || 0) * (Number(d.fca_rate) || 0) +
    (Number(d.tax_amount) || 0) +
    (Number(d.png_surcharge) || 0)
  );
}

// ---------------------------------------------------------------------------
// Presentational components live at module level so their identity is stable
// across re-renders — defining them inside the page component makes React
// remount the tree on every keystroke and inputs lose focus.
// ---------------------------------------------------------------------------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${
        open ? "rotate-90" : ""
      }`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CollapsibleCard({
  title,
  subtitle,
  amount,
  meta,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  amount: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <Chevron open={open} />
          <span className="min-w-0">
            <span className="block font-semibold text-slate-900 truncate">
              {title}
            </span>
            {subtitle && (
              <span className="block text-xs text-slate-400 truncate">
                {subtitle}
              </span>
            )}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="block text-sm font-bold text-slate-900">
            {amount}
          </span>
          {meta && <span className="block text-xs text-slate-400">{meta}</span>}
        </span>
      </button>
      {open && (
        <div className="px-3 sm:px-4 pb-3 border-t border-slate-100">
          {children}
        </div>
      )}
    </section>
  );
}

function BillTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className={`${thCls} w-1/3`}>Item</th>
            <th className={thCls}>Qty</th>
            <th className={thCls}>Rate</th>
            <th className={`${thCls} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Row({
  label,
  detail,
  qty,
  rate,
  amount,
  bold,
  indent,
}: {
  label: string;
  detail?: string;
  qty?: React.ReactNode;
  rate?: React.ReactNode;
  amount: React.ReactNode;
  bold?: boolean;
  indent?: boolean;
}) {
  const weight = bold ? "font-bold text-slate-900" : "";
  return (
    <tr className={bold ? "bg-slate-50" : ""}>
      <td className={`${tdCls} ${weight} ${indent ? "pl-9 sm:pl-8" : ""}`}>
        {label}
        {detail && (
          <span className="block text-xs font-normal text-slate-400">
            {detail}
          </span>
        )}
      </td>
      <td className={tdCls}>{qty ?? "—"}</td>
      <td className={tdCls}>{rate ?? "—"}</td>
      <td className={`${tdCls} text-right ${weight || "font-medium"}`}>
        {amount}
      </td>
    </tr>
  );
}

/** Summary row that expands/collapses the detail rows beneath it */
function ToggleRow({
  label,
  detail,
  amount,
  open,
  onToggle,
}: {
  label: string;
  detail?: string;
  amount: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <tr
      className="bg-blue-50/50 hover:bg-blue-50 cursor-pointer select-none"
      onClick={onToggle}
    >
      <td className={`${tdCls} font-semibold text-slate-900`} colSpan={3}>
        <span className="flex items-center gap-1.5">
          <Chevron open={open} />
          {label}
          {detail && (
            <span className="text-xs font-normal text-slate-400">
              {detail}
            </span>
          )}
        </span>
      </td>
      <td className={`${tdCls} text-right font-semibold text-slate-900`}>
        {amount}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------

export default function BillsPage() {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = useIsAdmin();

  const [meters, setMeters] = useState<Meter[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [elec, setElec] = useState<Record<number, ElecDraft>>({});
  const [charges, setCharges] = useState<Record<string, string>>({});
  const [floorWater, setFloorWater] = useState<Record<number, string>>({});
  const [dg, setDg] = useState({
    hours_used: "",
    diesel_litres: "",
    diesel_price_per_litre: "",
    maintenance_cost: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Collapse state: floor cards + electricity breakdowns ("b" = building card)
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [openElec, setOpenElec] = useState<Record<string, boolean>>({});
  const toggleCard = (k: string) =>
    setOpenCards((s) => ({ ...s, [k]: !s[k] }));
  const toggleElec = (k: string) =>
    setOpenElec((s) => ({ ...s, [k]: !s[k] }));
  const setAll = (open: boolean) => {
    const cards: Record<string, boolean> = { b: open };
    const elecs: Record<string, boolean> = { b: open };
    units.forEach((u) => {
      cards[String(u.id)] = open;
      elecs[String(u.id)] = open;
    });
    setOpenCards(cards);
    setOpenElec(elecs);
  };

  const load = useCallback(
    async (meterList: Meter[], p: string) => {
      const [{ data: bills }, { data: chargeRows }, { data: dgRow }, { data: waterRows }] =
        await Promise.all([
          supabase.from("electricity_bills").select("*").eq("period", p),
          supabase.from("monthly_charges").select("*").eq("period", p),
          supabase.from("dg_usage").select("*").eq("period", p).maybeSingle(),
          supabase
            .from("floor_charges")
            .select("*")
            .eq("period", p)
            .eq("category", "water"),
        ]);

      const e: Record<number, ElecDraft> = {};
      meterList
        .filter((m) => m.kind === "electric")
        .forEach((m) => {
          const b = (bills ?? []).find((x) => x.meter_id === m.id);
          e[m.id] = b
            ? {
                fixed_kw: String(b.fixed_kw),
                fixed_rate: String(b.fixed_rate),
                energy_kwh: String(b.energy_kwh),
                energy_rate: String(b.energy_rate),
                fca_kwh: String(b.fca_kwh),
                fca_rate: String(b.fca_rate),
                tax_amount: String(b.tax_amount),
                png_surcharge: String(b.png_surcharge),
              }
            : { ...EMPTY_ELEC };
        });
      setElec(e);

      const c: Record<string, string> = {};
      CHARGE_LABELS.forEach(({ key }) => {
        const row = (chargeRows ?? []).find((x) => x.category === key);
        c[key] = row ? String(row.amount) : "";
      });
      setCharges(c);

      const w: Record<number, string> = {};
      (waterRows ?? []).forEach((r) => {
        w[r.unit_id] = String(r.amount);
      });
      setFloorWater(w);

      setDg(
        dgRow
          ? {
              hours_used: String(dgRow.hours_used),
              diesel_litres: String(dgRow.diesel_litres),
              diesel_price_per_litre: String(dgRow.diesel_price_per_litre),
              maintenance_cost: String(dgRow.maintenance_cost),
            }
          : { hours_used: "", diesel_litres: "", diesel_price_per_litre: "", maintenance_cost: "" }
      );
    },
    [supabase]
  );

  useEffect(() => {
    (async () => {
      const [m, u, t, l] = await Promise.all([
        supabase.from("meters").select("*").order("sort_order"),
        supabase.from("units").select("*").order("sort_order"),
        supabase
          .from("tenants")
          .select("*, tenant_units(unit_id)")
          .eq("active", true),
        supabase.from("leases").select("*").eq("active", true),
      ]);
      const meterList = (m.data ?? []) as Meter[];
      setMeters(meterList);
      setUnits((u.data ?? []) as Unit[]);
      setTenants((t.data ?? []) as Tenant[]);
      setLeases((l.data ?? []) as Lease[]);
      await load(meterList, currentPeriod());
    })();
  }, [supabase, load]);

  async function changeMonth(month: string) {
    const p = monthToPeriod(month);
    setPeriod(p);
    setMsg(null);
    await load(meters, p);
  }

  function setElecDraft(meterId: number, patch: Partial<ElecDraft>) {
    setElec((e) => ({ ...e, [meterId]: { ...e[meterId], ...patch } }));
  }

  async function saveAll() {
    setSaving(true);
    setMsg(null);
    const errors: string[] = [];

    const elecRowsData = Object.entries(elec)
      .filter(([, d]) => elecTotal(d) > 0)
      .map(([meterId, d]) => ({
        meter_id: Number(meterId),
        period,
        fixed_kw: Number(d.fixed_kw) || 0,
        fixed_rate: Number(d.fixed_rate) || 0,
        energy_kwh: Number(d.energy_kwh) || 0,
        energy_rate: Number(d.energy_rate) || 0,
        fca_kwh: Number(d.fca_kwh) || 0,
        fca_rate: Number(d.fca_rate) || 0,
        tax_amount: Number(d.tax_amount) || 0,
        png_surcharge: Number(d.png_surcharge) || 0,
      }));
    if (elecRowsData.length > 0) {
      const { error } = await supabase
        .from("electricity_bills")
        .upsert(elecRowsData, { onConflict: "meter_id,period" });
      if (error) errors.push(`Electricity: ${error.message}`);
    }

    const chargeRows = CHARGE_LABELS.filter(
      ({ key }) => charges[key] !== "" && charges[key] !== undefined
    ).map(({ key }) => ({
      category: key,
      period,
      amount: Number(charges[key]) || 0,
    }));
    if (chargeRows.length > 0) {
      const { error } = await supabase
        .from("monthly_charges")
        .upsert(chargeRows, { onConflict: "category,period" });
      if (error) errors.push(`Charges: ${error.message}`);
    }

    const waterRows = Object.entries(floorWater)
      .filter(([, v]) => v !== "")
      .map(([unitId, v]) => ({
        unit_id: Number(unitId),
        period,
        category: "water" as const,
        amount: Number(v) || 0,
      }));
    if (waterRows.length > 0) {
      const { error } = await supabase
        .from("floor_charges")
        .upsert(waterRows, { onConflict: "unit_id,period,category" });
      if (error) errors.push(`Water: ${error.message}`);
    }

    if (dg.hours_used !== "" || dg.diesel_litres !== "") {
      const { error } = await supabase.from("dg_usage").upsert(
        {
          period,
          hours_used: Number(dg.hours_used) || 0,
          diesel_litres: Number(dg.diesel_litres) || 0,
          diesel_price_per_litre: Number(dg.diesel_price_per_litre) || 0,
          maintenance_cost: Number(dg.maintenance_cost) || 0,
        },
        { onConflict: "period" }
      );
      if (error) errors.push(`DG: ${error.message}`);
    }

    setMsg(
      errors.length > 0
        ? { kind: "error", text: errors.join(" · ") }
        : { kind: "success", text: `Bills saved for ${formatPeriod(period)}.` }
    );
    setSaving(false);
  }

  // ---------- Allocation helpers ----------
  const totalArea = units.reduce((s, u) => s + Number(u.area_sqft), 0);
  const unitShare = (u: Unit) =>
    totalArea > 0 ? Number(u.area_sqft) / totalArea : 0;

  const commonMeter = meters.find((m) => m.code === "COMMON");
  const commonTotal = commonMeter ? elecTotal(elec[commonMeter.id] ?? EMPTY_ELEC) : 0;
  const dgCost =
    (Number(dg.diesel_litres) || 0) * (Number(dg.diesel_price_per_litre) || 0) +
    (Number(dg.maintenance_cost) || 0);
  const chargeAmount = (key: string) => Number(charges[key]) || 0;
  const buildingTotal =
    commonTotal + chargeAmount("bwssb") + chargeAmount("security") + dgCost;

  function tenantForUnit(u: Unit): Tenant | undefined {
    return tenants.find((t) =>
      (t.tenant_units ?? []).some((tu) => tu.unit_id === u.id)
    );
  }

  function leaseForUnit(u: Unit): Lease | undefined {
    const tenant = tenantForUnit(u);
    if (!tenant) return undefined;
    return leases.find((l) => l.tenant_id === tenant.id);
  }

  const smallInput = (
    value: string,
    onChange: (v: string) => void,
    width = "w-24"
  ) => (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      disabled={!isAdmin}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className={`${inputCls} ${width} px-2 py-1`}
    />
  );

  function elecRows(meter: Meter, indent = false) {
    const d = elec[meter.id] ?? EMPTY_ELEC;
    const set = (field: keyof ElecDraft) => (v: string) =>
      setElecDraft(meter.id, { [field]: v });
    return (
      <>
        <Row
          indent={indent}
          label="Fixed charges"
          qty={<>{smallInput(d.fixed_kw, set("fixed_kw"), "w-20")} <span className="text-xs text-slate-400">KW</span></>}
          rate={<>₹ {smallInput(d.fixed_rate, set("fixed_rate"), "w-20")} <span className="text-xs text-slate-400">/KW</span></>}
          amount={formatINR((Number(d.fixed_kw) || 0) * (Number(d.fixed_rate) || 0))}
        />
        <Row
          indent={indent}
          label="Energy charges"
          qty={<>{smallInput(d.energy_kwh, set("energy_kwh"), "w-20")} <span className="text-xs text-slate-400">KWh</span></>}
          rate={<>₹ {smallInput(d.energy_rate, set("energy_rate"), "w-20")} <span className="text-xs text-slate-400">/KWh</span></>}
          amount={formatINR((Number(d.energy_kwh) || 0) * (Number(d.energy_rate) || 0))}
        />
        <Row
          indent={indent}
          label="Fuel cost adjustment charges"
          qty={<>{smallInput(d.fca_kwh, set("fca_kwh"), "w-20")} <span className="text-xs text-slate-400">KWh</span></>}
          rate={<>₹ {smallInput(d.fca_rate, set("fca_rate"), "w-20")} <span className="text-xs text-slate-400">/KWh</span></>}
          amount={formatINR((Number(d.fca_kwh) || 0) * (Number(d.fca_rate) || 0))}
        />
        <Row
          indent={indent}
          label="Tax"
          amount={<>₹ {smallInput(d.tax_amount, set("tax_amount"))}</>}
        />
        <Row
          indent={indent}
          label="P&G surcharge"
          amount={<>₹ {smallInput(d.png_surcharge, set("png_surcharge"))}</>}
        />
      </>
    );
  }

  if (!isAdmin) {
    return (
      <div>
        <PageTitle>Monthly Bills</PageTitle>
        <AccessDenied />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageTitle sub="Monthly costs entered and split floor by floor">
        Monthly Bills
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
        {isAdmin && (
          <Button onClick={saveAll} disabled={saving}>
            {saving ? "Saving…" : "Save all bills"}
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="secondary" onClick={() => setAll(true)}>
            Expand all
          </Button>
          <Button variant="secondary" onClick={() => setAll(false)}>
            Collapse all
          </Button>
        </div>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {!isAdmin && (
        <Notice kind="success">
          View-only — bills are entered by the admin.
        </Notice>
      )}

      {/* Building-level costs */}
      <CollapsibleCard
        title="Building costs"
        subtitle="Common electricity, sanitary, security & DG — split among floors by rental area"
        amount={formatINR(buildingTotal)}
        meta={formatPeriod(period)}
        open={!!openCards["b"]}
        onToggle={() => toggleCard("b")}
      >
        <BillTable>
          {commonMeter && (
            <>
              <ToggleRow
                label="Common area electricity total"
                detail={openElec["b"] ? "" : "(tap to edit breakdown)"}
                amount={formatINR(commonTotal)}
                open={!!openElec["b"]}
                onToggle={() => toggleElec("b")}
              />
              {openElec["b"] && elecRows(commonMeter, true)}
            </>
          )}
          {CHARGE_LABELS.map(({ key, label }) => (
            <Row
              key={key}
              label={`${label} (split by rental area)`}
              amount={
                <>
                  ₹{" "}
                  {smallInput(charges[key] ?? "", (v) =>
                    setCharges((c) => ({ ...c, [key]: v }))
                  )}
                </>
              }
            />
          ))}
          <Row
            label="DG diesel"
            qty={<>{smallInput(dg.diesel_litres, (v) => setDg((s) => ({ ...s, diesel_litres: v })), "w-20")} <span className="text-xs text-slate-400">L</span></>}
            rate={<>₹ {smallInput(dg.diesel_price_per_litre, (v) => setDg((s) => ({ ...s, diesel_price_per_litre: v })), "w-20")} <span className="text-xs text-slate-400">/L</span></>}
            amount={formatINR(
              (Number(dg.diesel_litres) || 0) *
                (Number(dg.diesel_price_per_litre) || 0)
            )}
          />
          <Row
            label="DG hours of usage"
            qty={<>{smallInput(dg.hours_used, (v) => setDg((s) => ({ ...s, hours_used: v })), "w-20")} <span className="text-xs text-slate-400">hrs</span></>}
            amount="—"
          />
          <Row
            label="DG maintenance"
            amount={<>₹ {smallInput(dg.maintenance_cost, (v) => setDg((s) => ({ ...s, maintenance_cost: v })))}</>}
          />
          <Row label="DG total (fuel for DG set)" amount={formatINR(dgCost)} bold />
        </BillTable>
      </CollapsibleCard>

      {/* One collapsible card per floor */}
      {units.map((unit) => {
        const meter = meters.find(
          (m) => m.kind === "electric" && m.unit_id === unit.id
        );
        const key = String(unit.id);
        const share = unitShare(unit);
        const lease = leaseForUnit(unit);
        const tenant = tenantForUnit(unit);
        const ownElec = meter ? elecTotal(elec[meter.id] ?? EMPTY_ELEC) : 0;
        const commonShare = commonTotal * share;
        const elecGrand = ownElec + commonShare;
        const maintenance = lease
          ? (Number(lease.monthly_rent) * Number(lease.maintenance_percent)) / 100
          : 0;
        const securityShare = chargeAmount("security") * share;
        const waterAmount = Number(floorWater[unit.id]) || 0;
        const sanitaryShare = chargeAmount("bwssb") * share;
        const dgShare = dgCost * share;
        const floorTotal =
          elecGrand + maintenance + securityShare + waterAmount + sanitaryShare + dgShare;
        const pct = `${(share * 100).toFixed(1)}%`;

        return (
          <CollapsibleCard
            key={unit.id}
            title={unit.name}
            subtitle={tenant?.name}
            amount={formatINR(floorTotal)}
            meta={`${unit.area_sqft} sq ft · ${pct}`}
            open={!!openCards[key]}
            onToggle={() => toggleCard(key)}
          >
            <BillTable>
              <ToggleRow
                label="Electricity total"
                detail={
                  openElec[key]
                    ? ""
                    : meter
                      ? "(tap to edit breakdown)"
                      : "(common share only)"
                }
                amount={formatINR(elecGrand)}
                open={!!openElec[key]}
                onToggle={() => toggleElec(key)}
              />
              {openElec[key] && (
                <>
                  {meter && elecRows(meter, true)}
                  <Row
                    indent
                    label={`Common area ele charges (${pct} of ${formatINR(commonTotal)})`}
                    amount={formatINR(commonShare)}
                  />
                </>
              )}
              <Row
                label={
                  lease
                    ? `Maintenance (${lease.maintenance_percent}% of rent ${formatINR(Number(lease.monthly_rent))})`
                    : "Maintenance"
                }
                detail={lease ? undefined : "no active lease"}
                amount={formatINR(maintenance)}
              />
              <Row
                label={`Security (${pct} by area)`}
                amount={formatINR(securityShare)}
              />
              <Row
                label="Water charges (entered for this floor)"
                amount={
                  <>
                    ₹{" "}
                    {smallInput(floorWater[unit.id] ?? "", (v) =>
                      setFloorWater((w) => ({ ...w, [unit.id]: v }))
                    )}
                  </>
                }
              />
              <Row
                label={`Sanitary charges (${pct} by area)`}
                amount={formatINR(sanitaryShare)}
              />
              <Row
                label={`Fuel for DG set (${pct} by area)`}
                amount={formatINR(dgShare)}
              />
              <Row
                label={`Floor total — ${formatPeriod(period)}`}
                amount={formatINR(floorTotal)}
                bold
              />
            </BillTable>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}
