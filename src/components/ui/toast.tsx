import { ReactNode } from "react";
import { cn } from "./cn";

type Variant = "info" | "success" | "error";

interface ToastProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

const variants: Record<Variant, string> = {
  info: "border-gray-4 bg-gray-2 text-gray-9",
  success: "border-white bg-white text-black",
  error: "border-red-500/40 bg-red-500/10 text-red-400",
};

/**
 * Inline notification. Mounted by the parent; no global toast manager —
 * intentionally simple. Wrap with your own provider if you need queueing.
 */
export function Toast({ variant = "info", children, className }: ToastProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border px-3.5 py-2.5 text-sm",
        variants[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}