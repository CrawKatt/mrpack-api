import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className = "", ...rest }: Props) {
  return (
    <input
      {...rest}
      className={[
        "h-11 w-full rounded-lg border bg-white px-3 text-sm transition-colors",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2",
        invalid
          ? "border-red-400 focus:ring-red-200"
          : "border-gray-300 focus:border-primary-500 focus:ring-primary-200",
        className,
      ].join(" ")}
    />
  );
}
