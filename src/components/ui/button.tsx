import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  // Inverted (white on black) — primary CTA. Vercel uses this for "Deploy".
  primary:
    "bg-white text-black border border-white hover:bg-gray-9 active:bg-gray-8 disabled:bg-gray-5 disabled:text-gray-7 disabled:border-gray-5",
  // Hairline border on dark — secondary actions.
  secondary:
    "bg-transparent text-white border border-gray-4 hover:bg-gray-3 hover:border-gray-5 active:bg-gray-2 disabled:text-gray-6",
  // No border — tertiary / inline.
  ghost:
    "bg-transparent text-gray-9 border border-transparent hover:bg-gray-3 active:bg-gray-2 disabled:text-gray-6",
  // Red is the one exception to "black & white" — disconnect/destructive only.
  danger:
    "bg-transparent text-red-500 border border-gray-4 hover:bg-red-500/10 hover:border-red-500/40 active:bg-red-500/20 disabled:text-gray-6 disabled:border-gray-4",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium",
          "transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          "disabled:cursor-not-allowed",
          variants[variant],
          sizes[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
          />
        ) : null}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";