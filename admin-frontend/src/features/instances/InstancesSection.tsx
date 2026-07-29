import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileArchive,
  ImageUp,
  KeyRound,
  PackageOpen,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  Wallpaper,
} from "lucide-react";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { Modal } from "../../components/Modal";
import { useAlert } from "../../components/useAlert";
import { useConfirm } from "../../components/useConfirm";
import { useI18n } from "../../i18n/useI18n";
import { ALLOWED_MEDIA_EXTENSIONS, ALLOWED_MOD_EXTENSIONS, validateFile } from "../../lib/fileValidator";
import {
  useAddInstanceMod,
  useDeleteInstance,
  useGenerateCode,
  useInstances,
  useUpdateInstance,
  useUploadInstanceMedia,
  useUploadInstanceModpack,
} from "./useInstances";
import { MediaPreview, MediaSummary } from "./MediaPreview";
import { CodesList } from "./CodesList";
import { CreateInstanceForm } from "./CreateInstanceForm";
import { InstanceModEditor } from "./InstanceModEditor";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { Switch } from "../../components/Switch";
import type { AdminInstanceView } from "../../types/api";

const MRPACK_EXT = [".mrpack"];

export function InstanceCard({ instance }: { instance: AdminInstanceView }) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const [progress, setProgress] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const uploadModpack = useUploadInstanceModpack();
  const addMod = useAddInstanceMod();
  const uploadMedia = useUploadInstanceMedia();
  const generateCodeMutation = useGenerateCode();
  const deleteInstanceMutation = useDeleteInstance();
  const updateInstance = useUpdateInstance();

  const modpackAvailable = instance.modpack?.available === true;
  const summary = instance.modpack?.modpack_info;
  const summaryText = summary
    ? `${summary.version_id} · MC ${summary.minecraft_version} · ${summary.loader}`
    : t.instances.summaryMissing;

  const isPublic = instance.isPublic ?? instance.is_public ?? false;
  const downloadEnabled = instance.downloadEnabled ?? instance.download_enabled ?? true;
  const accessEnabled = instance.accessEnabled ?? instance.access_enabled ?? true;
  const isMain = instance.isMain ?? instance.is_main ?? false;
  const whitelistCount = instance.whitelistCount ?? instance.whitelist_count ?? 0;

  const toggleFlag = (
    patch: {
      isPublic?: boolean;
      downloadEnabled?: boolean;
      accessEnabled?: boolean;
      isMain?: boolean;
    },
  ) => {
    updateInstance.mutate(
      { id: instance.id, ...patch },
      {
        onSuccess: () => showAlert(t.instances.flagsUpdated, "success"),
        onError: (error: Error) => showAlert(error.message, "error"),
      },
    );
  };

  const pickFile = (accept: string, onPick: (file: File) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) onPick(file);
    }, { once: true });
    input.click();
  };

  const handleUploadModpack = () => {
    pickFile(".mrpack", (file) => {
      const validation = validateFile(file, MRPACK_EXT);
      if (!validation.valid) return showAlert(validation.errors.join(". "), "error");
      uploadModpack.mutate(
        { id: instance.id, file, onProgress: setProgress },
        {
          onSuccess: () => showAlert(t.alerts.modpackUploaded(file.name), "success"),
          onError: (error: Error) => showAlert(error.message, "error"),
          onSettled: () => setProgress(0),
        },
      );
    });
  };

  const handleAddJar = () => {
    pickFile(".jar", (file) => {
      const validation = validateFile(file, ALLOWED_MOD_EXTENSIONS);
      if (!validation.valid) return showAlert(validation.errors.join(". "), "error");
      addMod.mutate(
        { id: instance.id, file, onProgress: setProgress },
        {
          onSuccess: () => showAlert(t.alerts.modAdded(file.name), "success"),
          onError: (error: Error) => showAlert(error.message, "error"),
          onSettled: () => setProgress(0),
        },
      );
    });
  };

  const handleUploadMedia = (slot: "icon" | "background") => {
    pickFile("image/*,video/*", (file) => {
      const validation = validateFile(file, ALLOWED_MEDIA_EXTENSIONS);
      if (!validation.valid) return showAlert(validation.errors.join(". "), "error");
      uploadMedia.mutate(
        { id: instance.id, slot, file, onProgress: setProgress },
        {
          onSuccess: () => showAlert(
            slot === "icon" ? t.alerts.mediaIconUpdated : t.alerts.mediaBackgroundUpdated,
            "success",
          ),
          onError: (error: Error) => showAlert(error.message, "error"),
          onSettled: () => setProgress(0),
        },
      );
    });
  };

  const handleGenerateCode = () => {
    generateCodeMutation.mutate(instance.id, {
      onSuccess: (code) => showAlert(t.alerts.codeGenerated(code.code), "success", 10000),
      onError: (error: Error) => showAlert(error.message, "error"),
    });
  };

  const handleDelete = async () => {
    if (!(await confirm(t.instances.actions.deleteConfirm(instance.name)))) return;
    deleteInstanceMutation.mutate(instance.id, {
      onSuccess: () => showAlert(t.alerts.instanceDeleted(instance.name), "success"),
      onError: (error: Error) => showAlert(error.message, "error"),
    });
  };

  const anyPending = uploadModpack.isPending || addMod.isPending || uploadMedia.isPending;

  return (
    <>
      <article className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <MediaPreview media={instance.media} />
        <div className="p-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-gray-950">{instance.name}</h3>
                {isMain ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                    {t.instances.mainBadge}
                  </span>
                ) : null}
                {!accessEnabled ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                    {t.instances.disabledBadge}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-gray-400">{instance.id}</p>
            </div>
            <StatusBadge
              available={modpackAvailable}
              availableText={t.instances.modpackLoaded}
              unavailableText={t.instances.modpackMissing}
            />
          </header>

          <p className="mt-4 min-h-10 text-xs leading-5 text-gray-500">{summaryText}</p>

          <div className="mt-4 space-y-3 rounded-md border border-gray-100 bg-gray-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {t.instances.accessControls}
            </p>
            <Switch
              size="sm"
              label={t.instances.flagAccess}
              checked={accessEnabled}
              disabled={updateInstance.isPending}
              onCheckedChange={(checked) => toggleFlag({ accessEnabled: checked })}
            />
            <Switch
              size="sm"
              label={t.instances.flagDownload}
              checked={downloadEnabled}
              disabled={updateInstance.isPending || !accessEnabled}
              onCheckedChange={(checked) => toggleFlag({ downloadEnabled: checked })}
            />
            <Switch
              size="sm"
              label={t.instances.flagPublic}
              checked={isPublic}
              disabled={updateInstance.isPending || !accessEnabled}
              onCheckedChange={(checked) => toggleFlag({ isPublic: checked })}
            />
            <Switch
              size="sm"
              label={t.instances.flagMain}
              checked={isMain}
              disabled={updateInstance.isPending}
              onCheckedChange={(checked) => toggleFlag({ isMain: checked })}
            />
          </div>

          <div className="mt-4 grid grid-cols-3 divide-x divide-gray-100 border-y border-gray-100 py-3">
            <CompactStat icon={Users} value={whitelistCount} label={t.instances.whitelist} />
            <CompactStat icon={KeyRound} value={instance.codes.length} label={t.instances.codesLabel} />
            <CompactStat icon={FileArchive} value={summary?.mod_count ?? 0} label={t.dashboard.mods} />
          </div>

          <MediaSummary media={instance.media} />
          <CodesList codes={instance.codes} />

          {anyPending ? (
            <div className="mt-4 flex items-center gap-2">
              <ProgressBar value={progress} className="flex-1" />
              <span className="w-8 text-right text-[10px] font-medium text-gray-500">{Math.round(progress)}%</span>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Button
              variant="primary"
              size="sm"
              onClick={handleGenerateCode}
              disabled={!modpackAvailable}
              loading={generateCodeMutation.isPending}
              icon={<KeyRound size={15} />}
            >
              {t.instances.actions.generateCode}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditorOpen(true)}
              disabled={!modpackAvailable}
              icon={<PackageOpen size={15} />}
            >
              {t.instances.actions.editMods}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowActions((current) => !current)}
              icon={showActions ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              title={showActions ? t.instances.hideActions : t.instances.moreActions}
            >
              <span className="hidden sm:inline">{showActions ? t.instances.hideActions : t.instances.moreActions}</span>
            </Button>
          </div>

          {showActions ? (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
              <ActionButton icon={Upload} label={t.instances.actions.uploadMrpack} onClick={handleUploadModpack} />
              <ActionButton icon={ImageUp} label={t.instances.actions.uploadIcon} onClick={() => handleUploadMedia("icon")} />
              <ActionButton icon={Wallpaper} label={t.instances.actions.uploadBackground} onClick={() => handleUploadMedia("background")} />
              <ActionButton icon={PackagePlus} label={t.instances.actions.addJar} onClick={handleAddJar} disabled={!modpackAvailable} />
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteInstanceMutation.isPending}
                className="col-span-2 flex h-9 items-center justify-center gap-2 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={14} /> {t.instances.actions.delete}
              </button>
            </div>
          ) : null}
        </div>
      </article>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={t.instances.editor.title(instance.name)}
        size="lg"
      >
        <InstanceModEditor instance={instance} />
      </Modal>
    </>
  );
}

