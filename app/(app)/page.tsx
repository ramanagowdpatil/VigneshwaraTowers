"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRole } from "@/components/RoleProvider";
import { Card, PageTitle } from "@/components/ui";
import {
  currentPeriod,
  formatPeriod,
  formatINR,
  formatDate,
} from "@/lib/utils";

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
        ]
      : []),
    {
      href: "/invoices",
      title: "Invoices",
      desc: "Monthly invoice per tenant with shared costs",
    },
  ];

  return (
    <div>
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
    </div>
  );
}
