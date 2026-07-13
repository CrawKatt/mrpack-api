import type { ReactNode } from "react";

interface Props {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, action, children, className = "" }: Props) {
  return (
    <section
      className={[
        "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm",
        className,
      ].join(" ")}
    >
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
