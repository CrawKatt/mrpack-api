import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ALLOWED_MOD_EXTENSIONS, validateFile } from "../../lib/fileValidator";
import { useAlert } from "../../components/Alert";
import { useI18n } from "../../i18n/useI18n";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { DropZone } from "../upload/DropZone";
import { modpackKeys, useModpack } from "../modpack/useModpack";

export function ModManagementSection() {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const qc = useQueryClient();
  const { data: modpack } = useModpack();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  const addMutation = useMutation({
    mutationFn: () => {
      if (!file) return Promise.reject(new Error(t.upload.pickFirst));
      return api.addModFile(file, setProgress);
    },
    onSuccess: (response) => {
      const path = (response as { path?: string })?.path ?? file?.name ?? "";
      showAlert(t.alerts.modAdded(path), "success");
      setFile(null);
      setProgress(0);
      qc.invalidateQueries({ queryKey: modpackKeys.info() });
    },
    onError: (err: Error) => showAlert(err.message, "error"),
    onSettled: () => {
      setProgress(0);
    },
  });

  const handleSelect = (next: File | null) => {
    setFile(next);
    setProgress(0);
  };

  const handleAdd = () => {
    if (!file) {
      showAlert(t.upload.pickFirst, "error");
      return;
    }
    const validation = validateFile(file, ALLOWED_MOD_EXTENSIONS);
    if (!validation.valid) {
      showAlert(validation.errors.join(". "), "error");
      return;
    }
    addMutation.mutate();
  };

  return (
    <Card title={<>{t.mods.heading}</>}>
      <DropZone
        accept=".jar"
        title={t.mods.dropzoneTitle}
        hint={t.mods.dropzoneHint}
        file={file}
        onFileSelected={handleSelect}
        variant="compact"
        disabled={modpack?.available !== true}
      />
      {addMutation.isPending ? <ProgressBar value={progress} className="mt-3" /> : null}
      <Button
        variant="primary"
        fullWidth
        className="mt-4"
        onClick={handleAdd}
        disabled={!file}
        loading={addMutation.isPending}
        icon={<span aria-hidden>➕</span>}
      >
        {t.mods.add}
      </Button>
    </Card>
  );
}
