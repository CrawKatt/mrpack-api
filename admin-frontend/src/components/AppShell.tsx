import type { ReactNode } from "react";
import { LangToggle } from "./LangToggle";
import { useAuth } from "../features/auth/useAuth";
import { useI18n } from "../i18n/useI18n";
import { useConfirm } from "./Modal";

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props) {
  const { logout } = useAuth();
  const { t } = useI18n();
  const { confirm } = useConfirm();

  const handleLogout = async () => {
    const ok = await confirm(t.app.logoutConfirm);
    if (ok) logout();
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary-50 via-white to-primary-100">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-sm">
              <span aria-hidden="true">🎮</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-800">
                {t.app.title}
              </h1>
              <p className="text-xs text-gray-500">{t.app.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LangToggle />
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-red-500 px-3 text-xs font-semibold text-white transition-colors hover:bg-red-600"
            >
              <span aria-hidden="true">🚪</span>
              {t.app.logout}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <div className="space-y-6">{children}</div>
      </main>

      <footer className="border-t border-gray-200 bg-white/60 py-4 text-center text-xs text-gray-500">
        Mrpack API v1.0 · Powered by Rust + Axum · Frontend by Vite + React
      </footer>
    </div>
  );
}
