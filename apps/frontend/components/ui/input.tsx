import * as React from "react";

function cn(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = "text", ...props },
  ref
): React.JSX.Element {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none ring-0 transition",
        "border-[var(--prom-line)] bg-white text-[#1c1c1e] placeholder:text-[#6e6e73]",
        "focus:border-[#002D72] focus:ring-2 focus:ring-[#002D72]/20",
        "dark:border-white/15 dark:bg-[#052642]/90 dark:text-white dark:placeholder:text-[#b4c9dc]/70 dark:focus:border-synapse-gold-bright dark:focus:ring-synapse-gold-bright/30",
        className
      )}
      {...props}
    />
  );
});
