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
import { AlertTriangle, CheckCircle, GitCompareArrows } from "lucide-react";
import type { Person } from "@/types/person";

interface Issue {
  type: "duplicate" | "missing-date" | "missing-gender" | "ungeocoded" | "orphan" | "no-bio";
  severity: "warning" | "info";
  label: string;
  persons: Person[];
}

export function TreeHealthTab({ treeId }: { treeId: string }) {
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);

  const { data: personsData, isLoading: pLoad } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });

  const { data: relsData, isLoading: rLoad } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn: () => listRelationships(treeId, 0, 50000),
  });

  const persons = personsData?.items ?? [];

  const issues = useMemo((): Issue[] => {
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
      // Only flag if birth years are within 20 years of each other (or either is missing)
      const years = group.map(p => p.birth_date ? parseInt(p.birth_date.slice(0, 4), 10) : null);
      const knownYears = years.filter((y): y is number => y !== null);
      if (knownYears.length >= 2) {
        const spread = Math.max(...knownYears) - Math.min(...knownYears);
        if (spread > 15) continue;
      }
      result.push({
        type: "duplicate",
        severity: "warning",
        label: `Possible duplicate: ${getFullName(group[0])}`,
        persons: group,
      });
    }

    // Missing birth date
    const noBirth = persons.filter(p => !p.birth_date);
    if (noBirth.length > 0) {
      result.push({ type: "missing-date", severity: "info", label: "Missing birth date", persons: noBirth });
    }

    // Missing gender
    const noGender = persons.filter(p => !p.gender || p.gender === "unknown");
    if (noGender.length > 0) {
      result.push({ type: "missing-gender", severity: "info", label: "Missing or unknown gender", persons: noGender });
    }

    // Ungeocoded locations
    const ungeocoded = persons.filter(p =>
      (p.birth_location && !p.birth_place_id) || (p.death_location && !p.death_place_id)
    );
    if (ungeocoded.length > 0) {
      result.push({ type: "ungeocoded", severity: "info", label: "Ungeocoded locations", persons: ungeocoded });
    }

    // Orphans
    const relPersonIds = new Set<string>();
    for (const r of relsData?.items ?? []) {
      relPersonIds.add(r.person_a_id);
      relPersonIds.add(r.person_b_id);
    }
    const orphans = persons.filter(p => !relPersonIds.has(p.id));
    if (orphans.length > 0) {
      result.push({ type: "orphan", severity: "warning", label: "No relationships (disconnected)", persons: orphans });
    }

    // No bio
    const noBio = persons.filter(p => !p.bio);
    if (noBio.length > 0) {
      result.push({ type: "no-bio", severity: "info", label: "Missing biography", persons: noBio });
    }

    return result;
  }, [persons, relsData]);

  if (pLoad || rLoad) return <LoadingSpinner />;

  if (issues.length === 0) {
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
        <p className="text-sm text-muted-foreground">{issues.length} suggestion{issues.length !== 1 ? "s" : ""} to improve your tree data.</p>
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

      {issues.map((issue, i) => (
        <div key={i} className="rounded-lg border">
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/30">
            <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${issue.severity === "warning" ? "text-amber-500" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">{issue.label}</span>
            <Badge variant="secondary" className="ml-auto text-xs">{issue.persons.length}</Badge>
            {issue.type === "duplicate" && issue.persons.length === 2 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                onClick={() => setCompareIds([issue.persons[0].id, issue.persons[1].id])}>
                Compare
              </Button>
            )}
          </div>
          <div className="px-4 py-2 max-h-[200px] overflow-y-auto">
            <div className="space-y-0.5">
              {issue.persons.slice(0, 20).map(p => {
                const name = getFullName(p);
                const year = p.birth_date?.slice(0, 4);
                return (
                  <Link
                    key={p.id}
                    to={`/trees/${treeSlug}/people/${p.id}`}
                    className="flex items-center justify-between py-1 text-sm hover:text-primary transition-colors"
                  >
                    <span className="truncate">{name}</span>
                    {year && <span className="text-xs text-muted-foreground ml-2 shrink-0">b. {year}</span>}
                  </Link>
                );
              })}
              {issue.persons.length > 20 && (
                <p className="text-xs text-muted-foreground py-1">+{issue.persons.length - 20} more</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
