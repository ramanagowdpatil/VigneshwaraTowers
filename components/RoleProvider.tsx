"use client";

import { createContext, useContext } from "react";
import type { UserRole } from "@/lib/types";

interface RoleContextValue {
  role: UserRole;
  fullName: string;
  /** Tenants a viewer account is allowed to see (empty = admin/editor) */
  tenantIds: number[];
}

const RoleContext = createContext<RoleContextValue>({
  role: "viewer",
  fullName: "",
  tenantIds: [],
});

export function RoleProvider({
  role,
  fullName,
  tenantIds,
  children,
}: RoleContextValue & { children: React.ReactNode }) {
  return (
    <RoleContext.Provider value={{ role, fullName, tenantIds }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}

export function useCanEditReadings() {
  const { role } = useRole();
  return role === "admin" || role === "editor";
}

export function useIsAdmin() {
  const { role } = useRole();
  return role === "admin";
}
