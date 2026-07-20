interface Props {
  available?: boolean;
  availableText?: string;
  unavailableText?: string;
  className?: string;
}

export function StatusBadge({
  available,
  availableText,
  unavailableText,
  className = "",
}: Props) {
  const label = available ? availableText : unavailableText;
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        available
          ? "bg-emerald-100 text-emerald-800"
          : "bg-rose-100 text-rose-800",
        className,
      ].join(" ")}
    >
      <span
        className={[
          "h-1.5 w-1.5 rounded-full",
          available ? "bg-emerald-500" : "bg-rose-500",
        ].join(" ")}
      />
      {label}
    </span>
  );
}
