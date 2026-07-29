import { createContext } from "react";

export type AlertVariant = "success" | "error" | "info";

export interface AlertContextValue {
  showAlert: (message: string, variant?: AlertVariant, durationMs?: number) => void;
}

export const AlertContext = createContext<AlertContextValue | null>(null);
