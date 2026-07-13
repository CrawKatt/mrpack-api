import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAlert } from "../../components/Alert";
import { useConfirm } from "../../components/Modal";
import { useI18n } from "../../i18n/useI18n";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { Spinner } from "../../components/Spinner";
import { formatBytes } from "../../lib/formatBytes";
import { modpackKeys, useModpack } from "./useModpack";
import { ModList } from "./ModList";

export function ModpackSection() {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useModpack();
  const [downloading, setDownloading] = useState(false);

  const downloadMutation = useMutation({
    mutationFn: () => api.downloadFile(),
    onError: (err: Error) => showAlert(err.message, "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteFile(),
    onSuccess: () => {
      showAlert(t.alerts.modpackDeleted, "success");
      qc.invalidateQueries({ queryKey: modpackKeys.info() });
    },
    onError: (err: Error) => showAlert(err.message, "error"),
  });

  const handleRefresh = () => refetch();
  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadMutation.mutateAsync();
    } finally {
      setDownloading(false);
    }
  };
  const handleDelete = async () => {
    const ok = await confirm(t.modpack.deleteConfirm);
    if (!ok) return;
    deleteMutation.mutate();
  };

  if (isLoading) {
    return (
      <Card title={<>{t.modpack.heading}</>}>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Spinner /> {t.common.loading}
        </div>
      </Card>
    );
  }
  if (isError) {
    return (
      <Card title={<>{t.modpack.heading}</>}>
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : t.errors.generic}
        </p>
      </Card>
    );
  }

  const available = data?.available === true;
  const info = data?.modpack_info;

  return (
    <Card
      title={<>{t.modpack.heading}</>}
      action={
        <StatusBadge
          available={available}
          availableText={t.modpack.statusAvailable}
          unavailableText={t.modpack.statusUnavailable}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoRow label={t.modpack.fileName} value={available ? data.file_name : "-"} />
        <InfoRow label={t.modpack.size} value={available ? formatBytes(data.file_size) : "-"} />
      </div>

      {available && info ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary-800">
              {t.modpack.heading}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoRow label={t.modpack.details.name} value={info.name} />
              <InfoRow label={t.modpack.details.version} value={info.version_id} />
              <InfoRow label={t.modpack.details.format} value={String(info.format_version)} />
              <InfoRow label={t.modpack.details.mc} value={info.minecraft_version} />
              <InfoRow label={t.modpack.details.loader} value={info.loader} />
              <InfoRow label={t.modpack.details.loaderVersion} value={info.loader_version} />
              <InfoRow label={t.modpack.details.modCount} value={String(info.mod_count)} />
            </div>
          </div>

          <ModList mods={info.mods ?? []} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">{t.modpack.noDetails}</p>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={handleRefresh}
          disabled={isFetching}
          icon={isFetching ? <Spinner size="sm" /> : <span aria-hidden>🔄</span>}
        >
          {t.modpack.refresh}
        </Button>
        <Button
          variant="success"
          onClick={handleDownload}
          disabled={!available || downloading}
          loading={downloading}
          icon={<span aria-hidden>📥</span>}
        >
          {t.modpack.download}
        </Button>
        <Button
          variant="danger"
          onClick={handleDelete}
          disabled={!available}
          loading={deleteMutation.isPending}
          icon={<span aria-hidden>🗑️</span>}
        >
          {t.modpack.delete}
        </Button>
      </div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <span className="truncate font-mono text-sm text-gray-800">{value || "-"}</span>
    </div>
  );
}
