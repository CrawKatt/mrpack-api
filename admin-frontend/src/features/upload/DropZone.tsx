import { useCallback, useState, type DragEvent } from "react";
import { FileArchive, PackagePlus, X } from "lucide-react";
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
  const Icon = accept.includes(".jar") ? PackagePlus : FileArchive;

  const openPicker = () => {
    if (disabled) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => onFileSelected(input.files?.[0] ?? null), { once: true });
    input.click();
  };

  const onDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    if (!disabled) onFileSelected(event.dataTransfer.files?.[0] ?? null);
  }, [disabled, onFileSelected]);

  return (
    <div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          "flex flex-col items-center justify-center rounded-md border border-dashed px-4 text-center transition-colors",
          variant === "compact" ? "min-h-32" : "min-h-40",
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
            : dragOver
              ? "cursor-copy border-emerald-500 bg-emerald-50"
              : "cursor-pointer border-gray-300 bg-gray-50 hover:border-emerald-500 hover:bg-emerald-50/60",
        ].join(" ")}
      >
        <span className="grid h-10 w-10 place-items-center rounded-md bg-white text-gray-500 shadow-sm">
          <Icon size={20} />
        </span>
        <p className="mt-3 text-xs font-semibold leading-5 text-gray-700">{title}</p>
        {hint ? <p className="mt-1 text-[10px] leading-4 text-gray-400">{hint}</p> : null}
      </div>
      {file ? (
        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <FileArchive size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
          <span className="shrink-0 text-[10px] text-sky-600">{formatBytes(file.size)}</span>
          <button
            type="button"
            onClick={() => onFileSelected(null)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded text-sky-600 hover:bg-sky-100"
            aria-label="Remove selected file"
          >
            <X size={13} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
