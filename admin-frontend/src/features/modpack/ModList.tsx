import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useAlert } from "../../components/useAlert";
import { useConfirm } from "../../components/useConfirm";
import { useI18n } from "../../i18n/useI18n";
import { formatBytes } from "../../lib/formatBytes";
import { modpackKeys } from "./useModpack";
import type { ModInfo } from "../../types/api";

export function ModList({ mods }: { mods: ModInfo[] }) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const visibleMods = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mods;
    return mods.filter((mod) => `${mod.name} ${mod.path}`.toLowerCase().includes(term));
  }, [mods, search]);

  const removeMutation = useMutation({
    mutationFn: (path: string) => api.removeMod(path),
    onSuccess: (_data, path) => {
      const removed = mods.find((mod) => mod.path === path);
      showAlert(t.alerts.modRemoved(removed?.name || path), "success");
      queryClient.invalidateQueries({ queryKey: modpackKeys.info() });
    },
    onError: (error: Error) => showAlert(error.message, "error"),
  });

  const handleRemove = async (mod: ModInfo) => {
    if (await confirm(t.modpack.mods.removeConfirm(mod.name || mod.path))) {
      removeMutation.mutate(mod.path);
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">{t.modpack.mods.heading}</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{mods.length}</span>
        </div>
        <div className="relative w-full sm:w-56">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.instances.search}
            className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-2 text-xs outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200">
        <div className="hidden grid-cols-[minmax(0,1fr)_100px_90px_80px_36px] gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase text-gray-400 md:grid">
          <span>{t.modpack.details.name}</span>
          <span>{t.modpack.mods.source}</span>
          <span>{t.modpack.mods.env}</span>
          <span className="text-right">{t.modpack.mods.size}</span>
          <span />
        </div>
        {visibleMods.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">{t.modpack.mods.empty}</p>
        ) : (
          <ul className="max-h-[460px] divide-y divide-gray-100 overflow-y-auto">
            {visibleMods.map((mod) => (
              <li key={mod.path} className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_100px_90px_80px_36px]">
                <div className="min-w-0">
                  <p title={mod.path} className="truncate text-xs font-semibold text-gray-800">{mod.name || mod.path}</p>
                  <p className="mt-0.5 truncate font-mono text-[9px] text-gray-400 md:hidden">{mod.path}</p>
                  <div className="mt-1 flex gap-2 text-[9px] text-gray-500 md:hidden">
                    <span>{mod.source || "manifest"}</span><span>·</span><span>{mod.environment || "both"}</span><span>·</span><span>{formatBytes(mod.file_size)}</span>
                  </div>
                </div>
                <span className="hidden truncate text-[11px] text-gray-500 md:block">{mod.source || "manifest"}</span>
                <span className="hidden truncate text-[11px] text-gray-500 md:block">{mod.environment || "both"}</span>
                <span className="hidden text-right text-[11px] text-gray-500 md:block">{formatBytes(mod.file_size)}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(mod)}
                  disabled={removeMutation.isPending}
                  title={t.modpack.mods.remove}
                  className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
