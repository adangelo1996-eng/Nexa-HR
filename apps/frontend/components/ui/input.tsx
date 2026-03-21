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
        "w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 shadow-sm outline-none ring-0 transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/40 placeholder:text-slate-500",
        className
      )}
      {...props}
    />
  );
});

