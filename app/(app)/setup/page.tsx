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
  TableWrap,
  inputCls,
  thCls,
  tdCls,
} from "@/components/ui";
import { formatINR, formatDate } from "@/lib/utils";
import type { Unit, Tenant, Lease, Profile, UserRole } from "@/lib/types";

export default function SetupPage() {
  const supabase = useMemo(() => createClient(), []);
  const isAdmin = useIsAdmin();

  const [units, setUnits] = useState<Unit[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileTenants, setProfileTenants] = useState<
    { profile_id: string; tenant_id: number }[]
  >([]);
  const [areaDrafts, setAreaDrafts] = useState<Record<number, string>>({});
  const [addressDrafts, setAddressDrafts] = useState<Record<number, string>>({});
  const EMPTY_LEASE = {
    tenant_id: "",
    monthly_rent: "",
    advance_amount: "",
    advance_paid_date: "",
    start_date: "",
    end_date: "",
    gst_percent: "18",
    tds_percent: "10",
    maintenance_percent: "5",
  };
  const [leaseDraft, setLeaseDraft] = useState(EMPTY_LEASE);
  const [editingLeaseId, setEditingLeaseId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    const [u, t, l, p, pt] = await Promise.all([
      supabase.from("units").select("*").order("sort_order"),
      supabase
        .from("tenants")
        .select("*, tenant_units(unit_id)")
        .order("id"),
      supabase
        .from("leases")
        .select("*, tenants(name)")
        .order("id"),
      supabase.from("profiles").select("*").order("created_at"),
      supabase.from("profile_tenants").select("*"),
    ]);
    const unitList = (u.data ?? []) as Unit[];
    setUnits(unitList);
    setAreaDrafts(
      Object.fromEntries(unitList.map((x) => [x.id, String(x.area_sqft)]))
    );
    const tenantList = (t.data ?? []) as Tenant[];
    setTenants(tenantList);
    setAddressDrafts(
      Object.fromEntries(tenantList.map((x) => [x.id, x.address ?? ""]))
    );
    setLeases((l.data ?? []) as Lease[]);
    setProfiles((p.data ?? []) as Profile[]);
    setProfileTenants(
      (pt.data ?? []) as { profile_id: string; tenant_id: number }[]
    );
  }, [supabase]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function saveAreas() {
    setMsg(null);
    for (const u of units) {
      const { error } = await supabase
        .from("units")
        .update({ area_sqft: Number(areaDrafts[u.id]) || 0 })
        .eq("id", u.id);
      if (error) {
        setMsg({ kind: "error", text: error.message });
        return;
      }
    }
    setMsg({ kind: "success", text: "Rental areas updated." });
    await loadAll();
  }

  async function saveAddresses() {
    setMsg(null);
    for (const t of tenants) {
      const draft = addressDrafts[t.id] ?? "";
      if (draft === (t.address ?? "")) continue;
      const { error } = await supabase
        .from("tenants")
        .update({ address: draft || null })
        .eq("id", t.id);
      if (error) {
        setMsg({ kind: "error", text: error.message });
        return;
      }
    }
    setMsg({ kind: "success", text: "Tenant addresses updated." });
    await loadAll();
  }

  async function saveLease(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const row = {
      tenant_id: Number(leaseDraft.tenant_id),
      monthly_rent: Number(leaseDraft.monthly_rent) || 0,
      advance_amount: Number(leaseDraft.advance_amount) || 0,
      advance_paid_date: leaseDraft.advance_paid_date || null,
      start_date: leaseDraft.start_date,
      end_date: leaseDraft.end_date || null,
      gst_percent: Number(leaseDraft.gst_percent) || 0,
      tds_percent: Number(leaseDraft.tds_percent) || 0,
      maintenance_percent: Number(leaseDraft.maintenance_percent) || 0,
    };
    const { error } = editingLeaseId
      ? await supabase.from("leases").update(row).eq("id", editingLeaseId)
      : await supabase.from("leases").insert(row);
    if (error) {
      setMsg({ kind: "error", text: error.message });
      return;
    }
    setMsg({
      kind: "success",
      text: editingLeaseId ? "Lease updated." : "Lease added.",
    });
    cancelEdit();
    await loadAll();
  }

  function startEdit(lease: Lease) {
    setEditingLeaseId(lease.id);
    setLeaseDraft({
      tenant_id: String(lease.tenant_id),
      monthly_rent: String(lease.monthly_rent),
      advance_amount: String(lease.advance_amount),
      advance_paid_date: lease.advance_paid_date ?? "",
      start_date: lease.start_date,
      end_date: lease.end_date ?? "",
      gst_percent: String(lease.gst_percent),
      tds_percent: String(lease.tds_percent),
      maintenance_percent: String(lease.maintenance_percent),
    });
    setMsg(null);
  }

  function cancelEdit() {
    setEditingLeaseId(null);
    setLeaseDraft(EMPTY_LEASE);
  }

  async function deleteLease(lease: Lease) {
    const ok = window.confirm(
      `Delete the lease for ${lease.tenants?.name}? This also deletes all rent entries recorded against it.`
    );
    if (!ok) return;
    setMsg(null);
    const { error } = await supabase.from("leases").delete().eq("id", lease.id);
    if (error) {
      setMsg({ kind: "error", text: error.message });
      return;
    }
    if (editingLeaseId === lease.id) cancelEdit();
    setMsg({ kind: "success", text: "Lease deleted." });
    await loadAll();
  }

  async function toggleLease(lease: Lease) {
    await supabase
      .from("leases")
      .update({ active: !lease.active })
      .eq("id", lease.id);
    await loadAll();
  }

  async function toggleProfileTenant(
    profileId: string,
    tenantId: number,
    assign: boolean
  ) {
    setMsg(null);
    const { error } = assign
      ? await supabase
          .from("profile_tenants")
          .insert({ profile_id: profileId, tenant_id: tenantId })
      : await supabase
          .from("profile_tenants")
          .delete()
          .eq("profile_id", profileId)
          .eq("tenant_id", tenantId);
    if (error) setMsg({ kind: "error", text: error.message });
    await loadAll();
  }

  async function changeRole(profileId: string, role: UserRole) {
    setMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", profileId);
    if (error) setMsg({ kind: "error", text: error.message });
    else setMsg({ kind: "success", text: "Role updated." });
    await loadAll();
  }

  if (!isAdmin) {
    return (
      <div>
        <PageTitle>Setup</PageTitle>
        <Card>
          <p className="text-sm text-slate-500">
            Setup is available to the administrator only.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageTitle sub="Rental areas, tenants, leases and user access">
        Setup
      </PageTitle>

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Card
        title="Floors & rental area"
        actions={<Button onClick={saveAreas}>Save areas</Button>}
      >
        <p className="text-xs text-slate-400 mb-3">
          Rental area (sq ft) drives the split of common electricity, water,
          BWSSB, security and DG costs among tenants.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {units.map((u) => (
            <Field key={u.id} label={`${u.name} (${u.code})`}>
              <input
                type="number"
                inputMode="decimal"
                value={areaDrafts[u.id] ?? ""}
                onChange={(e) =>
                  setAreaDrafts((d) => ({ ...d, [u.id]: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card
        title="Tenants"
        actions={<Button onClick={saveAddresses}>Save addresses</Button>}
      >
        <TableWrap>
          <thead>
            <tr>
              <th className={thCls}>Tenant</th>
              <th className={thCls}>Floors</th>
              <th className={thCls}>Rent tracked</th>
              <th className={thCls}>Address (shown on invoice)</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td className={`${tdCls} font-medium`}>{t.name}</td>
                <td className={tdCls}>
                  {(t.tenant_units ?? [])
                    .map(
                      (tu) => units.find((u) => u.id === tu.unit_id)?.code
                    )
                    .filter(Boolean)
                    .join(", ")}
                </td>
                <td className={tdCls}>
                  {t.is_owner_occupied ? "No (own premises)" : "Yes"}
                </td>
                <td className={tdCls}>
                  <input
                    type="text"
                    value={addressDrafts[t.id] ?? ""}
                    placeholder="e.g. Vigneshwara Towers, 12th Main, Bengaluru 560001"
                    onChange={(e) =>
                      setAddressDrafts((d) => ({
                        ...d,
                        [t.id]: e.target.value,
                      }))
                    }
                    className={`${inputCls} min-w-72`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card title="Leases">
        <TableWrap>
          <thead>
            <tr>
              <th className={thCls}>Tenant</th>
              <th className={thCls}>Monthly rent</th>
              <th className={thCls}>Advance</th>
              <th className={thCls}>Start</th>
              <th className={thCls}>End</th>
              <th className={thCls}>GST %</th>
              <th className={thCls}>TDS %</th>
              <th className={thCls}>Maint %</th>
              <th className={thCls}>Status</th>
              <th className={thCls}></th>
            </tr>
          </thead>
          <tbody>
            {leases.map((l) => (
              <tr key={l.id}>
                <td className={`${tdCls} font-medium`}>{l.tenants?.name}</td>
                <td className={tdCls}>{formatINR(Number(l.monthly_rent))}</td>
                <td className={tdCls}>{formatINR(Number(l.advance_amount))}</td>
                <td className={tdCls}>{formatDate(l.start_date)}</td>
                <td className={tdCls}>{formatDate(l.end_date)}</td>
                <td className={tdCls}>{l.gst_percent}</td>
                <td className={tdCls}>{l.tds_percent}</td>
                <td className={tdCls}>{l.maintenance_percent}</td>
                <td className={tdCls}>{l.active ? "Active" : "Ended"}</td>
                <td className={tdCls}>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => startEdit(l)}>
                      Edit
                    </Button>
                    <Button variant="secondary" onClick={() => toggleLease(l)}>
                      {l.active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="danger" onClick={() => deleteLease(l)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>

        <form
          onSubmit={saveLease}
          className="mt-4 border-t border-slate-100 pt-4"
        >
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            {editingLeaseId
              ? `Edit lease — ${
                  tenants.find((t) => String(t.id) === leaseDraft.tenant_id)
                    ?.name ?? ""
                }`
              : "Add lease"}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Field label="Tenant">
              <select
                required
                value={leaseDraft.tenant_id}
                onChange={(e) =>
                  setLeaseDraft((d) => ({ ...d, tenant_id: e.target.value }))
                }
                className={inputCls}
              >
                <option value="">Select…</option>
                {tenants
                  .filter((t) => !t.is_owner_occupied)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Monthly rent (₹)">
              <input type="number" inputMode="decimal" required value={leaseDraft.monthly_rent}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, monthly_rent: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Advance (₹)">
              <input type="number" inputMode="decimal" value={leaseDraft.advance_amount}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, advance_amount: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Advance paid on">
              <input type="date" value={leaseDraft.advance_paid_date}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, advance_paid_date: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Rent start date">
              <input type="date" required value={leaseDraft.start_date}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, start_date: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Rent end date">
              <input type="date" value={leaseDraft.end_date}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, end_date: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="GST %">
              <input type="number" inputMode="decimal" value={leaseDraft.gst_percent}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, gst_percent: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="TDS %">
              <input type="number" inputMode="decimal" value={leaseDraft.tds_percent}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, tds_percent: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Maintenance %">
              <input type="number" inputMode="decimal" value={leaseDraft.maintenance_percent}
                onChange={(e) => setLeaseDraft((d) => ({ ...d, maintenance_percent: e.target.value }))} className={inputCls} />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit">
                {editingLeaseId ? "Update lease" : "Add lease"}
              </Button>
              {editingLeaseId && (
                <Button type="button" variant="secondary" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </form>
      </Card>

      <Card title="Users & roles">
        <p className="text-xs text-slate-400 mb-3">
          Create users in the Supabase dashboard (Authentication → Users →
          Invite). They appear here after first sign-in, where you can assign a
          role: <b>admin</b> (full access), <b>editor</b> (daily meter
          readings), <b>viewer</b> (reports only).
        </p>
        <TableWrap>
          <thead>
            <tr>
              <th className={thCls}>Name</th>
              <th className={thCls}>Role</th>
              <th className={thCls}>Visible tenants (viewer only)</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td className={`${tdCls} font-medium`}>{p.full_name}</td>
                <td className={tdCls}>
                  <select
                    value={p.role}
                    onChange={(e) =>
                      changeRole(p.id, e.target.value as UserRole)
                    }
                    className={inputCls}
                  >
                    <option value="admin">admin</option>
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                </td>
                <td className={`${tdCls} !whitespace-normal`}>
                  {p.role === "viewer" ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {tenants
                        .filter((t) => t.active)
                        .map((t) => {
                          const assigned = profileTenants.some(
                            (pt) =>
                              pt.profile_id === p.id && pt.tenant_id === t.id
                          );
                          return (
                            <label
                              key={t.id}
                              className="flex items-center gap-1 text-xs text-slate-600"
                            >
                              <input
                                type="checkbox"
                                checked={assigned}
                                onChange={(e) =>
                                  toggleProfileTenant(
                                    p.id,
                                    t.id,
                                    e.target.checked
                                  )
                                }
                              />
                              {t.name}
                            </label>
                          );
                        })}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">
                      full data access
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </div>
  );
}
