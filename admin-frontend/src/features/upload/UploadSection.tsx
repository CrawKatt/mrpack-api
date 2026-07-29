import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { ALLOWED_EXTENSIONS, validateFile } from "../../lib/fileValidator";
import { useAlert } from "../../components/useAlert";
import { useI18n } from "../../i18n/useI18n";
import { Card } from "../../components/Card";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { DropZone } from "./DropZone";
import { modpackKeys } from "../modpack/useModpack";
import { UploadCloud } from "lucide-react";

export function UploadSection() {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) return Promise.reject(new Error(t.upload.pickFirst));
      return api.uploadFile(file, setProgress);
    },
    onSuccess: (response) => {
      showAlert(t.upload.success(response.file_name, response.file_size_mb), "success");
      setFile(null);
      setProgress(0);
      qc.invalidateQueries({ queryKey: modpackKeys.info() });
    },
    onError: (err: Error) => showAlert(err.message, "error"),
    onSettled: () => setProgress(0),
  });

  const handleSelect = (next: File | null) => {
    setFile(next);
    setProgress(0);
  };

  const handleUpload = () => {
    if (!file) {
      showAlert(t.upload.pickFirst, "error");
      return;
    }
    const validation = validateFile(file, ALLOWED_EXTENSIONS);
    if (!validation.valid) {
      showAlert(validation.errors.join(". "), "error");
      return;
    }
    uploadMutation.mutate();
  };

  return (
    <Card title={<><UploadCloud size={18} /> {t.upload.heading}</>}>
      <DropZone
        accept=".mrpack"
        title={t.upload.dropzoneTitle}
        hint={t.upload.dropzoneHint}
        file={file}
        onFileSelected={handleSelect}
      />
      {uploadMutation.isPending ? (
        <ProgressBar value={progress} className="mt-3" />
      ) : null}
      <Button
        variant="primary"
        fullWidth
        className="mt-4"
        onClick={handleUpload}
        disabled={!file}
        loading={uploadMutation.isPending}
        icon={<UploadCloud size={16} />}
      >
        {t.upload.upload}
      </Button>
    </Card>
  );
}
