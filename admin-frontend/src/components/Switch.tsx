import type { ButtonHTMLAttributes } from "react";

type SwitchSize = "sm" | "md";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: SwitchSize;
  tone?: "emerald" | "amber";
  label?: string;
  description?: string;
}

const trackSize: Record<SwitchSize, string> = {
  sm: "h-5 w-9 p-0.5",
  md: "h-6 w-11 p-0.5",
};

const thumbSize: Record<SwitchSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
};

const toneOn: Record<"emerald" | "amber", string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
};

/**
 * Accessible toggle switch.
 * Uses flex start/end alignment so the thumb never overflows the track.
 */
export function Switch({
  checked,
  onCheckedChange,
  size = "md",
  tone = "emerald",
  label,
  description,
  disabled,
  className = "",
  id,
  ...rest
}: Props) {
  const switchId =
    id ?? (label ? `switch-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  const control = (
    <button
      {...rest}
      id={switchId}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        event.preventDefault();
        if (!disabled) onCheckedChange(!checked);
      }}
      className={[
        "inline-flex shrink-0 items-center rounded-full border-0 transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#151b18]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        trackSize[size],
        checked ? `justify-end ${toneOn[tone]}` : "justify-start bg-gray-300 dark:bg-gray-600",
        className,
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "block rounded-full bg-white shadow-sm transition-transform duration-200",
          thumbSize[size],
        ].join(" ")}
      />
    </button>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div
      className={[
        "flex items-center justify-between gap-3",
        disabled ? "opacity-90" : "",
      ].join(" ")}
    >
      <div className="min-w-0">
        {label ? (
          <label
            htmlFor={switchId}
            className={[
              "block text-sm text-gray-700 dark:text-gray-200",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            {label}
          </label>
        ) : null}
        {description ? (
          <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>
        ) : null}
      </div>
      {control}
    </div>
  );
}
