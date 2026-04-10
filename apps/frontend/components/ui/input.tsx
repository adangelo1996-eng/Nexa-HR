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
        "w-full rounded-lg border px-3 py-2 text-sm shadow-sm outline-none ring-0 transition",
        "border-slate-300/90 bg-white/90 text-synapse-text placeholder:text-synapse-muted/80",
        "focus:border-synapse-gold focus:ring-2 focus:ring-synapse-gold/25",
        "dark:border-white/15 dark:bg-[#052642]/90 dark:text-white dark:placeholder:text-[#b4c9dc]/70 dark:focus:border-synapse-gold-bright dark:focus:ring-synapse-gold-bright/30",
        className
      )}
      {...props}
    />
  );
});
