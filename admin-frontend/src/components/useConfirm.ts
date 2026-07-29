import { useContext } from "react";
import { ConfirmContext } from "./confirmContext";
import type { ConfirmContextValue } from "./confirmContext";

export function useConfirm(): ConfirmContextValue {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within a ConfirmProvider");
  return context;
}
