import * as React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const baseClasses =
  "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-synapse-gold/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-60 disabled:cursor-not-allowed dark:focus-visible:ring-synapse-gold-bright/50 dark:focus-visible:ring-offset-[#0b0b0b]";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-synapse-gold text-white shadow-sm hover:brightness-110 dark:bg-synapse-gold-bright dark:text-white dark:hover:brightness-110",
  secondary:
    "border border-synapse-gold/30 bg-white/70 text-synapse-text hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/[0.06]",
  ghost:
    "text-synapse-muted hover:bg-black/[0.04] dark:text-[#c8c8c8] dark:hover:bg-white/[0.06]"
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
