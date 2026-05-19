import { HTMLAttributes, forwardRef } from "react";
import { cn } from "./cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

/**
 * Card — the dominant container in the UI.
 * Hairline border, near-black background, optional hover state.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, className, ...rest }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-md border border-gray-4 bg-gray-1",
        interactive &&
          "cursor-pointer transition-colors duration-150 hover:border-gray-5 hover:bg-gray-2",
        className,
      )}
      {...rest}
    />
  ),
);
Card.displayName = "Card";

export function CardHeader({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-gray-4 px-5 py-4", className)}
      {...rest}
    />
  );
}

export function CardBody({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

export function CardFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "border-t border-gray-4 bg-gray-2/40 px-5 py-3",
        className,
      )}
      {...rest}
    />
  );
}