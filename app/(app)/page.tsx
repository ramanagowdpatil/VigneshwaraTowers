"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/RoleProvider";
import { Card, PageTitle, TableWrap, thCls, tdCls } from "@/components/ui";
import {
  currentPeriod,
  formatPeriod,
  formatINR,
  formatDate,
} from "@/lib/utils";

/** The last `n` month periods, oldest first, ending with the current month */
function lastPeriods(n: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`
    );
  }
  return out;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { role } = useRole();
  const period = currentPeriod();

  // Editors work only with meter readings
  useEffect(() => {
    if (role === "editor") router.replace("/readings");
  }, [role, router]);

  const [stats, setStats] = useState({
    claimed: 0,
    received: 0,
    lastReadingDate: null as string | null,
    readingsToday: 0,
    metersCount: 0,
  });
  const [cashflow, setCashflow] = useState<
    { period: string; inflow: number; outflow: number }[]
  >([]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: pays }, { data: lastReading }, { count: todayCount }, { count: meters }] =
        await Promise.all([
          supabase.from("rent_payments").select("rent_claimed, amount_received").eq("period", period),
          supabase
            .from("meter_readings")
            .select("reading_date")
            .order("reading_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("meter_readings")
            .select("*", { count: "exact", head: true })
            .eq("reading_date", today),
          supabase.from("meters").select("*", { count: "exact", head: true }),
        ]);
      setStats({
        claimed: (pays ?? []).reduce((s, p) => s + Number(p.rent_claimed), 0),
        received: (pays ?? []).reduce((s, p) => s + Number(p.amount_received), 0),
        lastReadingDate: lastReading?.reading_date ?? null,
        readingsToday: todayCount ?? 0,
        metersCount: meters ?? 0,
      });
    })();
  }, [supabase, period]);

  // Monthly inflow (rent received) vs outflow (expenses) — admin only
  useEffect(() => {
    if (role !== "admin") return;
    (async () => {
      const periods = lastPeriods(6);
      const from = periods[0];
      const [{ data: inRows }, { data: outRows }] = await Promise.all([
        supabase
          .from("rent_payments")
          .select("amount_received, received_date")
          .not("received_date", "is", null)
          .gte("received_date", from),
        supabase
          .from("expenses")
          .select("amount, expense_date")
          .gte("expense_date", from),
      ]);
      const rows = periods.map((p) => {
        const ym = p.slice(0, 7);
        const inflow = (inRows ?? [])
          .filter((r) => (r.received_date as string).startsWith(ym))
          .reduce((s, r) => s + Number(r.amount_received), 0);
        const outflow = (outRows ?? [])
          .filter((r) => (r.expense_date as string).startsWith(ym))
          .reduce((s, r) => s + Number(r.amount), 0);
        return { period: p, inflow, outflow };
      });
      setCashflow(rows);
    })();
  }, [supabase, role]);

  const tiles = [
    {
      href: "/readings",
      title: "Meter readings",
      desc: `${stats.readingsToday}/${stats.metersCount} meters recorded today · last entry ${formatDate(stats.lastReadingDate)}`,
    },
    {
      href: "/rents",
      title: "Rents & payments",
      desc: `${formatPeriod(period)}: claimed ${formatINR(stats.claimed)} · received ${formatINR(stats.received)}`,
    },
    ...(role === "admin"
      ? [
          {
            href: "/bills",
            title: "Monthly bills",
            desc: "Electricity, water, BWSSB, security & DG",
          },
          {
            href: "/expenses",
            title: "Expenses",
            desc: "BESCOM, BWSSB, diesel, salaries, AMCs & BBMP",
          },
        ]
      : []),
    {
      href: "/invoices",
      title: "Invoices",
      desc: "Monthly invoice per tenant with shared costs",
    },
  ];

  return (
    <div className="space-y-4">
      <PageTitle sub={formatPeriod(period)}>Dashboard</PageTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}>
            <Card>
              <h2 className="font-semibold text-slate-900">{t.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{t.desc}</p>
            </Card>
          </Link>
        ))}
      </div>

      {role === "admin" && (
        <Card title="Cash flow — last 6 months">
          <TableWrap>
            <thead>
              <tr>
                <th className={thCls}>Month</th>
                <th className={`${thCls} text-right`}>Inflow (rent received)</th>
                <th className={`${thCls} text-right`}>Outflow (expenses)</th>
                <th className={`${thCls} text-right`}>Net</th>
              </tr>
            </thead>
            <tbody>
              {cashflow.map((row) => {
                const net = row.inflow - row.outflow;
                return (
                  <tr key={row.period}>
                    <td className={`${tdCls} font-medium`}>
                      {formatPeriod(row.period)}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      {formatINR(row.inflow)}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      {formatINR(row.outflow)}
                    </td>
                    <td
                      className={`${tdCls} text-right font-semibold ${
                        net < 0 ? "text-red-600" : "text-emerald-700"
                      }`}
                    >
                      {formatINR(net)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50">
                <td className={`${tdCls} font-bold`}>Total</td>
                <td className={`${tdCls} text-right font-bold`}>
                  {formatINR(cashflow.reduce((s, r) => s + r.inflow, 0))}
                </td>
                <td className={`${tdCls} text-right font-bold`}>
                  {formatINR(cashflow.reduce((s, r) => s + r.outflow, 0))}
                </td>
                <td
                  className={`${tdCls} text-right font-bold ${
                    cashflow.reduce((s, r) => s + r.inflow - r.outflow, 0) < 0
                      ? "text-red-600"
                      : "text-emerald-700"
                  }`}
                >
                  {formatINR(
                    cashflow.reduce((s, r) => s + r.inflow - r.outflow, 0)
                  )}
                </td>
              </tr>
            </tbody>
          </TableWrap>
          <p className="text-xs text-slate-400 mt-2">
            Inflow counts rent payments by the date they were received.
            Outflow counts expenses by payment date.
          </p>
        </Card>
      )}
    </div>
  );
}
