import { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "default" | "private" | "public" | "muted" | "warn";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

const tones: Record<Tone, string> = {
  default: "border-gray-4 text-gray-9 bg-gray-2",
  // Private repos: filled inverted pill — reads as "important / restricted"
  private: "border-white bg-white text-black",
  // Public: hairline only
  public: "border-gray-4 text-gray-8 bg-transparent",
  muted: "border-gray-4 text-gray-7 bg-transparent",
  warn: "border-yellow-500/40 text-yellow-500 bg-yellow-500/10",
};

export function Badge({ tone = "default", className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}