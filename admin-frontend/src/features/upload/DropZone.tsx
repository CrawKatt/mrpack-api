import { useCallback, useState, type DragEvent } from "react";
import { formatBytes } from "../../lib/formatBytes";

interface Props {
  accept: string;
  title: string;
  hint?: string;
  file: File | null;
  onFileSelected: (file: File | null) => void;
  variant?: "compact" | "large";
  disabled?: boolean;
}

export function DropZone({
  accept,
  title,
  hint,
  file,
  onFileSelected,
  variant = "large",
  disabled = false,
}: Props) {
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);
      if (disabled) return;
      const next = event.dataTransfer.files?.[0];
      if (next) onFileSelected(next);
    },
    [disabled, onFileSelected],
  );

  const padding = variant === "compact" ? "py-8" : "py-12";

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (disabled) return;
          const input = document.createElement("input");
          input.type = "file";
          input.accept = accept;
          input.addEventListener("change", () => {
            onFileSelected(input.files?.[0] ?? null);
          }, { once: true });
          input.click();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            (event.currentTarget as HTMLDivElement).click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-center transition-all",
          padding,
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
            : "cursor-pointer",
          !disabled && dragOver
            ? "scale-[1.01] border-primary-500 bg-primary-50"
            : !disabled
              ? "border-gray-300 bg-white hover:border-primary-500 hover:bg-primary-50/40"
              : "",
        ].join(" ")}
      >
        <div className="text-3xl">{variant === "compact" ? "🧩" : "📤"}</div>
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
      </div>
      {file ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <span className="flex-1 truncate font-medium">
            {file.name} ({formatBytes(file.size)})
          </span>
          <button
            type="button"
            onClick={() => onFileSelected(null)}
            className="rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
            aria-label="Remove selected file"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
