import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRelationships, createRelationship, deleteRelationship, updateRelationship } from "@/api/relationships";
import type { Relationship } from "@/types/relationship";
import { listPersons } from "@/api/persons";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

interface Props {
  treeId: string;
}

const PRIMARY_TYPES = new Set(["parent", "spouse", "partner"]);
const TYPE_LABELS: Record<string, string> = { parent: "Parent", spouse: "Spouse", partner: "Partner" };
const ROMANTIC_TYPES = new Set(["spouse", "partner"]);

function EditRelDialog({ rel, treeId, onClose }: { rel: Relationship | null; treeId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [relType,  setRelType]  = useState(rel?.relationship_type ?? "");
  const [start,    setStart]    = useState(rel?.start_date ?? "");
  const [end,      setEnd]      = useState(rel?.end_date ?? "");
  const mut = useMutation({
    mutationFn: () => updateRelationship(treeId, rel!.id, { relationship_type: relType||undefined, start_date: start||undefined, end_date: end||undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) }); onClose(); },
  });
  if (!rel) return null;
  return (
    <Dialog open={!!rel} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit Relationship</DialogTitle></DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mut.mutate(); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={relType} onValueChange={v => { if (v !== null) setRelType(v); }}>
              <SelectTrigger className="w-full"><span className={relType ? undefined : "text-muted-foreground"}>{(TYPE_LABELS[relType] ?? relType) || "Select type"}</span></SelectTrigger>
              <SelectContent><SelectItem value="parent">Parent</SelectItem><SelectItem value="spouse">Spouse</SelectItem><SelectItem value="partner">Partner</SelectItem></SelectContent>
            </Select>
          </div>
          {ROMANTIC_TYPES.has(relType) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label className="text-xs">Start Date</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
              <div className="space-y-2"><Label className="text-xs">End Date</Label><Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={mut.isPending} className="flex-1">{mut.isPending ? "Saving…" : "Save"}</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RelationshipsTab({ treeId }: Props) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editing,    setEditing]    = useState<Relationship | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [personA, setPersonA] = useState("");
  const [personB, setPersonB] = useState("");
  const [relType, setRelType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: rels, isLoading } = useQuery({
    queryKey: queryKeys.relationships.all(treeId),
    queryFn: () => listRelationships(treeId, 0, 10000),
  });

  const { data: persons } = useQuery({
    // Use the full key so all persons appear in the dropdown, and we don't
    // stomp on PersonsTab's paginated cache with a 200-item limit.
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });

  // Only show primary relationship types (hide auto-derived child records)
  const displayedRels = (rels?.items ?? [])
    .filter((r) => PRIMARY_TYPES.has(r.relationship_type))
    .filter((r) => typeFilter === "all" || r.relationship_type === typeFilter);

  const personName = (id: string) => {
    const p = persons?.items.find((p) => p.id === id);
    return p
      ? [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed"
      : id.slice(0, 8);
  };

  const createMut = useMutation({
    mutationFn: () =>
      createRelationship(treeId, {
        person_a_id: personA,
        person_b_id: personB,
        relationship_type: relType,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) });
      setDialogOpen(false);
      setPersonA(""); setPersonB(""); setRelType("");
      setStartDate(""); setEndDate("");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (relId: string) => deleteRelationship(treeId, relId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.relationships.all(treeId) });
    },
  });

  if (isLoading) return <LoadingSpinner />;

  const isFormValid = personA && personB && personA !== personB && relType.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {displayedRels.length} relationship(s)
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Add Relationship
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a Relationship</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (isFormValid) createMut.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Person A</Label>
                <Select value={personA} onValueChange={(v) => { if (v !== null) setPersonA(v); }}>
                  <SelectTrigger className="w-full">
                    <span className={personA ? undefined : "text-muted-foreground"}>
                      {personA ? personName(personA) : "Select person"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {persons?.items.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {[p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Relationship</Label>
                <Select value={relType} onValueChange={(v) => { if (v !== null) setRelType(v); }}>
                  <SelectTrigger className="w-full">
                    <span className={relType ? undefined : "text-muted-foreground"}>
                      {relType
                        ? relType === "parent" ? "Parent (A is parent of B)"
                          : relType === "spouse" ? "Spouse (mutual)"
                          : "Partner (mutual)"
                        : "Select type"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parent">Parent (A is parent of B)</SelectItem>
                    <SelectItem value="spouse">Spouse (mutual)</SelectItem>
                    <SelectItem value="partner">Partner (mutual)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {ROMANTIC_TYPES.has(relType) && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date <span className="text-muted-foreground text-xs">(if ended)</span></Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Person B</Label>
                <Select value={personB} onValueChange={(v) => { if (v !== null) setPersonB(v); }}>
                  <SelectTrigger className="w-full">
                    <span className={personB ? undefined : "text-muted-foreground"}>
                      {personB ? personName(personB) : "Select person"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {persons?.items
                      .filter((p) => p.id !== personA)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {[p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full" disabled={createMut.isPending || !isFormValid}>
                {createMut.isPending ? "Adding..." : "Add"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2">
        <Select value={typeFilter} onValueChange={v => { if (v !== null) setTypeFilter(v); }}>
          <SelectTrigger className="h-8 w-36"><span className="text-sm">{typeFilter === "all" ? "All types" : TYPE_LABELS[typeFilter]}</span></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="parent">Parent</SelectItem>
            <SelectItem value="spouse">Spouse</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{displayedRels.length} shown</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person A</TableHead>
            <TableHead>Relationship</TableHead>
            <TableHead>Person B</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayedRels.map((rel) => {
            const dateRange = rel.start_date || rel.end_date
              ? `${rel.start_date?.slice(0, 4) ?? "?"} – ${rel.end_date ? rel.end_date.slice(0, 4) : "present"}`
              : null;
            return (
            <TableRow key={rel.id}>
              <TableCell>{personName(rel.person_a_id)}</TableCell>
              <TableCell>{TYPE_LABELS[rel.relationship_type] ?? rel.relationship_type}</TableCell>
              <TableCell>{personName(rel.person_b_id)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{dateRange ?? "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(rel)}>Edit</Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteMut.mutate(rel.id)}>Del</Button>
                </div>
              </TableCell>
            </TableRow>
          );})}
          {displayedRels.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No relationships yet. Use the graph tab to add people in context.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <EditRelDialog rel={editing} treeId={treeId} onClose={() => setEditing(null)} />
    </div>
  );
}
