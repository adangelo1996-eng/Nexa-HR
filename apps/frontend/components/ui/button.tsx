import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const baseClasses =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60 disabled:cursor-not-allowed";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-cyan-400 text-slate-900 hover:bg-cyan-300",
  secondary: "border border-slate-600 text-slate-100 hover:bg-slate-800",
  ghost: "text-slate-300 hover:bg-slate-800/60"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-3 py-2 text-sm",
  lg: "px-4 py-2 text-base",
  xl: "px-8 py-4 text-lg"
};

function cn(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", ...props },
  ref
): React.JSX.Element {
  return (
    <button
      ref={ref}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  );
});

