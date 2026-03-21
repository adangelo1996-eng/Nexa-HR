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
        "border-slate-300/90 bg-white/85 text-slate-900 placeholder:text-slate-500",
        "focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30",
        "dark:border-slate-700 dark:bg-slate-950/65 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-400 dark:focus:ring-cyan-500/35",
        className
      )}
      {...props}
    />
  );
});
