import { useMemo, useState } from "react";
import { Bug, Copy, Search, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Modal } from "../../components/Modal";
import { useAlert } from "../../components/useAlert";
import { useConfirm } from "../../components/useConfirm";
import { useI18n } from "../../i18n/useI18n";
import { api } from "../../lib/api";
import type { CrashReportMeta } from "../../types/api";

function formatWhen(unix: number): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function CrashesSection() {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["crash-reports"],
    queryFn: () => api.listCrashReports(),
  });

  const detailQuery = useQuery({
    queryKey: ["crash-report", selectedId],
    queryFn: () => api.getCrashReport(selectedId!),
    enabled: !!selectedId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCrashReport(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["crash-reports"] });
      setSelectedId(null);
      showAlert(t.crashes.deleted, "success");
    },
    onError: (error: Error) => showAlert(error.message, "error"),
  });

  const reports = useMemo(() => {
    const all = listQuery.data?.reports ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((report) => {
      const hay = [
        report.username,
        report.kind,
        report.summary,
        report.instanceName,
        report.instanceId,
        report.os,
        report.launcherVersion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [listQuery.data?.reports, query]);

  const handleDelete = async (id: string) => {
    const ok = await confirm(t.crashes.deleteConfirm);
    if (ok) deleteMutation.mutate(id);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showAlert(t.common.copied, "success");
    } catch {
      showAlert(t.common.error, "error");
    }
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">{t.crashes.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-gray-950">{t.crashes.heading}</h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">{t.crashes.description}</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.crashes.searchPlaceholder}
            className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none ring-emerald-500 focus:ring-2"
          />
        </div>
      </section>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<Bug size={28} />}
          title={t.crashes.emptyTitle}
          description={t.crashes.emptyDescription}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">{t.crashes.colWhen}</th>
                <th className="px-4 py-3 font-semibold">{t.crashes.colUser}</th>
                <th className="px-4 py-3 font-semibold">{t.crashes.colKind}</th>
                <th className="px-4 py-3 font-semibold">{t.crashes.colSummary}</th>
                <th className="px-4 py-3 font-semibold">{t.crashes.colSize}</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <CrashRow
                  key={report.id}
                  report={report}
                  onOpen={() => setSelectedId(report.id)}
                  onDelete={() => void handleDelete(report.id)}
                  openLabel={t.crashes.open}
                  deleteLabel={t.common.delete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        title={t.crashes.detailTitle}
        size="lg"
      >
        {detailQuery.isLoading || !detailQuery.data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
              <p>
                <span className="font-semibold text-gray-900">{t.crashes.colWhen}: </span>
                {formatWhen(detailQuery.data.createdAt)}
              </p>
              <p>
                <span className="font-semibold text-gray-900">{t.crashes.colUser}: </span>
                {detailQuery.data.username || "—"}
              </p>
              <p>
                <span className="font-semibold text-gray-900">{t.crashes.colKind}: </span>
                {detailQuery.data.kind}
              </p>
              <p>
                <span className="font-semibold text-gray-900">OS: </span>
                {detailQuery.data.os || "—"}
              </p>
              <p>
                <span className="font-semibold text-gray-900">Launcher: </span>
                {detailQuery.data.launcherVersion || "—"}
              </p>
              <p>
                <span className="font-semibold text-gray-900">Instance: </span>
                {detailQuery.data.instanceName || detailQuery.data.instanceId || "—"}
              </p>
            </div>
            <pre className="max-h-[50vh] overflow-auto rounded-md bg-[#0c110f] p-4 text-xs leading-5 text-emerald-100">
              {detailQuery.data.log}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCopy(detailQuery.data.log)}
              >
                <Copy size={15} /> {t.common.copy}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => void handleDelete(detailQuery.data.id)}
              >
                <Trash2 size={15} /> {t.common.delete}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CrashRow({
  report,
  onOpen,
  onDelete,
  openLabel,
  deleteLabel,
}: {
  report: CrashReportMeta;
  onOpen: () => void;
  onDelete: () => void;
  openLabel: string;
  deleteLabel: string;
}) {
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/80">
      <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatWhen(report.createdAt)}</td>
      <td className="px-4 py-3 text-gray-800">{report.username || "—"}</td>
      <td className="px-4 py-3">
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
          {report.kind}
        </span>
      </td>
      <td className="max-w-xs truncate px-4 py-3 text-gray-600" title={report.summary}>
        {report.summary}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatBytes(report.sizeBytes)}</td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-md px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            {openLabel}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
          >
            {deleteLabel}
          </button>
        </div>
      </td>
    </tr>
  );
}
