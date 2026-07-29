import { useMemo, useState } from "react";
import { PackagePlus, Search, Trash2 } from "lucide-react";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ProgressBar } from "../../components/ProgressBar";
import { useAlert } from "../../components/useAlert";
import { useConfirm } from "../../components/useConfirm";
import { useI18n } from "../../i18n/useI18n";
import { formatBytes } from "../../lib/formatBytes";
import { ALLOWED_MOD_EXTENSIONS, validateFile } from "../../lib/fileValidator";
import type { AdminInstanceView, ModInfo } from "../../types/api";
import { useAddInstanceMod, useRemoveInstanceMod } from "./useInstances";

const EMPTY_MODS: ModInfo[] = [];

export function InstanceModEditor({ instance }: { instance: AdminInstanceView }) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState("");
  const addMod = useAddInstanceMod();
  const removeMod = useRemoveInstanceMod();
  const modpackInfo = instance.modpack?.modpack_info;
  const mods = modpackInfo?.mods ?? EMPTY_MODS;
  const visibleMods = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return mods;
    return mods.filter((mod) =>
      `${mod.name} ${mod.path} ${mod.source} ${mod.environment}`.toLowerCase().includes(term),
    );
  }, [mods, search]);

  const pickJar = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".jar";
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0] ?? null;
        const validation = validateFile(file, ALLOWED_MOD_EXTENSIONS);
        if (!validation.valid || !file) {
          showAlert(validation.errors.join(". "), "error");
          return;
        }

        addMod.mutate(
          { id: instance.id, file, onProgress: setProgress },
          {
            onSuccess: (response) => showAlert(t.alerts.modAdded(response.path || file.name), "success"),
            onError: (error: Error) => showAlert(error.message, "error"),
            onSettled: () => setProgress(0),
          },
        );
      },
      { once: true },
    );
    input.click();
  };

  const handleRemove = async (mod: ModInfo) => {
    if (!(await confirm(t.instances.editor.removeConfirm(mod.name || mod.path)))) return;
    removeMod.mutate(
      { id: instance.id, path: mod.path },
      {
        onSuccess: () => showAlert(t.alerts.modRemoved(mod.name || mod.path), "success"),
        onError: (error: Error) => showAlert(error.message, "error"),
      },
    );
  };

  if (instance.modpack?.available !== true || !modpackInfo) {
    return (
      <EmptyState
        icon={<PackagePlus size={28} />}
        title={t.instances.editor.noModpackTitle}
        description={t.instances.summaryMissing}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{instance.name}</p>
          <h3 className="mt-1 truncate text-base font-semibold text-gray-950">{modpackInfo.name}</h3>
          <p className="mt-1 text-xs text-gray-500">
            {modpackInfo.version_id} · MC {modpackInfo.minecraft_version} · {t.instances.editor.modCount(mods.length)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="success"
          onClick={pickJar}
          disabled={addMod.isPending}
          loading={addMod.isPending}
          icon={<PackagePlus size={15} />}
        >
          {t.instances.actions.addJar}
        </Button>
      </header>

      {addMod.isPending ? (
        <div className="flex items-center gap-2">
          <ProgressBar value={progress} className="flex-1" />
          <span className="w-9 text-right text-[10px] font-medium text-gray-500">{Math.round(progress)}%</span>
        </div>
      ) : null}

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.instances.editor.searchMods}
          className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200">
        <div className="hidden grid-cols-[minmax(0,1fr)_92px_90px_82px_36px] gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 text-[10px] font-semibold uppercase text-gray-400 md:grid">
          <span>{t.modpack.details.name}</span>
          <span>{t.modpack.mods.source}</span>
          <span>{t.modpack.mods.env}</span>
          <span className="text-right">{t.modpack.mods.size}</span>
          <span />
        </div>
        {visibleMods.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">{t.instances.editor.noMods}</p>
        ) : (
          <ul className="max-h-[48vh] divide-y divide-gray-100 overflow-y-auto">
            {visibleMods.map((mod) => (
              <li
                key={mod.path}
                className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_92px_90px_82px_36px]"
              >
                <div className="min-w-0">
                  <p title={mod.path} className="truncate text-xs font-semibold text-gray-800">
                    {mod.name || mod.path}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[9px] text-gray-400">{mod.path}</p>
                  <div className="mt-1 flex gap-2 text-[9px] text-gray-500 md:hidden">
                    <span>{mod.source || "manifest"}</span>
                    <span>·</span>
                    <span>{mod.environment || "both"}</span>
                    <span>·</span>
                    <span>{formatBytes(mod.file_size)}</span>
                  </div>
                </div>
                <span className="hidden truncate text-[11px] text-gray-500 md:block">{mod.source || "manifest"}</span>
                <span className="hidden truncate text-[11px] text-gray-500 md:block">{mod.environment || "both"}</span>
                <span className="hidden text-right text-[11px] text-gray-500 md:block">{formatBytes(mod.file_size)}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(mod)}
                  disabled={removeMod.isPending}
                  title={t.modpack.mods.remove}
                  className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
