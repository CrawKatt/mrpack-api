import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export type AlertVariant = "success" | "error" | "info";

interface AlertItem {
  id: number;
  message: string;
  variant: AlertVariant;
}

interface AlertContextValue {
  showAlert: (message: string, variant?: AlertVariant, durationMs?: number) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLES: Record<AlertVariant, string> = {
  success: "bg-emerald-50 text-emerald-900 border-emerald-200",
  error: "bg-rose-50 text-rose-900 border-rose-200",
  info: "bg-sky-50 text-sky-900 border-sky-200",
};

export function AlertProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AlertItem[]>([]);
  const counter = useRef(0);

  const showAlert = useCallback<AlertContextValue["showAlert"]>(
    (message, variant = "info", durationMs = 5000) => {
      const id = ++counter.current;
      setItems((prev) => [...prev, { id, message, variant }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }, durationMs);
    },
    [],
  );

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            role="status"
            className={[
              "pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg animate-slide-in",
              STYLES[it.variant],
            ].join(" ")}
          >
            {(() => {
              const Icon = ICONS[it.variant];
              return <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={17} />;
            })()}
            <span className="flex-1">{it.message}</span>
          </div>
        ))}
      </div>
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlert must be used within an AlertProvider");
  return ctx;
}
