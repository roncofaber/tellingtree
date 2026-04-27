import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { queryKeys } from "@/lib/queryKeys";
import { getFullName } from "@/lib/person";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { PersonCompare } from "@/components/tree/PersonCompare";
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, GitCompareArrows, X } from "lucide-react";
import type { Person } from "@/types/person";

interface Issue {
  type: "duplicate" | "missing-date" | "missing-gender" | "ungeocoded" | "orphan" | "no-bio" | "unrealistic-age";
  severity: "warning" | "info";
  label: string;
  persons: Person[];
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadDismissed(treeId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`health:dismissed:${treeId}`);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveDismissed(treeId: string, set: Set<string>) {
  localStorage.setItem(`health:dismissed:${treeId}`, JSON.stringify([...set]));
}

// Duplicate groups are dismissed by a key over all person IDs in the group
function dupKey(persons: Person[]) {
  return `duplicate:${persons.map(p => p.id).sort().join(":")}`;
}

// Per-person issues are dismissed individually
function personKey(type: string, personId: string) {
  return `${type}:${personId}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TreeHealthTab({ treeId }: { treeId: string }) {
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed(treeId));
  const [showDismissed, setShowDismissed] = useState(false);

  const dismiss = (key: string) => setDismissed(prev => {
    const next = new Set(prev); next.add(key); saveDismissed(treeId, next); return next;
  });
  const restore = (key: string) => setDismissed(prev => {
    const next = new Set(prev); next.delete(key); saveDismissed(treeId, next); return next;
  });

  const { data: personsData, isLoading: pLoad } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });

  const { data: relsData, isLoading: rLoad } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn: () => listRelationships(treeId, 0, 50000),
  });

  const persons = personsData?.items ?? [];

  const allIssues = useMemo((): Issue[] => {
    const result: Issue[] = [];

    // Duplicates
    const nameMap = new Map<string, Person[]>();
    for (const p of persons) {
      const key = [p.given_name, p.family_name].filter(Boolean).join(" ").toLowerCase();
      if (!key) continue;
      if (!nameMap.has(key)) nameMap.set(key, []);
      nameMap.get(key)!.push(p);
    }
    for (const [, group] of nameMap) {
      if (group.length < 2) continue;
      const years = group.map(p => p.birth_date ? parseInt(p.birth_date.slice(0, 4), 10) : null);
      const knownYears = years.filter((y): y is number => y !== null);
      if (knownYears.length >= 2 && Math.max(...knownYears) - Math.min(...knownYears) > 15) continue;
      result.push({ type: "duplicate", severity: "warning", label: `Possible duplicate: ${getFullName(group[0])}`, persons: group });
    }

    const noBirth = persons.filter(p => !p.birth_date);
    if (noBirth.length > 0) result.push({ type: "missing-date", severity: "info", label: "Missing birth date", persons: noBirth });

    const noGender = persons.filter(p => !p.gender || p.gender === "unknown");
    if (noGender.length > 0) result.push({ type: "missing-gender", severity: "info", label: "Missing or unknown gender", persons: noGender });

    const ungeocoded = persons.filter(p => (p.birth_location && !p.birth_place_id) || (p.death_location && !p.death_place_id));
    if (ungeocoded.length > 0) result.push({ type: "ungeocoded", severity: "info", label: "Ungeocoded locations", persons: ungeocoded });

    const relPersonIds = new Set<string>();
    for (const r of relsData?.items ?? []) { relPersonIds.add(r.person_a_id); relPersonIds.add(r.person_b_id); }
    const orphans = persons.filter(p => !relPersonIds.has(p.id));
    if (orphans.length > 0) result.push({ type: "orphan", severity: "warning", label: "No relationships (disconnected)", persons: orphans });

    const noBio = persons.filter(p => !p.bio);
    if (noBio.length > 0) result.push({ type: "no-bio", severity: "info", label: "Missing biography", persons: noBio });

    const currentYear = new Date().getFullYear();
    const unrealisticAge = persons.filter(p => {
      if (!p.birth_date) return false;
      const birthYear = parseInt(p.birth_date.slice(0, 4), 10);
      if (isNaN(birthYear)) return false;
      const endYear = p.death_date ? parseInt(p.death_date.slice(0, 4), 10) : currentYear;
      return !isNaN(endYear) && endYear - birthYear > 125;
    });
    if (unrealisticAge.length > 0) result.push({ type: "unrealistic-age", severity: "warning", label: "Unrealistic age (over 125 years)", persons: unrealisticAge });

    return result;
  }, [persons, relsData]);

  // Split into active (not dismissed) and dismissed
  const { activeIssues, dismissedItems } = useMemo(() => {
    const active: Issue[] = [];
    const dismissedItems: Array<{ key: string; label: string }> = [];

    for (const issue of allIssues) {
      if (issue.type === "duplicate") {
        const key = dupKey(issue.persons);
        if (dismissed.has(key)) {
          const names = issue.persons.map(p => getFullName(p)).join(" & ");
          dismissedItems.push({ key, label: `Duplicate: ${names}` });
        } else {
          active.push(issue);
        }
      } else {
        const activePersons = issue.persons.filter(p => {
          const key = personKey(issue.type, p.id);
          if (dismissed.has(key)) {
            dismissedItems.push({ key, label: `${getFullName(p)} — ${issue.label}` });
            return false;
          }
          return true;
        });
        if (activePersons.length > 0) active.push({ ...issue, persons: activePersons });
      }
    }

    return { activeIssues: active, dismissedItems };
  }, [allIssues, dismissed]);

  if (pLoad || rLoad) return <LoadingSpinner />;

  if (activeIssues.length === 0 && dismissedItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <CheckCircle className="h-10 w-10 text-emerald-500" />
        <p className="text-sm font-medium">Your tree looks great!</p>
        <p className="text-xs text-muted-foreground">No issues or suggestions found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{activeIssues.length} suggestion{activeIssues.length !== 1 ? "s" : ""} to improve your tree data.</p>
        <Button variant="outline" size="sm" onClick={() => setCompareIds(["", ""])}>
          <GitCompareArrows className="h-3.5 w-3.5 mr-1.5" /> Compare
        </Button>
      </div>

      {/* Compare panel */}
      {compareIds && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Compare persons</h3>
            <button onClick={() => setCompareIds(null)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
          </div>
          <PersonCompare
            treeId={treeId}
            personAId={compareIds[0] || undefined}
            personBId={compareIds[1] || undefined}
            onMerged={() => setCompareIds(null)}
          />
        </div>
      )}

      {/* Active issues */}
      <div className="space-y-4">
        {activeIssues.map((issue, i) => (
          <div key={i} className={`rounded-lg border overflow-hidden ${issue.severity === "warning" ? "border-l-2 border-l-amber-400" : ""}`}>
            <div className={`flex items-center gap-2 px-4 py-3 ${issue.severity === "warning" ? "bg-amber-500/5" : "bg-muted/30"}`}>
              <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${issue.severity === "warning" ? "text-amber-500" : "text-muted-foreground"}`} />
              <span className="text-sm font-semibold">{issue.label}</span>
              <Badge variant="secondary" className="ml-auto text-xs tabular-nums">{issue.persons.length}</Badge>
              {issue.type === "duplicate" && issue.persons.length === 2 && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                  onClick={() => setCompareIds([issue.persons[0].id, issue.persons[1].id])}>
                  Compare
                </Button>
              )}
              {issue.type === "duplicate" && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  title="Not a duplicate — hide this"
                  onClick={() => dismiss(dupKey(issue.persons))}>
                  <X className="h-3 w-3 mr-1" /> Dismiss
                </Button>
              )}
            </div>
            <div className="px-3 py-1.5 max-h-[240px] overflow-y-auto">
              {issue.persons.map(p => {
                const name = getFullName(p);
                const year = p.birth_date?.slice(0, 4);
                return (
                  <div key={p.id} className="flex items-center justify-between px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/60 group transition-colors">
                    <Link
                      to={`/trees/${treeSlug}/people/${p.id}`}
                      className="text-sm font-medium flex-1 min-w-0 truncate hover:text-primary transition-colors"
                    >
                      {name}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {year && <span className="text-xs text-muted-foreground tabular-nums">{year}</span>}
                      {issue.type !== "duplicate" && (
                        <button
                          onClick={() => dismiss(personKey(issue.type, p.id))}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          title="Mark as not an issue"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Dismissed section */}
      {dismissedItems.length > 0 && (
        <div className="rounded-lg border border-dashed">
          <button
            className="flex items-center justify-between w-full px-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowDismissed(v => !v)}
          >
            <span>Dismissed ({dismissedItems.length})</span>
            {showDismissed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showDismissed && (
            <div className="px-4 pb-3 space-y-1 border-t">
              {dismissedItems.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-1 text-sm text-muted-foreground">
                  <span className="truncate">{label}</span>
                  <button
                    onClick={() => restore(key)}
                    className="text-xs text-primary hover:underline ml-3 shrink-0"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
