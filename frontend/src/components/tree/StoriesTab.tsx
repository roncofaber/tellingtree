import { useEffect, useMemo, useRef, useState } from "react";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
import { StoryListSkeleton } from "@/components/common/Skeleton";
import { DeleteIcon } from "@/components/common/ActionIcons";
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
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [personSearch, setPersonSearch] = useState("");
  const [personDropOpen, setPersonDropOpen] = useState(false);
  const personDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (personDropRef.current && !personDropRef.current.contains(e.target as Node)) setPersonDropOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
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
    setPage(0);
    let items = data?.items ?? [];
    const q = normalize(search.trim());
    if (q) items = items.filter(s => normalize(s.title).includes(q) || normalize(s.content ?? "").includes(q));
    if (tagFilter !== "all") items = items.filter(s => s.tag_ids.includes(tagFilter));
    if (personFilter !== "all") items = items.filter(s => s.person_ids.includes(personFilter));
    return sortStories(items, sort);
  }, [data, search, sort, tagFilter, personFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (isLoading) return <StoryListSkeleton rows={5} />;

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
          {/* Person filter combobox */}
          <div className="relative" ref={personDropRef}>
            {personFilter !== "all" ? (
              <button
                onClick={() => { setPersonFilter("all"); setPersonSearch(""); }}
                className="h-8 flex items-center gap-1.5 rounded-md border border-input bg-primary/10 text-primary px-2.5 text-sm hover:bg-primary/20 transition-colors"
              >
                {personMap.get(personFilter) ?? "Person"}
                <span className="text-xs">×</span>
              </button>
            ) : (
              <button
                onClick={() => setPersonDropOpen(o => !o)}
                className="h-8 flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                All people
              </button>
            )}
            {personDropOpen && personFilter === "all" && (
              <div className="absolute top-full mt-1 left-0 z-50 w-56 rounded-lg border bg-popover shadow-lg overflow-hidden">
                <div className="p-1.5 border-b">
                  <input
                    autoFocus
                    type="text"
                    value={personSearch}
                    onChange={e => setPersonSearch(e.target.value)}
                    placeholder="Search person…"
                    className="w-full h-7 px-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {persons
                    .filter(p => !personSearch || normalize([p.given_name, p.family_name].filter(Boolean).join(" ")).includes(normalize(personSearch)))
                    .slice(0, 30)
                    .map(p => {
                      const name = [p.given_name, p.family_name].filter(Boolean).join(" ") || "Unnamed";
                      return (
                        <button
                          key={p.id}
                          onClick={() => { setPersonFilter(p.id); setPersonDropOpen(false); setPersonSearch(""); }}
                          className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-muted text-left"
                        >
                          {name}
                        </button>
                      );
                    })}
                  {persons.filter(p => !personSearch || normalize([p.given_name, p.family_name].filter(Boolean).join(" ")).includes(normalize(personSearch))).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3">No people found</p>
                  )}
                </div>
              </div>
            )}
          </div>

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
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} required autoFocus /></div>
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
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {search || tagFilter !== "all" || personFilter !== "all" ? "No stories match your filters." : "No stories yet."}
          </p>
          {!search && tagFilter === "all" && personFilter === "all" && (
            <button onClick={() => setDialogOpen(true)} className="text-sm text-primary hover:underline">
              + Write your first story
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map(s => (
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
              <DeleteIcon onClick={() => setConfirmDeleteId(s.id)} disabled={deleteMut.isPending} />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(0)}>«</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ Prev</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next ›</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</Button>
          </div>
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
