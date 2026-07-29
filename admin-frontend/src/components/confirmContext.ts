import { createContext } from "react";
import type { ReactNode } from "react";

export interface ConfirmContextValue {
  confirm: (message: ReactNode) => Promise<boolean>;
}

export const ConfirmContext = createContext<ConfirmContextValue | null>(null);
