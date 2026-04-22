export function getFullName(p: { given_name?: string | null; family_name?: string | null }): string {
  return [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
}

export function getInitials(p: { given_name?: string | null; family_name?: string | null }): string {
  return ((p.given_name?.[0] ?? "") + (p.family_name?.[0] ?? "")).toUpperCase() || "?";
}

export function genderColor(g: string | null | undefined): string {
  if (g === "male"   || g === "m") return "bg-blue-500";
  if (g === "female" || g === "f") return "bg-rose-500";
  if (g === "other"  || g === "o") return "bg-amber-500";
  return "bg-slate-400";
}
