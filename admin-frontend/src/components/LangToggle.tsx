import { useI18n } from "../i18n/useI18n";
import type { Lang } from "../i18n/types";

export function LangToggle() {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ["es", "en"];

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white p-0.5 text-[11px] font-semibold"
    >
      {langs.map((code) => {
        const active = code === lang;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={[
              "h-7 rounded px-2.5 uppercase transition-colors",
              active
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}
