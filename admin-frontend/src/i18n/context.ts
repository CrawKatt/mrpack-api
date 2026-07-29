import { createContext } from "react";
import type { Dict, Lang } from "./types";

export interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Dict;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
