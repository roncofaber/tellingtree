import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listPersons, deletePerson } from "@/api/persons";
import { queryKeys } from "@/lib/queryKeys";
import { formatFlexDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { AddPersonDialog } from "@/components/common/AddPersonDialog";
import type { Person } from "@/types/person";

type SortKey = "name-asc" | "name-desc" | "birth-asc" | "birth-desc" | "added-desc";

function sortPersons(persons: Person[], sort: SortKey): Person[] {
  return [...persons].sort((a, b) => {
    const nameA = [a.given_name, a.family_name].filter(Boolean).join(" ").toLowerCase();
    const nameB = [b.given_name, b.family_name].filter(Boolean).join(" ").toLowerCase();
    switch (sort) {
      case "name-asc":   return nameA.localeCompare(nameB);
      case "name-desc":  return nameB.localeCompare(nameA);
      case "birth-asc":  return (a.birth_date ?? "9999").localeCompare(b.birth_date ?? "9999");
      case "birth-desc": return (b.birth_date ?? "0000").localeCompare(a.birth_date ?? "0000");
      case "added-desc": return b.created_at.localeCompare(a.created_at);
      default: return 0;
    }
  });
}

export function PersonsTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();

  // Filter state
  const [search,  setSearch]  = useState("");
  const [sexFilter, setSexFilter] = useState<string>("all");
  const [sort,    setSort]    = useState<SortKey>("name-asc");

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn:  () => listPersons(treeId, 0, 50000),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deletePerson(treeId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) });
      toast.success("Person deleted");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to delete person");
    },
  });

  // Client-side filter + sort
  const filtered = useMemo(() => {
    let items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (q) items = items.filter((p) => {
      const name = [p.given_name, p.family_name, p.nickname, p.maiden_name]
        .filter(Boolean).join(" ").toLowerCase();
      return name.includes(q);
    });
    if (sexFilter !== "all") items = items.filter((p) => (p.gender ?? "unknown") === sexFilter);
    return sortPersons(items, sort);
  }, [data, search, sexFilter, sort]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48"
          />
          <Select value={sexFilter} onValueChange={(v) => { if (v !== null) setSexFilter(v); }}>
            <SelectTrigger className="h-8 w-32">
              <span className="text-sm">{sexFilter === "all" ? "All sexes" : sexFilter.charAt(0).toUpperCase() + sexFilter.slice(1)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sexes</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { if (v !== null) setSort(v as SortKey); }}>
            <SelectTrigger className="h-8 w-36">
              <span className="text-sm">Sort: {sort.replace("-", " ").replace("asc", "↑").replace("desc", "↓")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name A→Z</SelectItem>
              <SelectItem value="name-desc">Name Z→A</SelectItem>
              <SelectItem value="birth-asc">Birth (oldest)</SelectItem>
              <SelectItem value="birth-desc">Birth (newest)</SelectItem>
              <SelectItem value="added-desc">Recently added</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length} / {data?.total ?? 0}
          </span>
        </div>
        <Button className="h-8 shrink-0" onClick={() => setAddDialogOpen(true)}>+ Add Person</Button>
        <AddPersonDialog open={addDialogOpen} treeId={treeId} onClose={() => setAddDialogOpen(false)} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Born</TableHead>
            <TableHead>Died</TableHead>
            <TableHead>Sex</TableHead>
            <TableHead>Occupation</TableHead>
            <TableHead className="w-20">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((p) => {
            const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
            const born = formatFlexDate(p.birth_date, p.birth_date_qualifier, p.birth_date_2, p.birth_date_original);
            const died = formatFlexDate(p.death_date, p.death_date_qualifier, p.death_date_2, p.death_date_original);
            return (
              <TableRow key={p.id}>
                <TableCell className="max-w-[250px]">
                  <Link to={`/trees/${treeId}/persons/${p.id}`} className="text-primary hover:underline font-medium truncate block" title={name}>
                    {name}
                  </Link>
                  {p.nickname && <span className="text-xs text-muted-foreground truncate block">"{p.nickname}"</span>}
                </TableCell>
                <TableCell className="text-sm">{born ?? "—"}</TableCell>
                <TableCell className="text-sm">{died ?? "—"}</TableCell>
                <TableCell className="text-sm capitalize">{p.gender ?? "—"}</TableCell>
                <TableCell className="text-sm">{p.occupation ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate(p.id)} disabled={deleteMut.isPending}>Del</Button>
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                {search || sexFilter !== "all" ? "No people match the current filters." : "No people yet."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
