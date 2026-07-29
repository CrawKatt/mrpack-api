import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, PackageOpen, RefreshCw, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAlert } from "../../components/useAlert";
import { useConfirm } from "../../components/useConfirm";
import { useI18n } from "../../i18n/useI18n";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { Spinner } from "../../components/Spinner";
import { Switch } from "../../components/Switch";
import { formatBytes } from "../../lib/formatBytes";
import { modpackKeys, useModpack } from "./useModpack";
import { ModList } from "./ModList";

export function ModpackSection() {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useModpack();
  const [downloading, setDownloading] = useState(false);

  const mainPackQuery = useQuery({
    queryKey: ["main-pack-config"],
    queryFn: () => api.getMainPackConfig(),
  });

  const mainPackMutation = useMutation({
    mutationFn: api.updateMainPackConfig,
    onSuccess: () => {
      showAlert(t.modpack.accessSaved, "success");
      void queryClient.invalidateQueries({ queryKey: ["main-pack-config"] });
      void queryClient.invalidateQueries({ queryKey: modpackKeys.info() });
    },
    onError: (mutationError: Error) => showAlert(mutationError.message, "error"),
  });

  const downloadMutation = useMutation({
    mutationFn: () => api.downloadFile(),
    onError: (mutationError: Error) => showAlert(mutationError.message, "error"),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.deleteFile(),
    onSuccess: () => {
      showAlert(t.alerts.modpackDeleted, "success");
      queryClient.invalidateQueries({ queryKey: modpackKeys.info() });
    },
    onError: (mutationError: Error) => showAlert(mutationError.message, "error"),
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadMutation.mutateAsync();
    } finally {
      setDownloading(false);
    }
  };
  const handleDelete = async () => {
    if (await confirm(t.modpack.deleteConfirm)) deleteMutation.mutate();
  };

  const available = data?.available === true;
  const info = data?.modpack_info;
  const accessEnabled = mainPackQuery.data?.accessEnabled !== false;
  const downloadEnabled = mainPackQuery.data?.downloadEnabled !== false;

  const patchMainPack = (patch: { accessEnabled?: boolean; downloadEnabled?: boolean }) => {
    const current = mainPackQuery.data ?? {
      accessEnabled: true,
      downloadEnabled: true,
    };
    mainPackMutation.mutate({ ...current, ...patch });
  };

  const accessControls = (
    <div className="space-y-3 border-b border-gray-100 bg-gray-50 px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {t.modpack.accessHeading}
      </p>
      <Switch
        size="sm"
        label={t.modpack.accessEnabled}
        checked={accessEnabled}
        disabled={mainPackMutation.isPending || mainPackQuery.isLoading}
        onCheckedChange={(checked) => patchMainPack({ accessEnabled: checked })}
      />
      <Switch
        size="sm"
        label={t.modpack.downloadEnabled}
        checked={downloadEnabled}
        disabled={mainPackMutation.isPending || mainPackQuery.isLoading || !accessEnabled}
        onCheckedChange={(checked) => patchMainPack({ downloadEnabled: checked })}
      />
      {!accessEnabled ? (
        <p className="text-xs text-amber-700">
          Acceso desactivado para el launcher. El panel admin sigue teniendo control total.
        </p>
      ) : null}
    </div>
  );

  if (isLoading) {
    return (
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {accessControls}
        <StatePanel><Spinner /> {t.common.loading}</StatePanel>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        {accessControls}
        <StatePanel error>
          {error instanceof Error ? error.message : t.errors.generic}
        </StatePanel>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <header className="flex flex-col justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-emerald-700">
            <PackageOpen size={20} />
          </span>
          <div>
            <h2 className="font-semibold text-gray-950">{t.modpack.heading}</h2>
            <p className="mt-0.5 max-w-md truncate text-xs text-gray-500">
              {available ? data?.file_name : t.modpack.noDetails}
            </p>
          </div>
        </div>
        <StatusBadge
          available={available}
          availableText={t.modpack.statusAvailable}
          unavailableText={t.modpack.statusUnavailable}
        />
      </header>

      {accessControls}

      {available && info ? (
        <>
          <div className="border-b border-gray-100 bg-[#17251e] p-5 text-white sm:p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div className="min-w-0">
                <p className="text-xs font-medium text-emerald-300">{data.file_name}</p>
                <h3 className="mt-2 truncate text-xl font-semibold">{info.name}</h3>
                <p className="mt-1 text-sm text-white/55">{formatBytes(data.file_size)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  icon={<RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />}
                >
                  {t.modpack.refresh}
                </Button>
                <Button
                  variant="success"
                  size="sm"
                  onClick={handleDownload}
                  loading={downloading}
                  icon={<Download size={15} />}
                >
                  {t.modpack.download}
                </Button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  title={t.modpack.delete}
                  className="grid h-8 w-8 place-items-center rounded-md border border-white/15 text-white/65 hover:border-red-300/30 hover:bg-red-400/15 hover:text-red-200 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 border-b border-gray-100 sm:grid-cols-4">
            <Detail label={t.modpack.details.version} value={info.version_id} />
            <Detail label={t.modpack.details.mc} value={info.minecraft_version} />
            <Detail label={t.modpack.details.loader} value={info.loader} />
            <Detail label={t.modpack.details.modCount} value={String(info.mod_count)} />
          </dl>

          <div className="p-5">
            <ModList mods={info.mods ?? []} />
          </div>
        </>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center px-6 py-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-md bg-gray-100 text-gray-400"><PackageOpen size={26} /></span>
          <p className="mt-4 max-w-sm text-sm leading-6 text-gray-500">{t.modpack.noDetails}</p>
          <Button
            className="mt-5"
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            icon={<RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />}
          >
            {t.modpack.refresh}
          </Button>
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-r border-gray-100 px-4 py-4 sm:border-b-0">
      <dt className="text-[10px] font-semibold uppercase text-gray-400">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-gray-800">{value || "-"}</dd>
    </div>
  );
}

function StatePanel({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={[
      "flex min-h-64 items-center justify-center gap-3 rounded-lg border px-5 text-sm",
      error ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-500",
    ].join(" ")}>
      {children}
    </div>
  );
}
