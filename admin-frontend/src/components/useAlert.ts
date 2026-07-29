import { useContext } from "react";
import { AlertContext } from "./alertContext";
import type { AlertContextValue } from "./alertContext";

export function useAlert(): AlertContextValue {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlert must be used within an AlertProvider");
  return context;
}
