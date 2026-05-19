import { ReactNode } from "react";
import { cn } from "./cn";

interface StateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Generic state container — used for empty, loading-failed, no-results.
 * Centered text on a card-like outline, lots of vertical air.
 */
export function State({
  icon,
  title,
  description,
  action,
  className,
}: StateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed border-gray-4 bg-transparent px-6 py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 text-gray-7" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-medium text-gray-9">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm text-gray-7">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  retry,
}: {
  title?: string;
  description?: string;
  retry?: () => void;
}) {
  return (
    <State
      icon={
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      }
      title={title}
      description={description}
      action={
        retry ? (
          <button
            onClick={retry}
            className="text-sm font-medium text-white underline underline-offset-4 hover:text-gray-9"
          >
            Try again
          </button>
        ) : undefined
      }
    />
  );
}