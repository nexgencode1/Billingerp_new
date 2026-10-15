import { redirect } from "next/navigation";
import { serverApiGet } from "@/lib/serverApi";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { ToastContainer } from "@/components/common/Toast";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { TourAutoStart } from "@/components/tour/TourAutoStart";
import { OfflineManager } from "@/components/offline/OfflineManager";
import { PermissionsProvider } from "@/lib/permissions-context";
import type { SessionPayload } from "@/types/auth";

interface MeResponse {
  session: SessionPayload;
  permissions: Record<string, string[]>;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await serverApiGet<MeResponse>("/api/auth/me");
  if (!me) redirect("/login");
  const { session, permissions } = me;

  return (
    <PermissionsProvider permissions={permissions}>
    <div className="flex h-screen overflow-hidden">
      <Sidebar permissions={permissions} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header session={session} />
        <main className="print-area flex-1 overflow-y-auto bg-slate-50 p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>
      <MobileNav permissions={permissions} />
      <ToastContainer />
      <TourOverlay />
      <TourAutoStart />
      <OfflineManager />
    </div>
    </PermissionsProvider>
  );
}
