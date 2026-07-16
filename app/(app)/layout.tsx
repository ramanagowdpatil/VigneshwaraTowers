import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleProvider } from "@/components/RoleProvider";
import Nav from "@/components/Nav";
import type { UserRole } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: profileTenants }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profile_tenants")
      .select("tenant_id")
      .eq("profile_id", user.id),
  ]);

  const role = (profile?.role ?? "viewer") as UserRole;
  const fullName = profile?.full_name ?? user.email ?? "";
  const tenantIds = (profileTenants ?? []).map((t) => t.tenant_id as number);

  return (
    <RoleProvider role={role} fullName={fullName} tenantIds={tenantIds}>
      <Nav />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 print:max-w-none print:p-0">
        {children}
      </main>
    </RoleProvider>
  );
}
