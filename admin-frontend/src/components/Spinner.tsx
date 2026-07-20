interface Props {
  size?: "sm" | "md";
  className?: string;
  label?: string;
}

export function Spinner({ size = "md", className = "", label }: Props) {
  const dim = size === "sm" ? "h-4 w-4 border-2" : "h-6 w-6 border-[3px]";
  return (
    <span
      role="status"
      aria-label={label || "Loading"}
      className={[
        "inline-block rounded-full animate-spin",
        "border-gray-200 border-t-emerald-600",
        dim,
        className,
      ].join(" ")}
    />
  );
}
