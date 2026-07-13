import { useState } from "react";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { useAlert } from "../../components/Alert";
import { useI18n } from "../../i18n/useI18n";
import { useCreateInstance } from "./useInstances";

export function CreateInstanceForm() {
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
        },
        onError: (err: Error) => showAlert(err.message, "error"),
      },
    );
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
      <Input
        placeholder={t.instances.fields.name}
        aria-label={t.instances.fields.name}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") handleCreate();
        }}
      />
      <Input
        type="url"
        placeholder={t.instances.fields.iconUrl}
        aria-label={t.instances.fields.iconUrl}
        value={iconUrl}
        onChange={(event) => setIconUrl(event.target.value)}
      />
      <Input
        type="url"
        placeholder={t.instances.fields.backgroundUrl}
        aria-label={t.instances.fields.backgroundUrl}
        value={backgroundUrl}
        onChange={(event) => setBackgroundUrl(event.target.value)}
      />
      <Button
        variant="primary"
        onClick={handleCreate}
        loading={createMutation.isPending}
      >
        {t.instances.createBtn}
      </Button>
    </div>
  );
}
