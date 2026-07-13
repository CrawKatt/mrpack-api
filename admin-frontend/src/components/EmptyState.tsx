import type { ReactNode } from "react";

interface Props {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, className = "" }: Props) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center",
        className,
      ].join(" ")}
    >
      {icon ? <div className="text-3xl">{icon}</div> : null}
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {description ? (
        <p className="text-xs text-gray-500">{description}</p>
      ) : null}
    </div>
  );
}
