import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={[
          "w-full rounded-2xl bg-white p-6 shadow-xl",
          sizeClasses[size],
        ].join(" ")}
      >
        {title ? (
          <h3 className="mb-4 text-lg font-semibold text-gray-800">{title}</h3>
        ) : null}
        <div className="text-sm text-gray-700">{children}</div>
        {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
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
              Cancel
            </Button>
            <Button variant="danger" onClick={() => handleClose(true)}>
              Confirm
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
