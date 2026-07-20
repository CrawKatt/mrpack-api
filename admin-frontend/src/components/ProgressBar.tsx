interface Props {
  value: number;
  className?: string;
}

export function ProgressBar({ value, className = "" }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={["h-1.5 w-full overflow-hidden rounded-full bg-gray-200", className].join(" ")}
    >
      <div
        className="h-full bg-emerald-600 transition-[width] duration-150"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
