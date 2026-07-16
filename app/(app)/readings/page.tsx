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
import { todayISO, formatDate } from "@/lib/utils";
import type { Meter, MeterReading } from "@/lib/types";

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
    })();
  }, [supabase, loadForDate, loadRecent, role, tenantIds]);

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
