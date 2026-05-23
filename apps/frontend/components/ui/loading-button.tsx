import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

export interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(function LoadingButton(
  { loading = false, disabled, children, ...props },
  ref
): React.JSX.Element {
  return (
    <Button ref={ref} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
});