export function InstancesSection() {
  const { t } = useI18n();
  const { data, isLoading, isError, error } = useInstances();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const instances = data?.instances ?? [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? instances.filter((instance) =>
        instance.name.toLowerCase().includes(term) || instance.id.toLowerCase().includes(term),
      )
    : instances;

  return (
    <div className="space-y-5">
      <section className="flex flex-col justify-between gap-4 border-b border-gray-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold text-gray-950">{t.instances.heading}</h2>
          <p className="mt-1 text-sm text-gray-500">{t.instances.count(instances.length)}</p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)} icon={<Plus size={17} />}>
          {t.instances.create}
        </Button>
      </section>

      <div className="relative max-w-md">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.instances.search}
          className="h-10 w-full rounded-md border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none placeholder:text-gray-400 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center"><Spinner /></div>
      ) : isError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error instanceof Error ? error.message : t.errors.generic}
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileArchive size={28} />}
          title={search ? t.instances.search : t.instances.empty}
          description={!search ? t.instances.summaryMissing : undefined}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((instance) => <InstanceCard key={instance.id} instance={instance} />)}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t.instances.create} size="lg">
        <CreateInstanceForm onCreated={() => setCreateOpen(false)} />
      </Modal>
    </div>
  );
}

function CompactStat({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <div className="min-w-0 px-2 text-center first:pl-0 last:pr-0">
      <div className="flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-800"><Icon size={13} /> {value}</div>
      <p className="mt-0.5 truncate text-[10px] text-gray-400">{label}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof Upload;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-10 items-center gap-2 rounded-md border border-gray-200 px-2.5 text-left text-[11px] font-semibold text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon size={14} className="shrink-0" />
      <span className="leading-4">{label}</span>
    </button>
  );
}
