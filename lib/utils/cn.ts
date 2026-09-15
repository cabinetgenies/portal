/** Tiny class-name joiner — avoids pulling in a dependency for two lines. */
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
