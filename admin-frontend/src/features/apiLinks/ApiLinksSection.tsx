import { ArrowUpRight, Code2, Lock, Radio, Server, ShieldCheck } from "lucide-react";
import { useI18n } from "../../i18n/useI18n";

const ENDPOINTS = [
  { method: "GET", path: "/api/health", access: "public", icon: Server },
  { method: "GET", path: "/api/maintenance/status", access: "public", icon: ShieldCheck },
  { method: "GET", path: "/api/maintenance/stream", access: "public", icon: Radio },
  { method: "GET", path: "/api/info", access: "protected", icon: Lock },
  { method: "POST", path: "/api/crash-reports", access: "protected", icon: Lock },
  { method: "GET", path: "/api/admin/crash-reports", access: "protected", icon: Lock },
] as const;

export function ApiLinksSection() {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold text-gray-950">{t.apiLinks.heading}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{t.apiLinks.description}</p>
        </div>
        <span className="grid h-10 w-10 place-items-center rounded-md bg-gray-900 text-white"><Code2 size={19} /></span>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="hidden grid-cols-[90px_minmax(0,1fr)_120px_44px] gap-4 border-b border-gray-100 bg-gray-50 px-5 py-3 text-[10px] font-semibold uppercase text-gray-400 sm:grid">
          <span>{t.apiLinks.method}</span><span>Endpoint</span><span>Access</span><span />
        </div>
        <div className="divide-y divide-gray-100">
          {ENDPOINTS.map(({ method, path, access, icon: Icon }) => (
            <div key={path} className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-3 px-4 py-4 sm:grid-cols-[90px_minmax(0,1fr)_120px_44px] sm:px-5">
              <span className="hidden w-fit rounded bg-emerald-50 px-2 py-1 font-mono text-[10px] font-bold text-emerald-700 sm:block">{method}</span>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gray-100 text-gray-500"><Icon size={15} /></span>
                <div className="min-w-0">
                  <code className="block truncate text-xs font-semibold text-gray-800">{path}</code>
                  <span className="mt-1 block text-[10px] text-gray-400 sm:hidden">{method} · {access === "public" ? t.apiLinks.public : t.apiLinks.protected}</span>
                </div>
              </div>
              <span className={[
                "hidden w-fit rounded-full px-2 py-1 text-[10px] font-semibold sm:block",
                access === "public" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700",
              ].join(" ")}>
                {access === "public" ? t.apiLinks.public : t.apiLinks.protected}
              </span>
              <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                title={t.apiLinks.open}
                className="grid h-9 w-9 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <ArrowUpRight size={16} />
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
