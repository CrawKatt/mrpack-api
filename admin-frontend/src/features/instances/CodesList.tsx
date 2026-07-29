import { Copy } from "lucide-react";
import { useAlert } from "../../components/useAlert";
import { useClipboard } from "../../hooks/useClipboard";
import { useI18n } from "../../i18n/useI18n";
import type { InstanceCode } from "../../types/api";

export function CodesList({ codes }: { codes: InstanceCode[] }) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { copy } = useClipboard();
  if (codes.length === 0) return null;

  const handleCopy = async (code: string) => {
    await copy(code);
    showAlert(t.instances.code.copied(code), "success", 2500);
  };

  return (
    <div className="mt-4 space-y-1.5">
      <p className="text-[10px] font-semibold uppercase text-gray-400">{t.instances.codesLabel}</p>
      <div className="flex flex-wrap gap-1.5">
        {codes.map((code) => {
          const usage = code.max_uses
            ? t.instances.code.usesLimited(code.uses, code.max_uses)
            : t.instances.code.usesUnlimited(code.uses);
          return (
            <button
              key={code.code}
              type="button"
              onClick={() => handleCopy(code.code)}
              title={t.instances.code.copy}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 text-sky-800 hover:border-sky-300"
            >
              <code className="text-[11px] font-bold">{code.code}</code>
              <span className="text-[9px] text-sky-600">{usage}</span>
              <Copy size={12} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
