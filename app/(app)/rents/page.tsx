"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsAdmin, useRole } from "@/components/RoleProvider";
import {
  Card,
  PageTitle,
  Field,
  Button,
  Notice,
  AccessDenied,
  TableWrap,
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
  formatDate,
} from "@/lib/utils";
import type { Lease, RentPayment } from "@/lib/types";

const PAYMENT_MODES = ["NEFT", "IMPS", "UPI", "Cheque", "Cash"];

interface PaymentDraft {
  rent_claimed: string;
  claim_date: string;
  gst_amount: string;
  tds_amount: string;
  amount_received: string;
  payment_mode: string;
  received_date: string;
}

export default function RentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = useIsAdmin();
  const { role } = useRole();

  const [leases, setLeases] = useState<Lease[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [payments, setPayments] = useState<Record<number, RentPayment>>({});
  const [drafts, setDrafts] = useState<Record<number, PaymentDraft>>({});
  const [history, setHistory] = useState<RentPayment[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadPayments = useCallback(
    async (leaseList: Lease[], p: string) => {
      const { data } = await supabase
        .from("rent_payments")
        .select("*")
        .eq("period", p);
      const map: Record<number, RentPayment> = {};
      (data ?? []).forEach((r) => (map[r.lease_id] = r));
      setPayments(map);

      const d: Record<number, PaymentDraft> = {};
      leaseList.forEach((l) => {
        const ex = map[l.id];
        d[l.id] = {
          rent_claimed: String(ex?.rent_claimed ?? l.monthly_rent),
          claim_date: ex?.claim_date ?? "",
          gst_amount: String(
            ex?.gst_amount ??
              Math.round(l.monthly_rent * (l.gst_percent / 100) * 100) / 100
          ),
          tds_amount: String(
            ex?.tds_amount ??
              Math.round(l.monthly_rent * (l.tds_percent / 100) * 100) / 100
          ),
          amount_received: String(ex?.amount_received ?? ""),
          payment_mode: ex?.payment_mode ?? "",
          received_date: ex?.received_date ?? "",
        };
      });
      setDrafts(d);
    },
    [supabase]
  );

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("rent_payments")
      .select("*, leases(id, tenant_id, monthly_rent, tenants(name))")
      .order("period", { ascending: false })
      .limit(60);
    setHistory((data ?? []) as RentPayment[]);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("leases")
        .select("*, tenants(id, name, is_owner_occupied, active)")
        .eq("active", true)
        .order("id");
      // Owner-occupied floors (Anugiri Dental) are not rent-tracked
      const list = ((data ?? []) as Lease[]).filter(
        (l) => !l.tenants?.is_owner_occupied
      );
      setLeases(list);
      await loadPayments(list, currentPeriod());
      await loadHistory();
    })();
  }, [supabase, loadPayments, loadHistory]);

  async function changeMonth(month: string) {
    const p = monthToPeriod(month);
    setPeriod(p);
    setMsg(null);
    await loadPayments(leases, p);
  }

  function setDraft(leaseId: number, patch: Partial<PaymentDraft>) {
    setDrafts((d) => ({ ...d, [leaseId]: { ...d[leaseId], ...patch } }));
  }

  async function save(lease: Lease) {
    const d = drafts[lease.id];
    setSaving(lease.id);
    setMsg(null);
    const row = {
      lease_id: lease.id,
      period,
      rent_claimed: Number(d.rent_claimed) || 0,
      claim_date: d.claim_date || null,
      gst_amount: Number(d.gst_amount) || 0,
      tds_amount: Number(d.tds_amount) || 0,
      amount_received: Number(d.amount_received) || 0,
      payment_mode: d.payment_mode || null,
      received_date: d.received_date || null,
    };
    const { error } = await supabase
      .from("rent_payments")
      .upsert(row, { onConflict: "lease_id,period" });
    if (error) {
      setMsg({ kind: "error", text: error.message });
    } else {
      setMsg({
        kind: "success",
        text: `Saved rent entry for ${lease.tenants?.name} — ${formatPeriod(period)}.`,
      });
      await loadPayments(leases, period);
      await loadHistory();
    }
    setSaving(null);
  }

  if (role === "editor") {
    return (
      <div>
        <PageTitle>Rents & Payments</PageTitle>
        <AccessDenied />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageTitle sub="Monthly rent claims and payments received">
        Rents & Payments
      </PageTitle>

      <div className="max-w-xs">
        <Field label="Month">
          <input
            type="month"
            value={periodToMonth(period)}
            onChange={(e) => changeMonth(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      {leases.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">
            No active leases yet. {isAdmin ? "Add tenants and leases under Setup." : ""}
          </p>
        </Card>
      )}

      {leases.map((lease) => {
        const d = drafts[lease.id];
        const paid = payments[lease.id];
        if (!d) return null;
        return (
          <Card
            key={lease.id}
            title={`${lease.tenants?.name} — ${formatPeriod(period)}`}
            actions={
              paid ? (
                <span
                  className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                    Number(paid.amount_received) > 0
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {Number(paid.amount_received) > 0 ? "Received" : "Pending"}
                </span>
              ) : (
                <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-slate-100 text-slate-500">
                  No entry
                </span>
              )
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <Field label="Rent claimed (₹)">
                <input
                  type="number"
                  inputMode="decimal"
                  disabled={!isAdmin}
                  value={d.rent_claimed}
                  onChange={(e) => setDraft(lease.id, { rent_claimed: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Claim date">
                <input
                  type="date"
                  disabled={!isAdmin}
                  value={d.claim_date}
                  onChange={(e) => setDraft(lease.id, { claim_date: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label={`GST (₹, ${lease.gst_percent}%)`}>
                <input
                  type="number"
                  inputMode="decimal"
                  disabled={!isAdmin}
                  value={d.gst_amount}
                  onChange={(e) => setDraft(lease.id, { gst_amount: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label={`TDS cut (₹, ${lease.tds_percent}%)`}>
                <input
                  type="number"
                  inputMode="decimal"
                  disabled={!isAdmin}
                  value={d.tds_amount}
                  onChange={(e) => setDraft(lease.id, { tds_amount: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Amount received (₹)">
                <input
                  type="number"
                  inputMode="decimal"
                  disabled={!isAdmin}
                  value={d.amount_received}
                  onChange={(e) => setDraft(lease.id, { amount_received: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Payment mode">
                <select
                  disabled={!isAdmin}
                  value={d.payment_mode}
                  onChange={(e) => setDraft(lease.id, { payment_mode: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Received date">
                <input
                  type="date"
                  disabled={!isAdmin}
                  value={d.received_date}
                  onChange={(e) => setDraft(lease.id, { received_date: e.target.value })}
                  className={inputCls}
                />
              </Field>
              {isAdmin && (
                <div className="flex items-end">
                  <Button onClick={() => save(lease)} disabled={saving === lease.id}>
                    {saving === lease.id ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      <Card title="Payment history">
        {history.length === 0 ? (
          <p className="text-sm text-slate-400">No rent entries yet.</p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className={thCls}>Month</th>
                <th className={thCls}>Tenant</th>
                <th className={thCls}>Claimed</th>
                <th className={thCls}>Claim date</th>
                <th className={thCls}>GST</th>
                <th className={thCls}>TDS</th>
                <th className={thCls}>Received</th>
                <th className={thCls}>Mode</th>
                <th className={thCls}>Received on</th>
              </tr>
            </thead>
            <tbody>
              {history.map((p) => (
                <tr key={p.id}>
                  <td className={`${tdCls} font-medium`}>{formatPeriod(p.period)}</td>
                  <td className={tdCls}>{p.leases?.tenants?.name}</td>
                  <td className={tdCls}>{formatINR(Number(p.rent_claimed))}</td>
                  <td className={tdCls}>{formatDate(p.claim_date)}</td>
                  <td className={tdCls}>{formatINR(Number(p.gst_amount))}</td>
                  <td className={tdCls}>{formatINR(Number(p.tds_amount))}</td>
                  <td className={tdCls}>{formatINR(Number(p.amount_received))}</td>
                  <td className={tdCls}>{p.payment_mode ?? "—"}</td>
                  <td className={tdCls}>{formatDate(p.received_date)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
