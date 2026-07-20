import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { X } from "lucide-react";
import { useI18n } from "../i18n/useI18n";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

export function Modal({ open, onClose, title, children, footer, size = "md" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={[
          "max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-lg bg-white shadow-xl",
          sizeClasses[size],
        ].join(" ")}
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          {title ? <h3 className="text-base font-semibold text-gray-950">{title}</h3> : <span />}
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="px-5 py-5 text-sm text-gray-700">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}

interface ConfirmState {
  open: boolean;
  message: ReactNode;
  resolve: ((value: boolean) => void) | null;
}

interface ConfirmContextValue {
  confirm: (message: ReactNode) => Promise<boolean>;
}

import { createContext, useCallback, useContext, useMemo } from "react";

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [state, setState] = useState<ConfirmState>({
    open: false,
    message: null,
    resolve: null,
  });

  const confirm = useCallback<ConfirmContextValue["confirm"]>((message) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, message, resolve });
    });
  }, []);

  const handleClose = useCallback((value: boolean) => {
    setState((prev) => {
      prev.resolve?.(value);
      return { open: false, message: null, resolve: null };
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={state.open}
        onClose={() => handleClose(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => handleClose(false)}>
              {t.common.cancel}
            </Button>
            <Button variant="danger" onClick={() => handleClose(true)}>
              {t.common.confirm}
            </Button>
          </>
        }
      >
        {state.message}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
