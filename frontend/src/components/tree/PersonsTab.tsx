import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listPersons, deletePerson } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { EditIcon, DeleteIcon } from "@/components/common/ActionIcons";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const queryClient = useQueryClient();

  // Filter state
  const [search,  setSearch]  = useState("");
  const [sexFilter, setSexFilter] = useState<string>("all");
  const [livingFilter, setLivingFilter] = useState<string>("all");
  const [sort,    setSort]    = useState<SortKey>("name-asc");

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn:  () => listPersons(treeId, 0, 50000),
  });

  const { data: relsData } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn: () => listRelationships(treeId, 0, 50000),
  });

  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of relsData?.items ?? []) {
      counts.set(r.person_a_id, (counts.get(r.person_a_id) ?? 0) + 1);
      counts.set(r.person_b_id, (counts.get(r.person_b_id) ?? 0) + 1);
    }
    return counts;
  }, [relsData]);

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
    setPage(0);
    let items = data?.items ?? [];
    const q = normalize(search.trim());
    if (q) items = items.filter((p) => {
      const name = normalize([p.given_name, p.family_name, p.nickname, p.maiden_name].filter(Boolean).join(" "));
      return name.includes(q);
    });
    if (sexFilter !== "all") items = items.filter((p) => (p.gender ?? "unknown") === sexFilter);
    if (livingFilter === "living") items = items.filter((p) => p.is_living === true);
    if (livingFilter === "deceased") items = items.filter((p) => p.is_living === false);
    return sortPersons(items, sort);
  }, [data, search, sexFilter, livingFilter, sort]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between shrink-0">
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-full sm:w-48"
          />
          <Select value={sexFilter} onValueChange={(v) => { if (v !== null) setSexFilter(v); }}>
            <SelectTrigger className="h-8 w-36">
              <span className="text-sm">{sexFilter === "all" ? "All sexes" : sexFilter.charAt(0).toUpperCase() + sexFilter.slice(1)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sexes</SelectItem>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          <Select value={livingFilter} onValueChange={(v) => { if (v !== null) setLivingFilter(v); }}>
            <SelectTrigger className="h-8 w-36">
              <span className="text-sm">{livingFilter === "all" ? "All status" : livingFilter === "living" ? "Living" : "Deceased"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="living">Living</SelectItem>
              <SelectItem value="deceased">Deceased</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { if (v !== null) setSort(v as SortKey); }}>
            <SelectTrigger className="h-8 w-40">
              <span className="text-sm">{sort === "name-asc" ? "Name A→Z" : sort === "name-desc" ? "Name Z→A" : sort === "birth-asc" ? "Birth (oldest)" : sort === "birth-desc" ? "Birth (newest)" : "Recently added"}</span>
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
            {filtered.length} / {data?.total ?? 0} people
          </span>
        </div>
        <Button className="h-8 shrink-0" onClick={() => setAddDialogOpen(true)}>+ Add Person</Button>
        <AddPersonDialog open={addDialogOpen} treeId={treeId} onClose={() => setAddDialogOpen(false)} />
      </div>

      <div className="border rounded-lg flex flex-col min-h-0 flex-1">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[25%]" />
            <col className="hidden sm:table-column w-[15%]" />
            <col className="hidden sm:table-column w-[15%]" />
            <col className="hidden md:table-column w-[8%]" />
            <col className="hidden md:table-column w-[15%]" />
            <col className="hidden lg:table-column w-[8%]" />
            <col className="w-[14%]" />
          </colgroup>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Born</TableHead>
              <TableHead className="hidden sm:table-cell">Died</TableHead>
              <TableHead className="hidden md:table-cell">Sex</TableHead>
              <TableHead className="hidden md:table-cell">Occupation</TableHead>
              <TableHead className="hidden lg:table-cell">Links</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
        </Table>
        <div className="overflow-auto flex-1 min-h-0">
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[25%]" />
            <col className="hidden sm:table-column w-[15%]" />
            <col className="hidden sm:table-column w-[15%]" />
            <col className="hidden md:table-column w-[8%]" />
            <col className="hidden md:table-column w-[15%]" />
            <col className="hidden lg:table-column w-[8%]" />
            <col className="w-[14%]" />
          </colgroup>
          <TableBody>
          {paginated.map((p) => {
            const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
            const born = formatFlexDate(p.birth_date, p.birth_date_qualifier, p.birth_date_2, p.birth_date_original);
            const died = formatFlexDate(p.death_date, p.death_date_qualifier, p.death_date_2, p.death_date_original);
            return (
              <TableRow key={p.id}>
                <TableCell className="max-w-[250px]">
                  <Link to={`/trees/${treeSlug}/people/${p.id}`} className="text-primary hover:underline font-medium truncate block" title={name}>
                    {name}
                  </Link>
                  {p.nickname && <span className="text-xs text-muted-foreground truncate block">"{p.nickname}"</span>}
                </TableCell>
                <TableCell className="text-sm hidden sm:table-cell">{born ?? "—"}</TableCell>
                <TableCell className="text-sm hidden sm:table-cell">{died ?? "—"}</TableCell>
                <TableCell className="text-sm capitalize hidden md:table-cell">{p.gender ?? "—"}</TableCell>
                <TableCell className="text-sm hidden md:table-cell">{p.occupation ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">{connectionCounts.get(p.id) ?? 0}</TableCell>
                <TableCell>
                  <div className="flex gap-1.5">
                    <EditIcon href={`/trees/${treeSlug}/people/${p.id}`} />
                    <DeleteIcon onClick={() => setDeleteId(p.id)} disabled={deleteMut.isPending} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {search || sexFilter !== "all" || livingFilter !== "all" ? "No people match the current filters." : "No people yet."}
              </TableCell>
            </TableRow>
          )}
          </TableBody>
        </Table>
        </div>
      </div>

      {(totalPages > 1 || filtered.length > 25) && (
        <div className="flex items-center justify-between shrink-0 px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Select value={String(pageSize)} onValueChange={(v) => { if (v !== null) { setPageSize(Number(v)); setPage(0); } }}>
              <SelectTrigger className="h-7 w-24 text-xs">
                <span className="text-xs">Show {pageSize}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">Show 25</SelectItem>
                <SelectItem value="50">Show 50</SelectItem>
                <SelectItem value="100">Show 100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(0)}>«</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => { if (deleteId) deleteMut.mutate(deleteId); }}
        title="Delete person?"
        message="This person will be moved to the trash."
        confirmLabel="Move to trash"
      />
    </div>
  );
}
