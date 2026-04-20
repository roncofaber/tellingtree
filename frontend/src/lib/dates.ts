/**
 * Format a flexible genealogy date for display.
 *
 * @param date      ISO date string (primary / start date)
 * @param qualifier "exact" | "year-only" | "about" | "before" | "after" |
 *                  "between" | "estimated" | "calculated" | null
 * @param date2     ISO date string (end of range, only for "between")
 * @param original  Raw original string (used as last-resort fallback)
 */
export function formatFlexDate(
  date: string | null,
  qualifier: string | null,
  date2: string | null = null,
  original: string | null = null,
): string | null {
  if (!date && !original) return null;

  const year = (iso: string) => iso.slice(0, 4);
  const full = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };

  switch (qualifier) {
    case "year-only":
      return date ? year(date) : original;
    case "about":
      return date ? `circa ${year(date)}` : original;
    case "before":
      return date ? `before ${year(date)}` : original;
    case "after":
      return date ? `after ${year(date)}` : original;
    case "between":
      if (date && date2) return `${year(date)} – ${year(date2)}`;
      if (date) return `from ${year(date)}`;
      return original;
    case "estimated":
      return date ? `est. ${year(date)}` : original;
    case "calculated":
      return date ? `calc. ${year(date)}` : original;
    case "exact":
    default:
      return date ? full(date) : original;
  }
}
