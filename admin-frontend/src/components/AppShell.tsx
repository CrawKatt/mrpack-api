import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  Boxes,
  ChevronDown,
  CircleGauge,
  Code2,
  LogOut,
  Menu,
  PackageOpen,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { LangToggle } from "./LangToggle";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../features/auth/useAuth";
import { useI18n } from "../i18n/useI18n";
import { useConfirm } from "./Modal";

export type AppView = "dashboard" | "instances" | "modpack" | "maintenance" | "api";

interface Props {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  children: ReactNode;
}

interface NavItem {
  id: AppView;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", icon: CircleGauge },
  { id: "instances", icon: Boxes },
  { id: "modpack", icon: PackageOpen },
  { id: "maintenance", icon: ShieldCheck },
  { id: "api", icon: Code2 },
];

export function AppShell({ activeView, onNavigate, children }: Props) {
  const { logout } = useAuth();
  const { t } = useI18n();
  const { confirm } = useConfirm();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const labels: Record<AppView, string> = {
    dashboard: t.nav.dashboard,
    instances: t.nav.instances,
    modpack: t.nav.modpack,
    maintenance: t.nav.maintenance,
    api: t.nav.apiLinks,
  };
  const descriptions: Record<AppView, string> = {
    dashboard: t.app.viewDescriptions.dashboard,
    instances: t.app.viewDescriptions.instances,
    modpack: t.app.viewDescriptions.modpack,
    maintenance: t.app.viewDescriptions.maintenance,
    api: t.app.viewDescriptions.api,
  };

  const handleLogout = async () => {
    const ok = await confirm(t.app.logoutConfirm);
    if (ok) logout();
  };

  const navigate = (view: AppView) => {
    onNavigate(view);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f5f6f4] text-gray-900 dark:bg-[#0c110f] dark:text-gray-100">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-gray-200 bg-[#111916] text-white lg:flex lg:flex-col">
        <Brand />
        <nav className="flex-1 px-3 py-5" aria-label={t.app.primaryNavigation}>
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase text-white/40">
            {t.app.workspace}
          </p>
          <div className="space-y-1">
            {NAV_ITEMS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className={[
                  "group flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  activeView === id
                    ? "bg-white text-gray-950"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <Icon size={18} strokeWidth={activeView === id ? 2.2 : 1.8} />
                <span>{labels[id]}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="m-3 border-t border-white/10 px-3 pb-2 pt-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-emerald-400/15 text-emerald-300">
              <Activity size={16} />
            </span>
            <div>
              <p className="text-xs font-semibold text-white">{t.app.serverOnline}</p>
              <p className="text-[11px] text-white/45">Mrpack API v1.0</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-10 w-full items-center gap-3 rounded-md px-2 text-sm text-white/60 transition-colors hover:bg-red-400/10 hover:text-red-300"
          >
            <LogOut size={17} />
            {t.app.logout}
          </button>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t.common.close}
            className="absolute inset-0 bg-black/45"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex h-full w-[min(82vw,300px)] flex-col bg-[#111916] text-white shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
                aria-label={t.common.close}
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-5">
              {NAV_ITEMS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => navigate(id)}
                  className={[
                    "flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium",
                    activeView === id ? "bg-white text-gray-950" : "text-white/65",
                  ].join(" ")}
                >
                  <Icon size={18} />
                  {labels[id]}
                </button>
              ))}
            </nav>
            <button
              type="button"
              onClick={handleLogout}
              className="m-4 flex h-10 items-center gap-3 border-t border-white/10 px-2 pt-4 text-sm text-white/60"
            >
              <LogOut size={17} /> {t.app.logout}
            </button>
          </aside>
        </div>
      ) : null}

      <div className="min-h-screen lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-[#f5f6f4]/95 backdrop-blur-sm dark:border-white/10 dark:bg-[#0c110f]/95">
          <div className="flex h-[72px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-700 lg:hidden"
                aria-label={t.app.openMenu}
              >
                <Menu size={20} />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold text-gray-950 sm:text-xl">
                  {labels[activeView]}
                </h1>
                <p className="hidden truncate text-xs text-gray-500 sm:block">
                  {descriptions[activeView]}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle />
              <LangToggle />
              <div className="hidden h-9 items-center gap-2 border-l border-gray-200 pl-3 sm:flex">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-gray-900 text-xs font-bold text-white">A</span>
                <span className="text-xs font-semibold text-gray-700">{t.app.admin}</span>
                <ChevronDown size={14} className="text-gray-400" />
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[68px] grid-cols-5 border-t border-gray-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV_ITEMS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => navigate(id)}
            className={[
              "flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium",
              activeView === id ? "text-emerald-700" : "text-gray-400",
            ].join(" ")}
          >
            <Icon size={19} strokeWidth={activeView === id ? 2.3 : 1.8} />
            <span className="max-w-full whitespace-nowrap px-0.5 text-[9px] leading-none">
              {id === "modpack" ? "Modpack" : labels[id]}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex h-[72px] items-center gap-3 px-5">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-emerald-400 text-[#0d1712] shadow-[0_0_0_4px_rgba(52,211,153,0.09)]">
        <Boxes size={20} strokeWidth={2.4} />
      </span>
      <div>
        <p className="text-sm font-bold text-white">MRPACK</p>
        <p className="text-[10px] font-medium uppercase text-white/40">Control center</p>
      </div>
    </div>
  );
}
