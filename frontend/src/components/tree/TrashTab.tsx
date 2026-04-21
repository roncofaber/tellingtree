import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTrash, restorePerson, permanentDeletePerson, restoreStory, permanentDeleteStory } from "@/api/trash";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

export function TrashTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();
  const trashKey = ["trees", treeId, "trash"] as const;

  const { data, isLoading, isError } = useQuery({
    queryKey: trashKey,
    queryFn: () => listTrash(treeId),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: trashKey });
    queryClient.invalidateQueries({ queryKey: queryKeys.persons.all(treeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId) });
  };

  const restorePersonMut = useMutation({
    mutationFn: (id: string) => restorePerson(treeId, id),
    onSuccess: () => { invalidateAll(); toast.success("Person restored"); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed"); },
  });

  const permDeletePersonMut = useMutation({
    mutationFn: (id: string) => permanentDeletePerson(treeId, id),
    onSuccess: () => { invalidateAll(); toast.success("Permanently deleted"); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed"); },
  });

  const restoreStoryMut = useMutation({
    mutationFn: (id: string) => restoreStory(treeId, id),
    onSuccess: () => { invalidateAll(); toast.success("Story restored"); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed"); },
  });

  const permDeleteStoryMut = useMutation({
    mutationFn: (id: string) => permanentDeleteStory(treeId, id),
    onSuccess: () => { invalidateAll(); toast.success("Permanently deleted"); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed"); },
  });

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <p className="text-sm text-destructive py-8 text-center">Failed to load trash.</p>;

  const persons = data?.persons ?? [];
  const stories = data?.stories ?? [];
  const empty = persons.length === 0 && stories.length === 0;

  if (empty) {
    return <p className="text-sm text-muted-foreground py-12 text-center">Trash is empty.</p>;
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Deleted items can be restored or permanently removed. Only tree owners and admins can access the trash.</p>

      {persons.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People ({persons.length})</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {persons.map(p => {
                const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                const deletedAt = p.deleted_at ? new Date(p.deleted_at).toLocaleDateString() : "—";
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{deletedAt}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => restorePersonMut.mutate(p.id)}>Restore</Button>
                        <Button size="sm" variant="destructive" onClick={() => { if (confirm("Permanently delete? This cannot be undone.")) permDeletePersonMut.mutate(p.id); }}>Delete forever</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {stories.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stories ({stories.length})</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead className="w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stories.map(s => {
                const deletedAt = s.deleted_at ? new Date(s.deleted_at).toLocaleDateString() : "—";
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm font-medium">{s.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{deletedAt}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => restoreStoryMut.mutate(s.id)}>Restore</Button>
                        <Button size="sm" variant="destructive" onClick={() => { if (confirm("Permanently delete? This cannot be undone.")) permDeleteStoryMut.mutate(s.id); }}>Delete forever</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
