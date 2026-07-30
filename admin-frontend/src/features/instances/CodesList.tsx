import { Copy, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useAlert } from "../../components/useAlert";
import { useClipboard } from "../../hooks/useClipboard";
import { useI18n } from "../../i18n/useI18n";
import type { InstanceCode } from "../../types/api";
import { useUpdateInstanceCode } from "./useInstances";

export function CodesList({ instanceId, codes }: { instanceId: string; codes: InstanceCode[] }) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { copy } = useClipboard();
  const updateCode = useUpdateInstanceCode();
  const [editingCode, setEditingCode] = useState<InstanceCode | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [unlimited, setUnlimited] = useState(false);
  if (codes.length === 0) return null;

  const handleCopy = async (code: string) => {
    await copy(code);
    showAlert(t.instances.code.copied(code), "success", 2500);
  };

  const openEditor = (code: InstanceCode) => {
    const maxUses = codeMaxUses(code);
    setEditingCode(code);
    setUnlimited(maxUses === null);
    setLimitInput(maxUses?.toString() ?? "");
  };

  const handleSaveLimit = () => {
    if (!editingCode) return;
    const maxUses = unlimited ? null : parseLimit(limitInput);
    if (maxUses === undefined) {
      showAlert(t.instances.code.limitInvalid, "error");
      return;
    }

    updateCode.mutate(
      { id: instanceId, code: editingCode.code, maxUses },
      {
        onSuccess: () => {
          showAlert(t.instances.code.limitSaved(editingCode.code), "success");
          setEditingCode(null);
        },
        onError: (error: Error) => showAlert(error.message, "error"),
      },
    );
  };

  return (
    <div className="mt-4 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase text-gray-400">{t.instances.codesLabel}</p>
      <div className="flex flex-wrap gap-1.5">
        {codes.map((code) => {
          const maxUses = codeMaxUses(code);
          const exhausted = maxUses !== null && code.uses >= maxUses;
          const usage = maxUses
            ? t.instances.code.usesLimited(code.uses, maxUses)
            : t.instances.code.usesUnlimited(code.uses);
          return (
            <div
              key={code.code}
              className={[
                "inline-flex h-8 items-center overflow-hidden rounded-md border bg-sky-50 text-sky-800",
                exhausted ? "border-amber-300 bg-amber-50 text-amber-800" : "border-sky-200",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => handleCopy(code.code)}
                title={t.instances.code.copy}
                className="inline-flex h-full items-center gap-2 px-2 hover:bg-white/55"
              >
                <code className="text-[11px] font-bold">{code.code}</code>
                <span className="text-[9px]">{usage}</span>
                <Copy size={12} />
              </button>
              <button
                type="button"
                onClick={() => openEditor(code)}
                title={t.instances.code.editLimit}
                className="grid h-full w-7 place-items-center border-l border-current/15 hover:bg-white/55"
              >
                <Pencil size={11} />
              </button>
            </div>
          );
        })}
      </div>

      <Modal
        open={editingCode !== null}
        onClose={() => setEditingCode(null)}
        title={editingCode ? t.instances.code.editTitle(editingCode.code) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingCode(null)}>
              {t.common.cancel}
            </Button>
            <Button onClick={handleSaveLimit} loading={updateCode.isPending}>
              {t.instances.code.saveLimit}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={unlimited}
              onChange={(event) => setUnlimited(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            {t.instances.code.unlimited}
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase text-gray-400">
              {t.instances.code.limitLabel}
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={limitInput}
              disabled={unlimited}
              onChange={(event) => setLimitInput(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none disabled:opacity-50 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <p className="text-xs leading-5 text-gray-500">
            {t.instances.code.limitHelp(editingCode?.uses ?? 0)}
          </p>
        </div>
      </Modal>
    </div>
  );
}

function codeMaxUses(code: InstanceCode): number | null {
  return code.maxUses ?? code.max_uses ?? null;
}

function parseLimit(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined;
  return parsed;
}
