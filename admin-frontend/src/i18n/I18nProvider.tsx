import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Dict, Lang } from "./types";
import { es } from "./es";
import { en } from "./en";
import { I18nContext } from "./context";
import type { I18nContextValue } from "./context";

const STORAGE_KEY = "mrpack_lang";

const dictionaries: Record<Lang, Dict> = { es, en };

function readInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {
  }
  return "es";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readInitialLang());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, setLang, t: dictionaries[lang] }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
