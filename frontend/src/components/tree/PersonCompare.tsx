import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listPersons, mergePersons } from "@/api/persons";
import { queryKeys } from "@/lib/queryKeys";
import { getFullName, getInitials, genderColor } from "@/lib/person";
import { formatFlexDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ArrowRight, Search } from "lucide-react";
import type { Person } from "@/types/person";

function CompareField({ label, a, b }: { label: string; a: string | null; b: string | null }) {
  const same = a === b;
  const aOnly = a && !b;
  const bOnly = !a && b;
  return (
    <div className="grid grid-cols-[100px_1fr_1fr] gap-2 py-1.5 border-b border-border/50 text-sm">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className={`truncate ${!a ? "text-muted-foreground italic" : same ? "" : aOnly ? "text-emerald-600 font-medium" : "font-medium"}`}>
        {a || "—"}
      </span>
      <span className={`truncate ${!b ? "text-muted-foreground italic" : same ? "" : bOnly ? "text-emerald-600 font-medium" : "font-medium"}`}>
        {b || "—"}
      </span>
    </div>
  );
}

function PersonHeader({ person }: { person: Person }) {
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const name = getFullName(person);
  const ini = getInitials(person);
  const accent = genderColor(person.gender);
  return (
    <Link to={`/trees/${treeSlug}/people/${person.id}`} className="flex items-center gap-2 group">
      <div className={`${accent} w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0`}>{ini}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{name}</p>
        {person.birth_date && <p className="text-xs text-muted-foreground">b. {person.birth_date.slice(0, 4)}</p>}
      </div>
    </Link>
  );
}

interface Props {
  treeId: string;
  personAId?: string;
  personBId?: string;
  onMerged?: () => void;
}

