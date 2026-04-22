import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listStories, createStory, deleteStory } from "@/api/stories";
import { listPersons } from "@/api/persons";
import { listRelationships } from "@/api/relationships";
import { listTags } from "@/api/tags";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StoryEditor, extractMentionPersonIds } from "@/components/editor/StoryEditor";
import { LocationInput } from "@/components/common/LocationInput";
import { loadGraphSettings } from "@/lib/graphSettings";
import type { Story } from "@/types/story";

type SortKey = "event-asc" | "event-desc" | "title-asc" | "added-desc";

function sortStories(stories: Story[], sort: SortKey): Story[] {
  return [...stories].sort((a, b) => {
    switch (sort) {
      case "event-asc":  return (a.event_date ?? "9999").localeCompare(b.event_date ?? "9999");
      case "event-desc": return (b.event_date ?? "0000").localeCompare(a.event_date ?? "0000");
      case "title-asc":  return a.title.localeCompare(b.title);
      case "added-desc": return b.created_at.localeCompare(a.created_at);
      default: return 0;
    }
  });
}

export function StoriesTab({ treeId }: { treeId: string }) {
  const { treeSlug } = useParams<{ treeSlug: string }>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sort,   setSort]   = useState<SortKey>("event-desc");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title,         setTitle]         = useState("");
  const [editorContent, setEditorContent] = useState<string | null>(null);
  const [eventDate,     setEventDate]     = useState("");
  const [eventLocation, setEventLocation] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stories.all(treeId),
    queryFn:  () => listStories(treeId, { limit: 10000 }),
  });

  const { data: personsData } = useQuery({
    queryKey: queryKeys.persons.full(treeId),
    queryFn: () => listPersons(treeId, 0, 50000),
  });

  const { data: relsData } = useQuery({
    queryKey: queryKeys.relationships.full(treeId),
    queryFn: () => listRelationships(treeId, 0, 50000),
  });

  const persons = personsData?.items ?? [];
  const relationships = relsData?.items ?? [];
  const myPersonId = loadGraphSettings(treeId).myPersonId;

  const personMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of persons) {
      m.set(p.id, [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed");
    }
    return m;
  }, [persons]);

  const { data: tagsData } = useQuery({
    queryKey: queryKeys.tags.all(treeId),
    queryFn: () => listTags(treeId),
  });

  const tagMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null }>();
    for (const t of tagsData ?? []) m.set(t.id, { name: t.name, color: t.color });
    return m;
  }, [tagsData]);

  const createMut = useMutation({
    mutationFn: () => {
      const personIds = editorContent ? extractMentionPersonIds(editorContent) : [];
      return createStory(treeId, {
        title,
        content: editorContent || undefined,
        event_date: eventDate || undefined,
        event_location: eventLocation || undefined,
        person_ids: personIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId) });
      setDialogOpen(false);
      setTitle("");
      setEditorContent(null);
      setEventDate("");
      setEventLocation("");
      toast.success("Story created");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to create story");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStory(treeId, id),
    onSuccess:  () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId) });
      toast.success("Story deleted");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to delete story");
    },
  });

  const filtered = useMemo(() => {
    let items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (q) items = items.filter(s => s.title.toLowerCase().includes(q) || (s.content ?? "").toLowerCase().includes(q));
    if (tagFilter !== "all") items = items.filter(s => s.tag_ids.includes(tagFilter));
    return sortStories(items, sort);
  }, [data, search, sort, tagFilter]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          <Input placeholder="Search stories…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-full sm:w-48" />
          {(tagsData ?? []).length > 0 && (
            <Select value={tagFilter} onValueChange={v => { if (v !== null) setTagFilter(v); }}>
              <SelectTrigger className="h-8 w-36">
                <span className="text-sm">{tagFilter === "all" ? "All tags" : (tagMap.get(tagFilter)?.name ?? tagFilter)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {(tagsData ?? []).map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      {t.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />}
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sort} onValueChange={v => { if (v !== null) setSort(v as SortKey); }}>
            <SelectTrigger className="h-8 w-40">
              <span className="text-sm">{sort === "event-asc" ? "Oldest event" : sort === "event-desc" ? "Newest event" : sort === "title-asc" ? "Title A→Z" : "Recently added"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event-desc">Newest event</SelectItem>
              <SelectItem value="event-asc">Oldest event</SelectItem>
              <SelectItem value="title-asc">Title A→Z</SelectItem>
              <SelectItem value="added-desc">Recently added</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length} / {data?.total ?? 0}</span>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <Button className="h-8 shrink-0" onClick={() => setDialogOpen(true)}>+ New Story</Button>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Write a Story</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
              <div className="space-y-2">
                <Label>Content</Label>
                <StoryEditor
                  initialContent={null}
                  onChange={setEditorContent}
                  persons={persons}
                  treeId={treeId}
                  relationships={relationships}
                  myPersonId={myPersonId}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2"><Label>Event Date</Label><Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>Location</Label><LocationInput value={eventLocation} onChange={(v, _pid) => setEventLocation(v)} /></div>
              </div>
              <Button type="submit" className="w-full" disabled={createMut.isPending}>{createMut.isPending ? "Saving…" : "Save Story"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">{search ? "No stories match your search." : "No stories yet."}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="flex items-start gap-3 rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors">
              <div className="flex-1 min-w-0">
                <Link to={`/trees/${treeSlug}/stories/${s.id}`} className="font-medium text-sm hover:text-primary hover:underline">{s.title}</Link>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {s.event_date     && <Badge variant="secondary" className="text-xs">{s.event_date.slice(0,4)}</Badge>}
                  {s.event_location && <Badge variant="outline"   className="text-xs">{s.event_location}</Badge>}
                  {s.tag_ids.map(tid => {
                    const tag = tagMap.get(tid);
                    if (!tag) return null;
                    return (
                      <span
                        key={`t-${tid}`}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={tag.color ? { backgroundColor: `${tag.color}20`, color: tag.color } : undefined}
                      >
                        {tag.name}
                      </span>
                    );
                  })}
                  {s.person_ids.map(pid => {
                    const name = personMap.get(pid);
                    if (!name) return null;
                    return (
                      <Link key={`p-${pid}`} to={`/trees/${treeSlug}/people/${pid}`}>
                        <Badge variant="secondary" className="text-[11px] py-0.5 hover:bg-primary/10 cursor-pointer">{name}</Badge>
                      </Link>
                    );
                  })}
                </div>
              </div>
              <Button variant="destructive" size="sm" className="shrink-0" onClick={() => setConfirmDeleteId(s.id)} disabled={deleteMut.isPending}>Delete</Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) deleteMut.mutate(confirmDeleteId); }}
        title="Delete story?"
        message="This story will be moved to the trash."
        confirmLabel="Move to trash"
        isPending={deleteMut.isPending}
      />
    </div>
  );
}
