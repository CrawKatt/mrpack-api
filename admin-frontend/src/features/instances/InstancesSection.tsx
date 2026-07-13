import { useState } from "react";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { useAlert } from "../../components/Alert";
import { useConfirm } from "../../components/Modal";
import { useI18n } from "../../i18n/useI18n";
import { ALLOWED_MEDIA_EXTENSIONS, ALLOWED_MOD_EXTENSIONS, validateFile } from "../../lib/fileValidator";
import {
  useAddInstanceMod,
  useDeleteInstance,
  useGenerateCode,
  useInstances,
  useUploadInstanceMedia,
  useUploadInstanceModpack,
} from "./useInstances";
import { MediaPreview, MediaSummary } from "./MediaPreview";
import { CodesList } from "./CodesList";
import { CreateInstanceForm } from "./CreateInstanceForm";
import { StatusBadge } from "../../components/StatusBadge";
import type { AdminInstanceView } from "../../types/api";

const MRPACK_EXT = [".mrpack"];

export function InstanceCard({ instance }: { instance: AdminInstanceView }) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { confirm } = useConfirm();
  const [progress, setProgress] = useState(0);

  const uploadModpack = useUploadInstanceModpack();
  const addMod = useAddInstanceMod();
  const uploadMedia = useUploadInstanceMedia();
  const generateCodeMutation = useGenerateCode();
  const deleteInstanceMutation = useDeleteInstance();

  const modpackAvailable = instance.modpack?.available === true;
  const summary = instance.modpack?.modpack_info;
  const summaryText = summary
    ? `${summary.version_id} · MC ${summary.minecraft_version} · ${summary.loader} · ${summary.mod_count} mods`
    : t.instances.summaryMissing;

  const pickFile = (accept: string, onPick: (file: File) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (file) onPick(file);
      },
      { once: true },
    );
    input.click();
  };

  const handleUploadModpack = () => {
    pickFile(".mrpack", (file) => {
      const validation = validateFile(file, MRPACK_EXT);
      if (!validation.valid) {
        showAlert(validation.errors.join(". "), "error");
        return;
      }
      uploadModpack.mutate(
        { id: instance.id, file, onProgress: setProgress },
        {
          onSuccess: () => {
            showAlert(t.alerts.modpackUploaded(file.name), "success");
            setProgress(0);
          },
          onError: (err: Error) => showAlert(err.message, "error"),
          onSettled: () => setProgress(0),
        },
      );
    });
  };

  const handleAddJar = () => {
    pickFile(".jar", (file) => {
      const validation = validateFile(file, ALLOWED_MOD_EXTENSIONS);
      if (!validation.valid) {
        showAlert(validation.errors.join(". "), "error");
        return;
      }
      addMod.mutate(
        { id: instance.id, file, onProgress: setProgress },
        {
          onSuccess: () => {
            showAlert(t.alerts.modAdded(file.name), "success");
            setProgress(0);
          },
          onError: (err: Error) => showAlert(err.message, "error"),
          onSettled: () => setProgress(0),
        },
      );
    });
  };

  const handleUploadMedia = (slot: "icon" | "background") => {
    pickFile("image/*,video/*", (file) => {
      const validation = validateFile(file, ALLOWED_MEDIA_EXTENSIONS);
      if (!validation.valid) {
        showAlert(validation.errors.join(". "), "error");
        return;
      }
      uploadMedia.mutate(
        { id: instance.id, slot, file, onProgress: setProgress },
        {
          onSuccess: () => {
            showAlert(
              slot === "icon" ? t.alerts.mediaIconUpdated : t.alerts.mediaBackgroundUpdated,
              "success",
            );
            setProgress(0);
          },
          onError: (err: Error) => showAlert(err.message, "error"),
          onSettled: () => setProgress(0),
        },
      );
    });
  };

  const handleGenerateCode = () => {
    generateCodeMutation.mutate(instance.id, {
      onSuccess: (code) => {
        showAlert(t.alerts.codeGenerated(code.code), "success", 10000);
      },
      onError: (err: Error) => showAlert(err.message, "error"),
    });
  };

  const handleDelete = async () => {
    const ok = await confirm(t.instances.actions.deleteConfirm(instance.name));
    if (!ok) return;
    deleteInstanceMutation.mutate(instance.id, {
      onSuccess: () => showAlert(t.alerts.instanceDeleted(instance.name), "success"),
      onError: (err: Error) => showAlert(err.message, "error"),
    });
  };

  const anyPending = uploadModpack.isPending || addMod.isPending || uploadMedia.isPending;

  return (
    <article className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:grid-cols-[150px_minmax(0,1fr)_auto]">
      <MediaPreview media={instance.media} />

      <div className="min-w-0">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-800">{instance.name}</h3>
            <p className="text-xs text-gray-500">
              {instance.id} · whitelist: {instance.whitelist_count}
            </p>
          </div>
          <StatusBadge
            available={modpackAvailable}
            availableText={t.instances.modpackLoaded}
            unavailableText={t.instances.modpackMissing}
          />
        </header>

        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs text-gray-700">
          {summaryText}
        </div>

        <MediaSummary media={instance.media} />

        <CodesList codes={instance.codes} />

        {anyPending ? (
          <div className="mt-3 flex items-center gap-2">
            <ProgressBar value={progress} className="flex-1" />
            <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Button size="sm" variant="secondary" onClick={handleUploadModpack}>
          {t.instances.actions.uploadMrpack}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => handleUploadMedia("icon")}>
          {t.instances.actions.uploadIcon}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => handleUploadMedia("background")}>
          {t.instances.actions.uploadBackground}
        </Button>
        <Button
          size="sm"
          variant="success"
          onClick={handleGenerateCode}
          disabled={!modpackAvailable}
          loading={generateCodeMutation.isPending}
        >
          {t.instances.actions.generateCode}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleAddJar}
          disabled={!modpackAvailable}
        >
          {t.instances.actions.addJar}
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={handleDelete}
          loading={deleteInstanceMutation.isPending}
        >
          {t.instances.actions.delete}
        </Button>
      </div>
    </article>
  );
}

export function InstancesSection() {
  const { t } = useI18n();
  const { data, isLoading, isError, error } = useInstances();
  const instances = data?.instances ?? [];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
          <span aria-hidden>🧾</span> {t.instances.heading}
        </h2>
      </header>

      <CreateInstanceForm />

      <div className="mt-6 space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-500">{t.common.loading}</p>
        ) : isError ? (
          <p className="text-sm text-red-600">
            {error instanceof Error ? error.message : t.errors.generic}
          </p>
        ) : instances.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            {t.instances.empty}
          </p>
        ) : (
          instances.map((instance) => <InstanceCard key={instance.id} instance={instance} />)
        )}
      </div>
    </section>
  );
}
