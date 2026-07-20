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
        "rounded-lg border border-gray-200 bg-white p-5",
        className,
      ].join(" ")}
    >
      {(title || action) && (
        <header className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
          {title ? (
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-950">
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
