import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell, type AppView } from "./components/AppShell";
import { AppProviders } from "./AppProviders";
import { AuthGuard } from "./features/auth/AuthGuard";
import { DashboardOverview } from "./features/dashboard/DashboardOverview";
import { ModpackSection } from "./features/modpack/ModpackSection";
import { ModManagementSection } from "./features/mods/ModManagementSection";
import { UploadSection } from "./features/upload/UploadSection";
import { InstancesSection } from "./features/instances/InstancesSection";
import { MaintenanceSection } from "./features/maintenance/MaintenanceSection";
import { ApiLinksSection } from "./features/apiLinks/ApiLinksSection";
import { CrashesSection } from "./features/crashes/CrashesSection";
import { queryClient } from "./lib/queryClient";

function AdminPanel() {
  const [view, setView] = useState<AppView>("dashboard");

  return (
    <AuthGuard>
      <AppShell activeView={view} onNavigate={setView}>
        {view === "dashboard" ? <DashboardOverview onNavigate={setView} /> : null}
        {view === "instances" ? <InstancesSection /> : null}
        {view === "modpack" ? (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <ModpackSection />
            <aside className="space-y-5">
              <UploadSection />
              <ModManagementSection />
            </aside>
          </div>
        ) : null}
        {view === "crashes" ? <CrashesSection /> : null}
        {view === "maintenance" ? <MaintenanceSection /> : null}
        {view === "api" ? <ApiLinksSection /> : null}
      </AppShell>
    </AuthGuard>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProviders>
        <AdminPanel />
      </AppProviders>
    </QueryClientProvider>
  );
}
