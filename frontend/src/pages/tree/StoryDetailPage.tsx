import { useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStory, updateStory, deleteStory, addTagToStory, removeTagFromStory } from "@/api/stories";
import { getTree } from "@/api/trees";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { listTags, createTag, updateTag, deleteTag } from "@/api/tags";
import { listTreePlaces } from "@/api/places";
import { queryKeys } from "@/lib/queryKeys";
import { loadGraphSettings } from "@/lib/graphSettings";
import { Link } from "react-router-dom";
import { Plus, X, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Breadcrumb } from "@/components/common/Breadcrumb";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StoryEditor, extractMentionPersonIds } from "@/components/editor/StoryEditor";
import { StoryAttachments } from "@/components/tree/StoryAttachments";
import { StoryRenderer } from "@/components/editor/StoryRenderer";
import { LocationInput } from "@/components/common/LocationInput";

function LinkedPeople({ treeId, treeSlug, personIds }: { treeId: string; treeSlug: string; personIds: string[] }) {
  const { data } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });
  const persons = (data?.items ?? []).filter(p => personIds.includes(p.id));
  if (!persons.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">People in this story</h3>
      <div className="flex flex-wrap gap-2">
        {persons.map(p => {
          const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
          return (
            <Link key={p.id} to={`/trees/${treeSlug}/people/${p.id}`}>
              <Badge variant="secondary" className="hover:bg-primary/10 cursor-pointer">{name}</Badge>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const TAG_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {TAG_COLORS.map(c => (
        <button
          key={c}
          type="button"
          className={`w-5 h-5 rounded-full border-2 transition-all ${c === value ? "border-foreground scale-110" : "border-transparent hover:scale-105"}`}
          style={{ backgroundColor: c }}
          onClick={e => { e.stopPropagation(); onChange(c); }}
        />
      ))}
    </div>
  );
}

function StoryTags({ treeId, storyId, tagIds }: { treeId: string; storyId: string; tagIds: string[] }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [editingTag, setEditingTag] = useState<{ id: string; name: string; color: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: allTags } = useQuery({
    queryKey: queryKeys.tags.all(treeId),
    queryFn: () => listTags(treeId),
  });

  const assignedTags = useMemo(() =>
    (allTags ?? []).filter(t => tagIds.includes(t.id)),
    [allTags, tagIds]
  );

  const availableTags = useMemo(() =>
    (allTags ?? []).filter(t => !tagIds.includes(t.id)),
    [allTags, tagIds]
  );

  const filteredAvailable = useMemo(() => {
    const q = newTagName.trim().toLowerCase();
    if (!q) return availableTags;
    return availableTags.filter(t => t.name.toLowerCase().includes(q));
  }, [availableTags, newTagName]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(treeId, storyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.tags.all(treeId) });
  };

  const addMut = useMutation({
    mutationFn: (tagId: string) => addTagToStory(treeId, storyId, tagId),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add tag"),
  });

  const removeMut = useMutation({
    mutationFn: (tagId: string) => removeTagFromStory(treeId, storyId, tagId),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove tag"),
  });

  const createAndAddMut = useMutation({
    mutationFn: async () => {
      const tag = await createTag(treeId, { name: newTagName.trim(), color: newTagColor });
      await addTagToStory(treeId, storyId, tag.id);
      return tag;
    },
    onSuccess: () => {
      invalidate();
      setNewTagName("");
      setShowAdd(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create tag"),
  });

  const updateTagMut = useMutation({
    mutationFn: () => {
      if (!editingTag) throw new Error("No tag");
      return updateTag(treeId, editingTag.id, { name: editingTag.name, color: editingTag.color });
    },
    onSuccess: () => {
      invalidate();
      setEditingTag(null);
      toast.success("Tag updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update tag"),
  });

  const deleteTagMut = useMutation({
    mutationFn: (tagId: string) => deleteTag(treeId, tagId),
    onSuccess: () => {
      invalidate();
      setEditingTag(null);
      toast.success("Tag deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete tag"),
  });

  const handleAddExisting = (tagId: string) => {
    addMut.mutate(tagId);
    setNewTagName("");
    setShowAdd(false);
  };

  const exactMatch = (allTags ?? []).some(t => t.name.toLowerCase() === newTagName.trim().toLowerCase());
  const canCreate = newTagName.trim().length > 0 && !exactMatch;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</h3>

      {/* Editing a tag */}
      {editingTag && (
        <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={editingTag.name}
              onChange={e => setEditingTag({ ...editingTag, name: e.target.value })}
              className="h-7 text-xs flex-1"
            />
            <Button size="sm" className="h-7 px-2" onClick={() => updateTagMut.mutate()} disabled={!editingTag.name.trim()}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => deleteTagMut.mutate(editingTag.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingTag(null)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ColorPicker value={editingTag.color} onChange={c => setEditingTag({ ...editingTag, color: c })} />
        </div>
      )}

      {/* Assigned tags */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {assignedTags.map(tag => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-xs font-medium group"
            style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : undefined}
          >
            {tag.name}
            <button
              onClick={() => setEditingTag({ id: tag.id, name: tag.name, color: tag.color ?? TAG_COLORS[0] })}
              className="rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all"
              title="Edit tag"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={() => removeMut.mutate(tag.id)}
              className="rounded-full p-0.5 opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all"
              title="Remove tag"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        {/* Add tag */}
        {!showAdd ? (
          <button
            onClick={() => { setShowAdd(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3" /> Add tag
          </button>
        ) : (
          <div className="relative">
            <Input
              ref={inputRef}
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") { setShowAdd(false); setNewTagName(""); }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filteredAvailable.length > 0) handleAddExisting(filteredAvailable[0].id);
                  else if (canCreate) createAndAddMut.mutate();
                }
              }}
              placeholder="Type tag name…"
              className="h-7 w-44 text-xs"
              autoComplete="off"
            />
            {(filteredAvailable.length > 0 || canCreate) && newTagName.trim() && (
              <div className="absolute z-50 mt-1 w-64 rounded-lg border bg-popover shadow-lg overflow-hidden">
                {filteredAvailable.slice(0, 5).map(tag => (
                  <button
                    key={tag.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors"
                    onClick={() => handleAddExisting(tag.id)}
                  >
                    {tag.color && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />}
                    {tag.name}
                  </button>
                ))}
                {canCreate && (
                  <div className="border-t px-3 py-2 space-y-2">
                    <button
                      className="flex w-full items-center gap-2 text-sm text-left text-primary hover:underline"
                      onClick={() => createAndAddMut.mutate()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create "{newTagName.trim()}"
                    </button>
                    <ColorPicker value={newTagColor} onChange={setNewTagColor} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function StoryDetailPage() {
  const { treeSlug, storyId } = useParams<{ treeSlug: string; storyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    title: "",
    event_date: "",
    event_end_date: "",
    event_location: "",
  });
  const [editorContent, setEditorContent] = useState<string | null>(null);

  const { data: tree } = useQuery({
    queryKey: queryKeys.trees.detail(treeSlug!),
    queryFn:  () => getTree(treeSlug!),
    enabled:  !!treeSlug,
  });

  const treeId = tree?.id;
  const base = `/trees/${treeSlug}`;

  const { data: story, isLoading, error } = useQuery({
    queryKey: queryKeys.stories.detail(treeId!, storyId!),
    queryFn: () => getStory(treeId!, storyId!),
    enabled: !!treeId && !!storyId,
  });

  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId!),
    queryFn: () => listPersons(treeId!, 0, 50000),
    enabled: !!treeId,
  });

  const { data: placesData } = useQuery({
    queryKey: queryKeys.places.forTree(treeId!),
    queryFn: () => listTreePlaces(treeId!),
    enabled: !!treeId,
  });

  const { data: relsData } = useQuery({
    queryKey: queryKeys.relationships.full(treeId!),
    queryFn: () => listRelationships(treeId!, 0, 50000),
    enabled: !!treeId,
  });

  const persons = personsData?.items ?? [];
  const relationships = relsData?.items ?? [];
  const myPersonId = treeId ? loadGraphSettings(treeId).myPersonId : null;

  const updateMut = useMutation({
    mutationFn: () => {
      const personIds = editorContent ? extractMentionPersonIds(editorContent) : [];
      return updateStory(treeId!, storyId!, {
        title: form.title,
        content: editorContent || undefined,
        event_date: form.event_date || undefined,
        event_end_date: form.event_end_date || undefined,
        event_location: form.event_location || undefined,
        person_ids: personIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(treeId!, storyId!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId!) });
      setEditing(false);
      toast.success("Story saved");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to save story");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteStory(treeId!, storyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId!) });
      toast.success("Story deleted");
      navigate(base);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to delete story");
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Story not found" />;
  if (!story) return null;

  const startEdit = () => {
    setForm({
      title: story.title,
      event_date: story.event_date || "",
      event_end_date: story.event_end_date || "",
      event_location: story.event_location || "",
    });
    setEditorContent(story.content);
    setEditing(true);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Breadcrumb items={[
        { label: "Dashboard",           href: "/dashboard" },
        { label: tree?.name ?? "Tree",  href: base },
        { label: "Stories",             href: `${base}/stories` },
        { label: story.title },
      ]} />

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMut.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>

          <div className="space-y-2">
            <Label>Content</Label>
            <StoryEditor
              initialContent={story.content}
              onChange={setEditorContent}
              persons={persons}
              treeId={treeId}
              relationships={relationships}
              myPersonId={myPersonId}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input type="date" value={form.event_end_date} onChange={(e) => setForm({ ...form, event_end_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <LocationInput value={form.event_location} onChange={(v, _pid) => setForm({ ...form, event_location: v })} placeholder="Search for a location…" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={updateMut.isPending}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>

          {/* Attachments (edit mode) */}
          {treeId && storyId && (
            <StoryAttachments treeId={treeId} storyId={storyId} editable />
          )}
        </form>
      ) : (
        <>
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">{story.title}</h1>
              <div className="flex gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleteMut.isPending}>Delete</Button>
              </div>
            </div>
            {(story.event_date || story.event_location) && (
              <div className="flex gap-2 flex-wrap">
                {story.event_date && <Badge variant="secondary">{story.event_date}{story.event_end_date ? ` – ${story.event_end_date}` : ""}</Badge>}
                {story.event_location && <Badge variant="outline">{story.event_location}</Badge>}
              </div>
            )}
          </div>

          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => deleteMut.mutate()}
            title={`Delete "${story.title}"?`}
            message="This story will be moved to the trash."
            confirmLabel="Move to trash"
            isPending={deleteMut.isPending}
          />

          {/* Divider */}
          <div className="border-t" />

          {/* Body */}
          <div className="prose prose-sm max-w-none py-2">
            <StoryRenderer content={story.content} persons={persons} places={placesData ?? undefined} treeSlug={treeSlug!} />
          </div>

          {/* Attachments */}
          {treeId && storyId && (
            <StoryAttachments treeId={treeId} storyId={storyId} />
          )}

          {/* Divider */}
          {(story.tag_ids.length > 0 || story.person_ids.length > 0 || treeId) && <div className="border-t" />}

          {/* Metadata: tags + people */}
          <div className="space-y-4">
            {treeId && storyId && (
              <StoryTags treeId={treeId} storyId={storyId} tagIds={story.tag_ids} />
            )}
            {story.person_ids.length > 0 && (
              <LinkedPeople treeId={treeId!} treeSlug={treeSlug!} personIds={story.person_ids} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
