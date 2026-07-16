"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCanEditReadings, useRole } from "@/components/RoleProvider";
import {
  Card,
  PageTitle,
  Field,
  Button,
  Notice,
  TableWrap,
  inputCls,
  thCls,
  tdCls,
} from "@/components/ui";
import {
  todayISO,
  formatDate,
  currentPeriod,
  monthToPeriod,
  periodToMonth,
  formatPeriod,
} from "@/lib/utils";
import type { Meter, MeterReading } from "@/lib/types";

/** First day of the month after the given period ("2026-07-01" -> "2026-08-01") */
function nextPeriodOf(p: string): string {
  const [y, m] = p.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

const KIND_LABEL: Record<string, string> = {
  electric: "Electricity meters (KWh)",
  water: "Water meters",
  dg: "Generator (DG) meter",
};

export default function ReadingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const canEdit = useCanEditReadings();
  const { role, tenantIds } = useRole();

  const [meters, setMeters] = useState<Meter[]>([]);
  const [date, setDate] = useState(todayISO());
  const [values, setValues] = useState<Record<number, string>>({});
  const [previous, setPrevious] = useState<Record<number, MeterReading>>({});
  const [recent, setRecent] = useState<MeterReading[]>([]);
  // Monthly consumption: reading on 1st of next month minus 1st of this month
  const [consMonth, setConsMonth] = useState(currentPeriod());
  const [consReadings, setConsReadings] = useState<
    Record<number, { start?: number; end?: number }>
  >({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadForDate = useCallback(
    async (meterList: Meter[], d: string) => {
      // Existing readings on the selected date
      const { data: existing } = await supabase
        .from("meter_readings")
        .select("*")
        .eq("reading_date", d);
      const vals: Record<number, string> = {};
      (existing ?? []).forEach((r) => {
        vals[r.meter_id] = String(r.reading);
      });
      setValues(vals);

      // Most recent reading before the selected date, per meter
      const prev: Record<number, MeterReading> = {};
      const { data: prevRows } = await supabase
        .from("meter_readings")
        .select("*")
        .lt("reading_date", d)
        .order("reading_date", { ascending: false })
        .limit(meterList.length * 5);
      (prevRows ?? []).forEach((r) => {
        if (!prev[r.meter_id]) prev[r.meter_id] = r;
      });
      setPrevious(prev);
    },
    [supabase]
  );

  const loadConsumption = useCallback(
    async (p: string) => {
      const d1 = p;
      const d2 = nextPeriodOf(p);
      const { data } = await supabase
        .from("meter_readings")
        .select("meter_id, reading_date, reading")
        .in("reading_date", [d1, d2]);
      const map: Record<number, { start?: number; end?: number }> = {};
      (data ?? []).forEach((r) => {
        map[r.meter_id] ??= {};
        if (r.reading_date === d1) map[r.meter_id].start = Number(r.reading);
        else map[r.meter_id].end = Number(r.reading);
      });
      setConsReadings(map);
    },
    [supabase]
  );

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from("meter_readings")
      .select("*, meters(code, name, sort_order)")
      .order("reading_date", { ascending: false })
      .limit(120);
    setRecent((data ?? []) as MeterReading[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("meters")
        .select("*")
        .order("sort_order");
      let list = (data ?? []) as Meter[];
      // Viewers only see the meters of their assigned floors
      if (role === "viewer") {
        const { data: tu } = await supabase
          .from("tenant_units")
          .select("unit_id")
          .in("tenant_id", tenantIds.length > 0 ? tenantIds : [-1]);
        const unitIds = (tu ?? []).map((x) => x.unit_id as number);
        list = list.filter(
          (m) => m.unit_id != null && unitIds.includes(m.unit_id)
        );
      }
      setMeters(list);
      await loadForDate(list, todayISO());
      await loadRecent();
      await loadConsumption(currentPeriod());
    })();
  }, [supabase, loadForDate, loadRecent, loadConsumption, role, tenantIds]);

  async function changeConsMonth(month: string) {
    const p = monthToPeriod(month);
    setConsMonth(p);
    await loadConsumption(p);
  }

  async function changeDate(d: string) {
    setDate(d);
    setMsg(null);
    await loadForDate(meters, d);
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const rows = meters
      .filter((m) => values[m.id] !== undefined && values[m.id] !== "")
      .map((m) => ({
        meter_id: m.id,
        reading_date: date,
        reading: Number(values[m.id]),
      }));
    if (rows.length === 0) {
      setMsg({ kind: "error", text: "Enter at least one reading." });
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("meter_readings")
      .upsert(rows, { onConflict: "meter_id,reading_date" });
    if (error) {
      setMsg({ kind: "error", text: error.message });
    } else {
      setMsg({ kind: "success", text: `Saved ${rows.length} reading(s) for ${formatDate(date)}.` });
      await loadRecent();
      await loadForDate(meters, date);
      await loadConsumption(consMonth);
    }
    setSaving(false);
  }

  // Group recent readings by date for the report table
  const recentDates = Array.from(
    new Set(recent.map((r) => r.reading_date))
  ).slice(0, 8);
  const byDateMeter: Record<string, Record<number, number>> = {};
  recent.forEach((r) => {
    byDateMeter[r.reading_date] ??= {};
    byDateMeter[r.reading_date][r.meter_id] = Number(r.reading);
  });

  const kinds = ["electric", "water", "dg"] as const;

  return (
    <div className="space-y-3">
      <PageTitle sub="Daily meter readings — all floors, water and generator">
        Meter Readings
      </PageTitle>

      <Card title="Enter readings">
        <div className="max-w-xs mb-4">
          <Field label="Reading date">
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => changeDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        {kinds.map((kind) => {
          const group = meters.filter((m) => m.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="mb-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">
                {KIND_LABEL[kind]}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.map((m) => {
                  const prev = previous[m.id];
                  return (
                    <Field key={m.id} label={m.name}>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        disabled={!canEdit}
                        value={values[m.id] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [m.id]: e.target.value }))
                        }
                        placeholder={
                          prev
                            ? `Prev ${formatDate(prev.reading_date)}: ${prev.reading}`
                            : "No previous reading"
                        }
                        className={inputCls}
                      />
                    </Field>
                  );
                })}
              </div>
            </div>
          );
        })}

        {msg && <div className="mb-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}

        {canEdit ? (
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save readings"}
          </Button>
        ) : (
          <p className="text-sm text-slate-400">
            You have view-only access. Readings can be entered by the editor or admin.
          </p>
        )}
      </Card>

      <Card title="Monthly consumption">
        <div className="max-w-xs mb-3">
          <Field label="Month">
            <input
              type="month"
              value={periodToMonth(consMonth)}
              onChange={(e) => changeConsMonth(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <TableWrap>
          <thead>
            <tr>
              <th className={thCls}>Meter</th>
              <th className={thCls}>
                Reading on {formatDate(consMonth)}
              </th>
              <th className={thCls}>
                Reading on {formatDate(nextPeriodOf(consMonth))}
              </th>
              <th className={`${thCls} text-right`}>
                Consumption — {formatPeriod(consMonth)}
              </th>
            </tr>
          </thead>
          <tbody>
            {meters.map((m) => {
              const r = consReadings[m.id] ?? {};
              const hasBoth = r.start !== undefined && r.end !== undefined;
              const diff = hasBoth ? (r.end as number) - (r.start as number) : null;
              return (
                <tr key={m.id}>
                  <td className={`${tdCls} font-medium`}>
                    {m.name}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {m.kind === "electric" ? "kWh" : m.kind === "dg" ? "hrs/kWh" : ""}
                    </span>
                  </td>
                  <td className={tdCls}>
                    {r.start !== undefined ? (
                      r.start.toLocaleString("en-IN")
                    ) : (
                      <span className="text-xs text-slate-400">not recorded</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {r.end !== undefined ? (
                      r.end.toLocaleString("en-IN")
                    ) : (
                      <span className="text-xs text-slate-400">not recorded</span>
                    )}
                  </td>
                  <td
                    className={`${tdCls} text-right font-semibold ${
                      diff !== null && diff < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {diff !== null
                      ? diff.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        <p className="text-xs text-slate-400 mt-2">
          Consumption for a month = reading on the 1st of the next month minus
          reading on the 1st of that month. A negative value usually means a
          reading was entered incorrectly.
        </p>
      </Card>

      <Card title="Recent readings">
        {recentDates.length === 0 ? (
          <p className="text-sm text-slate-400">No readings recorded yet.</p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className={thCls}>Date</th>
                {meters.map((m) => (
                  <th key={m.id} className={thCls}>
                    {m.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentDates.map((d) => (
                <tr key={d}>
                  <td className={`${tdCls} font-medium`}>{formatDate(d)}</td>
                  {meters.map((m) => (
                    <td key={m.id} className={tdCls}>
                      {byDateMeter[d]?.[m.id] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <p className="text-xs text-slate-400 mt-2">
          Showing the last {recentDates.length} recorded days across all meters.
        </p>
      </Card>
    </div>
  );
}
