import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAlert } from "../../components/Alert";
import { useConfirm } from "../../components/Modal";
import { useI18n } from "../../i18n/useI18n";
import { modpackKeys } from "./useModpack";
import type { ModInfo } from "../../types/api";

interface Props {
  mods: ModInfo[];
}

export function ModList({ mods }: Props) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const qc = useQueryClient();

  const removeMutation = useMutation({
    mutationFn: (path: string) => api.removeMod(path),
    onSuccess: (_data, path) => {
      const removed = mods.find((m) => m.path === path);
      showAlert(t.alerts.modRemoved(removed?.name || path), "success");
      qc.invalidateQueries({ queryKey: modpackKeys.info() });
    },
    onError: (err: Error) => showAlert(err.message, "error"),
  });

  const handleRemove = async (path: string, name: string) => {
    const ok = await confirm(t.modpack.mods.removeConfirm(name || path));
    if (!ok) return;
    removeMutation.mutate(path);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t.modpack.mods.heading}
        </h3>
        <span className="text-xs text-gray-500">{mods.length}</span>
      </header>
      {mods.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500">
          {t.modpack.mods.empty}
        </p>
      ) : (
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
          {mods.map((mod) => (
            <li
              key={mod.path}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-center gap-3 px-4 py-2.5"
            >
              <span
                title={mod.path}
                className="truncate text-sm font-medium text-gray-800"
              >
                {mod.name || mod.path}
              </span>
              <span className="rounded bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-800">
                {mod.source || "manifest"}
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">
                {mod.environment || "both"}
              </span>
              <span className="w-16 text-right text-xs text-gray-500">
                {(mod.file_size / 1024).toFixed(1)} KB
              </span>
              <button
                type="button"
                onClick={() => handleRemove(mod.path, mod.name || mod.path)}
                disabled={removeMutation.isPending}
                className="rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {t.modpack.mods.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
