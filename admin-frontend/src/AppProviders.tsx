import { AlertProvider } from "./components/Alert";
import { ConfirmProvider } from "./components/Modal";
import { I18nProvider } from "./i18n/I18nProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AlertProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AlertProvider>
    </I18nProvider>
  );
}
