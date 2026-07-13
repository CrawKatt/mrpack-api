import { useAlert } from "../../components/Alert";
import { useClipboard } from "../../hooks/useClipboard";
import { useI18n } from "../../i18n/useI18n";
import type { InstanceCode } from "../../types/api";

interface Props {
  codes: InstanceCode[];
}

export function CodesList({ codes }: Props) {
  const { t } = useI18n();
  const { showAlert } = useAlert();
  const { copy } = useClipboard();

  if (codes.length === 0) {
    return <p className="text-xs text-gray-500">—</p>;
  }

  const handleCopy = async (code: string) => {
    await copy(code);
    showAlert(t.instances.code.copied(code), "success", 2500);
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {codes.map((code) => {
        const usage = code.max_uses
          ? t.instances.code.usesLimited(code.uses, code.max_uses)
          : t.instances.code.usesUnlimited(code.uses);
        return (
          <div
            key={code.code}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1"
          >
            <code className="font-mono text-xs font-bold text-sky-800">{code.code}</code>
            <span className="text-xs text-gray-500">{usage}</span>
            <button
              type="button"
              onClick={() => handleCopy(code.code)}
              className="rounded bg-primary-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-primary-700"
            >
              {t.instances.code.copy}
            </button>
          </div>
        );
      })}
    </div>
  );
}
