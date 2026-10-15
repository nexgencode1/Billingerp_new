"use client";

import { createContext, useContext } from "react";

// The role's permission map ({ MODULE: [ACTIONS] }) from /api/auth/me, made available to client
// pages so they can hide buttons the user can't use. UX only — the backend's [RequirePermission]
// is the real security boundary.
const PermissionsContext = createContext<Record<string, string[]>>({});

export function PermissionsProvider({ permissions, children }: { permissions: Record<string, string[]>; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>;
}

export function useCan(module: string, action: string): boolean {
  return useContext(PermissionsContext)[module]?.includes(action) ?? false;
}

export function usePermissionMap(): Record<string, string[]> {
  return useContext(PermissionsContext);
}
