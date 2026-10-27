import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "destructive";
type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const baseClasses =
  "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#002D72]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f2f2f7] disabled:opacity-60 disabled:cursor-not-allowed dark:focus-visible:ring-synapse-gold-bright/50 dark:focus-visible:ring-offset-[#011528]";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[#002D72] text-white hover:bg-[#003a8c] dark:bg-synapse-gold-bright dark:text-[#011528] dark:hover:brightness-110",
  secondary:
    "border border-[var(--prom-line)] bg-[#f2f2f7] text-[#1c1c1e] hover:bg-[#e5e5ea] dark:border-white/15 dark:bg-[#0a335a] dark:text-white dark:hover:bg-[#0d3d68]",
  ghost:
    "text-[#6e6e73] hover:bg-black/[0.04] dark:text-[#b4c9dc] dark:hover:bg-white/[0.06]",
  outline:
    "border border-[#002D72]/30 bg-white text-[#002D72] hover:bg-[#f2f2f7] dark:border-white/25 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]",
  destructive:
    "border border-rose-600/40 bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:border-rose-500/50 dark:bg-rose-600 dark:hover:bg-rose-500"
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
