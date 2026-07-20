import type { ComponentType } from "react";
import {
  ArrowRight,
  Boxes,
  KeyRound,
  PackageOpen,
  Plus,
  ShieldAlert,
  Upload,
  Wrench,
} from "lucide-react";
import type { AppView } from "../../components/AppShell";
import { Spinner } from "../../components/Spinner";
import { useI18n } from "../../i18n/useI18n";
import { detectMediaKind } from "../../lib/mediaKind";
import type { AdminInstanceView } from "../../types/api";
import { useInstances } from "../instances/useInstances";
import { useMaintenanceStatus } from "../maintenance/useMaintenance";
import { useModpack } from "../modpack/useModpack";

interface Props {
  onNavigate: (view: AppView) => void;
}

export function DashboardOverview({ onNavigate }: Props) {
  const { t } = useI18n();
  const instancesQuery = useInstances();
  const modpackQuery = useModpack();
  const maintenanceQuery = useMaintenanceStatus();
  const instances = instancesQuery.data?.instances ?? [];
  const activeInstances = instances.filter((instance) => instance.modpack?.available).length;
  const activeCodes = instances.reduce(
    (total, instance) => total + instance.codes.filter((code) => code.active).length,
    0,
  );
  const modCount = modpackQuery.data?.modpack_info?.mod_count ?? 0;
  const isLoading = instancesQuery.isLoading || modpackQuery.isLoading;

  return (
    <div className="space-y-6">
      {maintenanceQuery.data?.enabled ? (
        <button
          type="button"
          onClick={() => onNavigate("maintenance")}
          className="flex w-full items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left transition-colors hover:bg-amber-100/70"
        >
          <span className="flex min-w-0 items-center gap-3">
            <ShieldAlert className="shrink-0 text-amber-700" size={20} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-amber-950">{t.dashboard.maintenanceActive}</span>
              <span className="block truncate text-xs text-amber-800">{t.dashboard.maintenanceActiveDescription}</span>
            </span>
          </span>
          <ArrowRight className="shrink-0 text-amber-700" size={18} />
        </button>
      ) : null}

      <section className="flex flex-col justify-between gap-5 border-b border-gray-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">{t.dashboard.eyebrow}</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold text-gray-950 sm:text-3xl">
            {t.dashboard.heading}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">{t.dashboard.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate("instances")}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus size={17} /> {t.dashboard.createInstance}
        </button>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={Boxes} label={t.dashboard.instances} value={instances.length} loading={isLoading} tone="emerald" />
        <Metric icon={PackageOpen} label={t.dashboard.activeInstances} value={activeInstances} loading={isLoading} tone="sky" />
        <Metric icon={KeyRound} label={t.dashboard.accessCodes} value={activeCodes} loading={isLoading} tone="amber" />
        <Metric icon={Wrench} label={t.dashboard.mods} value={modCount} loading={isLoading} tone="violet" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white">
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="font-semibold text-gray-950">{t.dashboard.currentModpack}</h3>
              <button
                type="button"
                onClick={() => onNavigate("modpack")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {t.dashboard.viewAll} <ArrowRight size={14} />
              </button>
            </header>
            <ModpackSnapshot loading={modpackQuery.isLoading} data={modpackQuery.data} />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white">
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h3 className="font-semibold text-gray-950">{t.dashboard.recentInstances}</h3>
              <button
                type="button"
                onClick={() => onNavigate("instances")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              >
                {t.dashboard.viewAll} <ArrowRight size={14} />
              </button>
            </header>
            <div className="divide-y divide-gray-100">
              {instancesQuery.isLoading ? (
                <div className="flex h-32 items-center justify-center"><Spinner /></div>
              ) : instances.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-gray-500">{t.dashboard.noInstances}</p>
              ) : instances.slice(0, 4).map((instance) => (
                <InstanceRow key={instance.id} instance={instance} />
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-5 py-4">
            <h3 className="font-semibold text-gray-950">{t.dashboard.quickActions}</h3>
          </header>
          <div className="divide-y divide-gray-100 px-2">
            <QuickAction
              icon={Plus}
              title={t.dashboard.createInstance}
              onClick={() => onNavigate("instances")}
            />
            <QuickAction
              icon={Upload}
              title={t.dashboard.replaceModpack}
              onClick={() => onNavigate("modpack")}
            />
            <QuickAction
              icon={ShieldAlert}
              title={t.dashboard.configureMaintenance}
              onClick={() => onNavigate("maintenance")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const metricTones = {
  emerald: "bg-emerald-50 text-emerald-700",
  sky: "bg-sky-50 text-sky-700",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
};

function Metric({
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: number;
  loading: boolean;
  tone: keyof typeof metricTones;
}) {
  return (
    <div className="min-h-[118px] rounded-lg border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className={[
          "grid h-9 w-9 place-items-center rounded-md",
          metricTones[tone],
        ].join(" ")}>
          <Icon size={18} />
        </span>
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        {loading ? <Spinner size="sm" /> : <p className="text-2xl font-semibold text-gray-950">{value}</p>}
      </div>
    </div>
  );
}

function ModpackSnapshot({
  data,
  loading,
}: {
  data: ReturnType<typeof useModpack>["data"];
  loading: boolean;
}) {
  const { t } = useI18n();
  if (loading) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;

  const info = data?.modpack_info;
  if (!data?.available || !info) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center px-5 py-8 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-md bg-gray-100 text-gray-500"><PackageOpen size={21} /></span>
        <p className="mt-3 text-sm text-gray-500">{t.modpack.noDetails}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[#17251e] text-emerald-300">
          <PackageOpen size={26} />
        </span>
        <div className="min-w-0">
          <h4 className="truncate font-semibold text-gray-950">{info.name}</h4>
          <p className="mt-1 truncate text-xs text-gray-500">{data.file_name}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-5 sm:text-right">
        <SnapshotItem label={t.dashboard.version} value={info.version_id} />
        <SnapshotItem label={t.dashboard.minecraft} value={info.minecraft_version} />
        <SnapshotItem label={t.dashboard.loader} value={info.loader} />
      </dl>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase text-gray-400">{label}</dt>
      <dd className="mt-1 truncate text-xs font-semibold text-gray-800">{value || "-"}</dd>
    </div>
  );
}

function InstanceRow({ instance }: { instance: AdminInstanceView }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <InstanceAvatar instance={instance} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{instance.name}</p>
        <p className="mt-0.5 truncate font-mono text-[11px] text-gray-400">{instance.id}</p>
      </div>
      <span className={[
        "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
        instance.modpack?.available ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500",
      ].join(" ")}>
        {instance.modpack?.available ? t.instances.modpackLoaded : t.instances.modpackMissing}
      </span>
    </div>
  );
}

function InstanceAvatar({ instance }: { instance: AdminInstanceView }) {
  const url = instance.media?.icon_url || "";
  const kind = instance.media?.icon_kind || detectMediaKind(url);
  if (url && kind === "video") {
    return <video src={url} muted playsInline className="h-9 w-9 shrink-0 rounded-md object-cover" />;
  }
  if (url) {
    return <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" loading="lazy" />;
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gray-100 text-gray-500">
      <Boxes size={17} />
    </span>
  );
}

function QuickAction({
  icon: Icon,
  title,
  onClick,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-16 w-full items-center gap-3 px-3 text-left"
    >
      <span className="grid h-9 w-9 place-items-center rounded-md bg-gray-100 text-gray-600 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-700">
        <Icon size={17} />
      </span>
      <span className="flex-1 text-sm font-semibold text-gray-800">{title}</span>
      <ArrowRight size={16} className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
    </button>
  );
}
