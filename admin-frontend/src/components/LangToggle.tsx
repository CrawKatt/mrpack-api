import { useI18n } from "../i18n/useI18n";
import type { Lang } from "../i18n/types";

export function LangToggle() {
  const { lang, setLang } = useI18n();
  const langs: Lang[] = ["es", "en"];

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center rounded-lg bg-gray-100 p-1 text-xs font-semibold"
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
              "h-7 rounded-md px-3 uppercase transition-all",
              active
                ? "bg-white text-primary-700 shadow-sm"
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
