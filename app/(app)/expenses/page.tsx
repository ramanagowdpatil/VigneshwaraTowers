"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useIsAdmin } from "@/components/RoleProvider";
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
  formatDate,
  formatINR,
  todayISO,
} from "@/lib/utils";
import type { Expense, ExpenseCategory } from "@/lib/types";

const CATEGORIES: {
  key: ExpenseCategory;
  label: string;
  freq: "Monthly" | "Annual" | "Ad hoc";
}[] = [
  { key: "bescom", label: "BESCOM (Electricity)", freq: "Monthly" },
  { key: "bwssb", label: "BWSSB (Water)", freq: "Monthly" },
  { key: "diesel", label: "Diesel", freq: "Ad hoc" },
  { key: "security_salary", label: "Security Salary", freq: "Monthly" },
  { key: "lift_amc", label: "Lift AMC", freq: "Annual" },
  { key: "dg_amc", label: "DG Set AMC", freq: "Annual" },
  { key: "bbmp", label: "BBMP (Property Tax)", freq: "Annual" },
  { key: "other", label: "Others", freq: "Ad hoc" },
];

const catLabel = (key: string) =>
  CATEGORIES.find((c) => c.key === key)?.label ?? key;

/** First day of the month after the given period */
function nextPeriodOf(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export default function ExpensesPage() {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = useIsAdmin();

  const [period, setPeriod] = useState(currentPeriod());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [yearTotals, setYearTotals] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState({
    category: "bescom" as ExpenseCategory,
    bill_date: todayISO(),
    expense_date: todayISO(),
    amount: "",
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0); // resets the file input after save
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const load = useCallback(
    async (p: string) => {
      const [{ data: monthRows }, { data: yearRows }] = await Promise.all([
        supabase
          .from("expenses")
          .select("*")
          .gte("bill_date", p)
          .lt("bill_date", nextPeriodOf(p))
          .order("bill_date", { ascending: false })
          .order("id", { ascending: false }),
        supabase
          .from("expenses")
          .select("category, amount")
          .gte("bill_date", `${p.slice(0, 4)}-01-01`)
          .lt("bill_date", `${Number(p.slice(0, 4)) + 1}-01-01`),
      ]);
      setExpenses((monthRows ?? []) as Expense[]);
      const totals: Record<string, number> = {};
      (yearRows ?? []).forEach((r) => {
        totals[r.category] = (totals[r.category] ?? 0) + Number(r.amount);
      });
      setYearTotals(totals);
    },
    [supabase]
  );

  useEffect(() => {
    if (isAdmin) load(currentPeriod());
  }, [isAdmin, load]);

  async function changeMonth(month: string) {
    const p = monthToPeriod(month);
    setPeriod(p);
    setMsg(null);
    await load(p);
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    let attachmentPath: string | null = null;
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setMsg({ kind: "error", text: "Attachment must be under 10 MB." });
        setSaving(false);
        return;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      attachmentPath = `${draft.category}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("expense-bills")
        .upload(attachmentPath, file);
      if (uploadError) {
        setMsg({ kind: "error", text: `Upload failed: ${uploadError.message}` });
        setSaving(false);
        return;
      }
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("expenses").insert({
      category: draft.category,
      bill_date: draft.bill_date,
      expense_date: draft.expense_date,
      amount: Number(draft.amount) || 0,
      description: draft.description || null,
      attachment_path: attachmentPath,
      created_by: user?.id ?? null,
    });
    if (error) {
      setMsg({ kind: "error", text: error.message });
      setSaving(false);
      return;
    }
    setMsg({ kind: "success", text: "Expense recorded." });
    setDraft((d) => ({ ...d, amount: "", description: "" }));
    setFile(null);
    setFileKey((k) => k + 1);
    setSaving(false);
    await load(period);
  }

  async function viewAttachment(path: string) {
    const { data, error } = await supabase.storage
      .from("expense-bills")
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      setMsg({ kind: "error", text: "Could not open the attachment." });
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  async function deleteExpense(exp: Expense) {
    const ok = window.confirm(
      `Delete this ${catLabel(exp.category)} expense of ${formatINR(Number(exp.amount))}?`
    );
    if (!ok) return;
    setMsg(null);
    if (exp.attachment_path) {
      await supabase.storage.from("expense-bills").remove([exp.attachment_path]);
    }
    const { error } = await supabase.from("expenses").delete().eq("id", exp.id);
    if (error) {
      setMsg({ kind: "error", text: error.message });
      return;
    }
    setMsg({ kind: "success", text: "Expense deleted." });
    await load(period);
  }

  if (!isAdmin) {
    return (
      <div>
        <PageTitle>Expenses</PageTitle>
        <AccessDenied />
      </div>
    );
  }

  const monthTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const year = period.slice(0, 4);
  const yearTotal = Object.values(yearTotals).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-3">
      <PageTitle sub="Building outgoings — BESCOM, BWSSB, salaries, AMCs and more">
        Expenses
      </PageTitle>

      <Card title="Record an expense">
        <form onSubmit={addExpense}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Category">
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    category: e.target.value as ExpenseCategory,
                  }))
                }
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label} — {c.freq}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bill date">
              <input
                type="date"
                required
                value={draft.bill_date}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, bill_date: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Payment date">
              <input
                type="date"
                required
                value={draft.expense_date}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, expense_date: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Amount (₹)">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                required
                min="0.01"
                value={draft.amount}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, amount: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Description (optional)">
              <input
                type="text"
                value={draft.description}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, description: e.target.value }))
                }
                placeholder="e.g. May bill, RR no…"
                className={inputCls}
              />
            </Field>
            <Field label="Bill / attachment (optional)">
              <input
                key={fileKey}
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
            </Field>
          </div>
          <div className="mt-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Add expense"}
            </Button>
          </div>
        </form>
      </Card>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Card
        title={`Expenses — ${formatPeriod(period)}`}
        actions={
          <input
            type="month"
            value={periodToMonth(period)}
            onChange={(e) => changeMonth(e.target.value)}
            className={`${inputCls} w-40`}
          />
        }
      >
        {expenses.length === 0 ? (
          <p className="text-sm text-slate-400">
            No expenses recorded for this month.
          </p>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <th className={thCls}>Category</th>
                <th className={thCls}>Bill date</th>
                <th className={thCls}>Paid on</th>
                <th className={thCls}>Description</th>
                <th className={`${thCls} text-right`}>Amount</th>
                <th className={thCls}>Bill</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td className={`${tdCls} font-medium`}>
                    {catLabel(exp.category)}
                  </td>
                  <td className={tdCls}>{formatDate(exp.bill_date)}</td>
                  <td className={tdCls}>{formatDate(exp.expense_date)}</td>
                  <td className={`${tdCls} !whitespace-normal text-slate-600`}>
                    {exp.description ?? "—"}
                  </td>
                  <td className={`${tdCls} text-right font-medium`}>
                    {formatINR(Number(exp.amount))}
                  </td>
                  <td className={tdCls}>
                    {exp.attachment_path ? (
                      <button
                        onClick={() => viewAttachment(exp.attachment_path!)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800"
                      >
                        View
                      </button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                  <td className={tdCls}>
                    <Button variant="danger" onClick={() => deleteExpense(exp)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50">
                <td className={`${tdCls} font-bold`} colSpan={4}>
                  Total — {formatPeriod(period)}
                </td>
                <td className={`${tdCls} text-right font-bold`}>
                  {formatINR(monthTotal)}
                </td>
                <td className={tdCls} colSpan={2}></td>
              </tr>
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title={`Year ${year} — total by category`}>
        <TableWrap>
          <thead>
            <tr>
              <th className={thCls}>Category</th>
              <th className={thCls}>Frequency</th>
              <th className={`${thCls} text-right`}>Paid in {year}</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((c) => (
              <tr key={c.key}>
                <td className={`${tdCls} font-medium`}>{c.label}</td>
                <td className={`${tdCls} text-xs text-slate-500`}>{c.freq}</td>
                <td className={`${tdCls} text-right`}>
                  {formatINR(yearTotals[c.key] ?? 0)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className={`${tdCls} font-bold`} colSpan={2}>
                Total — {year}
              </td>
              <td className={`${tdCls} text-right font-bold`}>
                {formatINR(yearTotal)}
              </td>
            </tr>
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
