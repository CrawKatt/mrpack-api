import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className = "", ...rest }: Props) {
  return (
    <input
      {...rest}
      className={[
        "h-10 w-full rounded-md border bg-white px-3 text-sm text-gray-800 transition-colors",
        "placeholder:text-gray-400",
        "focus:outline-none focus:ring-2",
        invalid
          ? "border-red-400 focus:ring-red-200"
          : "border-gray-300 focus:border-emerald-600 focus:ring-emerald-100",
        className,
      ].join(" ")}
    />
  );
}
