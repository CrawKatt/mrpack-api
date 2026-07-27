import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type AlertVariant = "success" | "error" | "info";

interface AlertItem {
  id: number;
  message: string;
  variant: AlertVariant;
  exiting?: boolean;
}

interface AlertContextValue {
  showAlert: (message: string, variant?: AlertVariant, durationMs?: number) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

const MAX_VISIBLE = 4;
const EXIT_MS = 180;

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

/** Solid styles that are not rewritten by global dark-mode utility overrides. */
const STYLES: Record<AlertVariant, { panel: string; icon: string; close: string }> = {
  success: {
    panel:
      "border-emerald-500/30 bg-emerald-600 text-white shadow-emerald-900/20 dark:border-emerald-400/25 dark:bg-emerald-700",
    icon: "text-white",
    close: "text-white/70 hover:bg-white/15 hover:text-white",
  },
  error: {
    panel:
      "border-rose-500/30 bg-rose-600 text-white shadow-rose-900/20 dark:border-rose-400/25 dark:bg-rose-700",
    icon: "text-white",
    close: "text-white/70 hover:bg-white/15 hover:text-white",
  },
  info: {
    panel:
      "border-sky-500/30 bg-sky-600 text-white shadow-sky-900/20 dark:border-sky-400/25 dark:bg-sky-700",
    icon: "text-white",
    close: "text-white/70 hover:bg-white/15 hover:text-white",
  },
};

export function AlertProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AlertItem[]>([]);
  const counter = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const removeAlert = useCallback(
    (id: number) => {
      clearTimer(id);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, exiting: true } : item)),
      );
      window.setTimeout(() => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      }, EXIT_MS);
    },
    [clearTimer],
  );

  const showAlert = useCallback<AlertContextValue["showAlert"]>(
    (message, variant = "info", durationMs = 4200) => {
      const text = message.trim();
      if (!text) return;

      const id = ++counter.current;
      setItems((prev) => {
        const next = [...prev, { id, message: text, variant }];
        if (next.length <= MAX_VISIBLE) return next;
        const dropped = next.slice(0, next.length - MAX_VISIBLE);
        dropped.forEach((item) => clearTimer(item.id));
        return next.slice(-MAX_VISIBLE);
      });

      if (durationMs > 0) {
        const timer = window.setTimeout(() => removeAlert(id), durationMs);
        timers.current.set(id, timer);
      }
    },
    [clearTimer, removeAlert],
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions text"
        className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex flex-col items-end gap-2 p-4 sm:p-5 lg:pl-72"
      >
        {items.map((item) => {
          const Icon = ICONS[item.variant];
          const styles = STYLES[item.variant];
          return (
            <div
              key={item.id}
              role="status"
              className={[
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-3.5 py-3 text-sm shadow-lg backdrop-blur-sm",
                styles.panel,
                item.exiting ? "animate-toast-out" : "animate-toast-in",
              ].join(" ")}
            >
              <Icon aria-hidden className={`mt-0.5 shrink-0 ${styles.icon}`} size={18} />
              <p className="min-w-0 flex-1 break-words leading-5">{item.message}</p>
              <button
                type="button"
                onClick={() => removeAlert(item.id)}
                className={[
                  "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors",
                  styles.close,
                ].join(" ")}
                aria-label="Cerrar"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlert must be used within an AlertProvider");
  return ctx;
}
