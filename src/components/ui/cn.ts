/**
 * Tiny class-name joiner. Same idea as `clsx` but with no dep.
 * Falsy values are dropped; objects are not supported (keep it predictable).
 */
export function cn(
  ...inputs: Array<string | false | null | undefined>
): string {
  return inputs.filter(Boolean).join(" ");
}