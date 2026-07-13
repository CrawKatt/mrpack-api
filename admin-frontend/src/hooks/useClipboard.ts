import { useCallback } from "react";

export function useClipboard() {
  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (!text) return false;
    try {
      await navigator.clipboard?.writeText(text);
      return true;
    } catch {
      window.prompt("Copy this code:", text);
      return false;
    }
  }, []);
  return { copy };
}