export function PersonCompare({ treeId, personAId, personBId, onMerged }: Props) {
  const queryClient = useQueryClient();
  const [searchA, setSearchA] = useState("");
  const [searchB, setSearchB] = useState("");
  const [selectedA, setSelectedA] = useState<string | null>(personAId ?? null);
  const [selectedB, setSelectedB] = useState<string | null>(personBId ?? null);
  const [confirmMerge, setConfirmMerge] = useState<"a-into-b" | "b-into-a" | null>(null);

  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });

  const persons = personsData?.items ?? [];
  const personA = selectedA ? persons.find(p => p.id === selectedA) : null;
  const personB = selectedB ? persons.find(p => p.id === selectedB) : null;

  const filterPersons = (q: string, excludeId: string | null) => {
    if (q.trim().length < 1) return [];
    return persons
      .filter(p => p.id !== excludeId && getFullName(p).toLowerCase().includes(q.toLowerCase()))
      .slice(0, 6);
  };

  const mergeMut = useMutation({
    mutationFn: ({ keeperId, duplicateId }: { keeperId: string; duplicateId: string }) =>
      mergePersons(treeId, keeperId, duplicateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) });
      toast.success("Persons merged");
      setConfirmMerge(null);
      onMerged?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Merge failed"),
  });

  const fmtDate = (p: Person, field: "birth" | "death") => {
    const d = field === "birth" ? p.birth_date : p.death_date;
    const q = field === "birth" ? p.birth_date_qualifier : p.death_date_qualifier;
    const d2 = field === "birth" ? p.birth_date_2 : p.death_date_2;
    const orig = field === "birth" ? p.birth_date_original : p.death_date_original;
    return formatFlexDate(d, q, d2, orig);
  };

  return (
    <div className="space-y-4">
      {/* Person selectors */}
      <div className="grid grid-cols-[100px_1fr_1fr] gap-2">
        <div />
        <div className="space-y-1">
          {personA ? (
            <div className="flex items-center justify-between">
              <PersonHeader person={personA} />
              <button onClick={() => { setSelectedA(null); setSearchA(""); }} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-1 border rounded-md px-2 bg-background">
                <Search className="h-3 w-3 text-muted-foreground" />
                <input value={searchA} onChange={e => setSearchA(e.target.value)} placeholder="Search person A…"
                  className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              {searchA.trim() && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
                  {filterPersons(searchA, selectedB).map(p => (
                    <button key={p.id} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors"
                      onClick={() => { setSelectedA(p.id); setSearchA(""); }}>
                      <span className="font-medium truncate">{getFullName(p)}</span>
                      {p.birth_date && <span className="text-xs text-muted-foreground ml-auto">b. {p.birth_date.slice(0, 4)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="space-y-1">
          {personB ? (
            <div className="flex items-center justify-between">
              <PersonHeader person={personB} />
              <button onClick={() => { setSelectedB(null); setSearchB(""); }} className="text-xs text-muted-foreground hover:text-foreground">Change</button>
            </div>
          ) : (
            <div className="relative">
              <div className="flex items-center gap-1 border rounded-md px-2 bg-background">
                <Search className="h-3 w-3 text-muted-foreground" />
                <input value={searchB} onChange={e => setSearchB(e.target.value)} placeholder="Search person B…"
                  className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </div>
              {searchB.trim() && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
                  {filterPersons(searchB, selectedA).map(p => (
                    <button key={p.id} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted transition-colors"
                      onClick={() => { setSelectedB(p.id); setSearchB(""); }}>
                      <span className="font-medium truncate">{getFullName(p)}</span>
                      {p.birth_date && <span className="text-xs text-muted-foreground ml-auto">b. {p.birth_date.slice(0, 4)}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Comparison */}
      {personA && personB && (
        <>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[100px_1fr_1fr] gap-2 px-3 py-2 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Field</span>
              <span>Person A</span>
              <span>Person B</span>
            </div>
            <div className="px-3">
              <CompareField label="Given name" a={personA.given_name} b={personB.given_name} />
              <CompareField label="Family name" a={personA.family_name} b={personB.family_name} />
              <CompareField label="Maiden name" a={personA.maiden_name} b={personB.maiden_name} />
              <CompareField label="Nickname" a={personA.nickname} b={personB.nickname} />
              <CompareField label="Gender" a={personA.gender} b={personB.gender} />
              <CompareField label="Birth date" a={fmtDate(personA, "birth")} b={fmtDate(personB, "birth")} />
              <CompareField label="Birth place" a={personA.birth_location} b={personB.birth_location} />
              <CompareField label="Death date" a={fmtDate(personA, "death")} b={fmtDate(personB, "death")} />
              <CompareField label="Death place" a={personA.death_location} b={personB.death_location} />
              <CompareField label="Occupation" a={personA.occupation} b={personB.occupation} />
              <CompareField label="Education" a={personA.education} b={personB.education} />
              <CompareField label="Nationalities" a={personA.nationalities?.join(", ") ?? null} b={personB.nationalities?.join(", ") ?? null} />
              <CompareField label="Living" a={personA.is_living === true ? "Yes" : personA.is_living === false ? "No" : null} b={personB.is_living === true ? "Yes" : personB.is_living === false ? "No" : null} />
            </div>
          </div>

          {/* Merge actions */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmMerge("b-into-a")}>
              Keep A, merge B <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setConfirmMerge("a-into-b")}>
              Keep B, merge A <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>

          <ConfirmDialog
            open={!!confirmMerge}
            onClose={() => setConfirmMerge(null)}
            onConfirm={() => {
              if (confirmMerge === "b-into-a") mergeMut.mutate({ keeperId: personA.id, duplicateId: personB.id });
              else if (confirmMerge === "a-into-b") mergeMut.mutate({ keeperId: personB.id, duplicateId: personA.id });
            }}
            title="Confirm merge"
            message={confirmMerge === "b-into-a"
              ? `Keep "${getFullName(personA)}" and merge all data from "${getFullName(personB)}" into them. All relationships, stories, and media from ${getFullName(personB)} will be transferred and they will be deleted. This cannot be undone.`
              : `Keep "${getFullName(personB)}" and merge all data from "${getFullName(personA)}" into them. All relationships, stories, and media from ${getFullName(personA)} will be transferred and they will be deleted. This cannot be undone.`
            }
            confirmLabel="Merge"
            isPending={mergeMut.isPending}
          />
        </>
      )}
    </div>
  );
}
