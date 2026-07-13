import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/AppShell";
import { AppProviders } from "./AppProviders";
import { AuthGuard } from "./features/auth/AuthGuard";
import { ModpackSection } from "./features/modpack/ModpackSection";
import { ModManagementSection } from "./features/mods/ModManagementSection";
import { UploadSection } from "./features/upload/UploadSection";
import { InstancesSection } from "./features/instances/InstancesSection";
import { ApiLinksSection } from "./features/apiLinks/ApiLinksSection";
import { queryClient } from "./lib/queryClient";

function AdminPanel() {
  return (
    <AuthGuard>
      <AppShell>
        <InstancesSection />
        <ModpackSection />
        <ModManagementSection />
        <UploadSection />
        <ApiLinksSection />
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
