import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listTrash, restorePerson, permanentDeletePerson, restoreStory, permanentDeleteStory } from "@/api/trash";
import { queryKeys } from "@/lib/queryKeys";
import { formatFlexDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { Person } from "@/types/person";
import type { Story } from "@/types/story";

type DeleteTarget = { kind: "person" | "story"; id: string; label: string };

function PersonDetailDialog({
  person,
  onRestore,
  onDelete,
  onClose,
  restoring,
  deleting,
}: {
  person: Person;
  onRestore: () => void;
  onDelete: () => void;
  onClose: () => void;
  restoring: boolean;
  deleting: boolean;
}) {
  const name = [person.given_name, person.family_name].filter(Boolean).join(" ") || "Unnamed";
  const birthFmt = formatFlexDate(person.birth_date, person.birth_date_qualifier, person.birth_date_2, person.birth_date_original);
  const deathFmt = formatFlexDate(person.death_date, person.death_date_qualifier, person.death_date_2, person.death_date_original);
  const deletedAt = person.deleted_at ? new Date(person.deleted_at).toLocaleDateString() : null;

  const Row = ({ label, value }: { label: string; value: string | null | undefined }) =>
    value ? (
      <div className="grid grid-cols-[120px_1fr] gap-2 py-1.5 border-b border-border/40 text-sm">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span>{value}</span>
      </div>
    ) : null;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Row label="Maiden name" value={person.maiden_name} />
          <Row label="Nickname" value={person.nickname} />
          <Row label="Gender" value={person.gender} />
          <Row label="Born" value={[birthFmt, person.birth_location].filter(Boolean).join(" · ")} />
          <Row label="Died" value={[deathFmt, person.death_location].filter(Boolean).join(" · ")} />
          <Row label="Occupation" value={person.occupation} />
          <Row label="Education" value={person.education} />
          <Row label="Nationalities" value={person.nationalities?.join(", ")} />
          <Row label="Deleted" value={deletedAt} />
        </div>

        {person.bio && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bio</p>
            <p className="text-sm whitespace-pre-wrap text-foreground/80">{person.bio}</p>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={onRestore} disabled={restoring || deleting}>
            {restoring ? "Restoring…" : "Restore"}
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={restoring || deleting}>
            {deleting ? "Deleting…" : "Delete forever"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StoryDetailDialog({
  story,
  onRestore,
  onDelete,
  onClose,
  restoring,
  deleting,
}: {
  story: Story;
  onRestore: () => void;
  onDelete: () => void;
  onClose: () => void;
  restoring: boolean;
  deleting: boolean;
}) {
  const deletedAt = story.deleted_at ? new Date(story.deleted_at).toLocaleDateString() : null;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{story.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm text-muted-foreground">
          {story.event_date && <p>Event date: {story.event_date}</p>}
          {story.event_location && <p>Location: {story.event_location}</p>}
          {deletedAt && <p>Deleted: {deletedAt}</p>}
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={onRestore} disabled={restoring || deleting}>
            {restoring ? "Restoring…" : "Restore"}
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={restoring || deleting}>
            {deleting ? "Deleting…" : "Delete forever"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TrashTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();
  const trashKey = ["trees", treeId, "trash"] as const;
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [viewPerson, setViewPerson] = useState<Person | null>(null);
  const [viewStory, setViewStory] = useState<Story | null>(null);

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
    onSuccess: () => { invalidateAll(); toast.success("Person restored"); setViewPerson(null); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to restore person"); },
  });

  const permDeletePersonMut = useMutation({
    mutationFn: (id: string) => permanentDeletePerson(treeId, id),
    onSuccess: () => { invalidateAll(); toast.success("Permanently deleted"); setViewPerson(null); setDeleteTarget(null); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to delete person"); },
  });

  const restoreStoryMut = useMutation({
    mutationFn: (id: string) => restoreStory(treeId, id),
    onSuccess: () => { invalidateAll(); toast.success("Story restored"); setViewStory(null); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to restore story"); },
  });

  const permDeleteStoryMut = useMutation({
    mutationFn: (id: string) => permanentDeleteStory(treeId, id),
    onSuccess: () => { invalidateAll(); toast.success("Permanently deleted"); setViewStory(null); setDeleteTarget(null); },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Failed to delete story"); },
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
      <p className="text-xs text-muted-foreground">Deleted items can be restored or permanently removed. Click a name to view details.</p>

      {persons.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People ({persons.length})</h3>
          <div className="border rounded-lg">
            <Table>
              <TableHeader className="bg-muted/50">
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
                      <TableCell>
                        <button
                          className="text-sm font-medium hover:text-primary hover:underline text-left"
                          onClick={() => setViewPerson(p as Person)}
                        >
                          {name}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{deletedAt}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => restorePersonMut.mutate(p.id)}>Restore</Button>
                          <Button size="sm" variant="destructive"
                            onClick={() => setDeleteTarget({ kind: "person", id: p.id, label: name })}
                          >Delete forever</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {stories.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stories ({stories.length})</h3>
          <div className="border rounded-lg">
            <Table>
              <TableHeader className="bg-muted/50">
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
                      <TableCell>
                        <button
                          className="text-sm font-medium hover:text-primary hover:underline text-left"
                          onClick={() => setViewStory(s as Story)}
                        >
                          {s.title}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{deletedAt}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => restoreStoryMut.mutate(s.id)}>Restore</Button>
                          <Button size="sm" variant="destructive"
                            onClick={() => setDeleteTarget({ kind: "story", id: s.id, label: s.title })}
                          >Delete forever</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Person detail dialog */}
      {viewPerson && (
        <PersonDetailDialog
          person={viewPerson}
          onRestore={() => restorePersonMut.mutate(viewPerson.id)}
          onDelete={() => setDeleteTarget({ kind: "person", id: viewPerson.id, label: [viewPerson.given_name, viewPerson.family_name].filter(Boolean).join(" ") || "Unnamed" })}
          onClose={() => setViewPerson(null)}
          restoring={restorePersonMut.isPending}
          deleting={permDeletePersonMut.isPending}
        />
      )}

      {/* Story detail dialog */}
      {viewStory && (
        <StoryDetailDialog
          story={viewStory}
          onRestore={() => restoreStoryMut.mutate(viewStory.id)}
          onDelete={() => setDeleteTarget({ kind: "story", id: viewStory.id, label: viewStory.title })}
          onClose={() => setViewStory(null)}
          restoring={restoreStoryMut.isPending}
          deleting={permDeleteStoryMut.isPending}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.kind === "person") permDeletePersonMut.mutate(deleteTarget.id);
          else permDeleteStoryMut.mutate(deleteTarget.id);
        }}
        title={`Permanently delete ${deleteTarget?.kind === "person" ? "person" : "story"}?`}
        message={`"${deleteTarget?.label}" will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete forever"
        destructive
        isPending={deleteTarget?.kind === "person" ? permDeletePersonMut.isPending : permDeleteStoryMut.isPending}
      />
    </div>
  );
}
