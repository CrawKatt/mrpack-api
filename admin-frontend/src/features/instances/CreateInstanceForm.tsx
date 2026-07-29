import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { useAlert } from "../../components/useAlert";
import { useI18n } from "../../i18n/useI18n";
import { useCreateInstance } from "./useInstances";

export function CreateInstanceForm({ onCreated }: { onCreated?: () => void }) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const createMutation = useCreateInstance();

  const handleCreate = () => {
    if (!name.trim()) {
      showAlert(t.instances.errors.nameRequired, "error");
      return;
    }
    createMutation.mutate(
      { name: name.trim(), iconUrl: iconUrl.trim() || null, backgroundUrl: backgroundUrl.trim() || null },
      {
        onSuccess: () => {
          setName("");
          setIconUrl("");
          setBackgroundUrl("");
          showAlert(t.instances.createSuccess, "success");
          onCreated?.();
        },
        onError: (error: Error) => showAlert(error.message, "error"),
      },
    );
  };

  return (
    <div>
      <p className="mb-5 text-sm leading-6 text-gray-500">{t.instances.identityHint}</p>
      <div className="space-y-4">
        <Field label={t.instances.fields.name}>
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleCreate()}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.instances.fields.iconUrl} hint={t.instances.mediaHint}>
            <Input type="url" value={iconUrl} onChange={(event) => setIconUrl(event.target.value)} />
          </Field>
          <Field label={t.instances.fields.backgroundUrl} hint={t.instances.mediaHint}>
            <Input type="url" value={backgroundUrl} onChange={(event) => setBackgroundUrl(event.target.value)} />
          </Field>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={handleCreate} loading={createMutation.isPending} icon={<Plus size={16} />}>
          {t.instances.createBtn}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-gray-700">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] text-gray-400">{hint}</span> : null}
    </label>
  );
}
