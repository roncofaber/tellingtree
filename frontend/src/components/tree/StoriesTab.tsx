import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listStories, createStory, deleteStory } from "@/api/stories";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort,   setSort]   = useState<SortKey>("event-desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title,         setTitle]         = useState("");
  const [content,       setContent]       = useState("");
  const [eventDate,     setEventDate]     = useState("");
  const [eventLocation, setEventLocation] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stories.all(treeId),
    queryFn:  () => listStories(treeId, { limit: 10000 }),
  });

  const createMut = useMutation({
    mutationFn: () => createStory(treeId, { title, content: content||undefined, event_date: eventDate||undefined, event_location: eventLocation||undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId) });
      setDialogOpen(false); setTitle(""); setContent(""); setEventDate(""); setEventLocation("");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteStory(treeId, id),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId) }),
  });

  const filtered = useMemo(() => {
    let items = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (q) items = items.filter(s => s.title.toLowerCase().includes(q) || (s.content ?? "").toLowerCase().includes(q));
    return sortStories(items, sort);
  }, [data, search, sort]);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1">
          <Input placeholder="Search stories…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-48" />
          <Select value={sort} onValueChange={v => { if (v !== null) setSort(v as SortKey); }}>
            <SelectTrigger className="h-8 w-36">
              <span className="text-sm">Sort: {sort === "event-asc" ? "Oldest" : sort === "event-desc" ? "Newest event" : sort === "title-asc" ? "Title A→Z" : "Recently added"}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event-desc">Newest event</SelectItem>
              <SelectItem value="event-asc">Oldest event</SelectItem>
              <SelectItem value="title-asc">Title A→Z</SelectItem>
              <SelectItem value="added-desc">Recently added</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{filtered.length} / {data?.total ?? 0}</span>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 h-8 shrink-0">
            + New Story
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Write a Story</DialogTitle></DialogHeader>
            <form onSubmit={e => { e.preventDefault(); createMut.mutate(); }} className="space-y-4">
              <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Content</Label><Textarea value={content} onChange={e => setContent(e.target.value)} rows={5} placeholder="Tell the story…" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Event Date</Label><Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} /></div>
                <div className="space-y-2"><Label>Location</Label><Input value={eventLocation} onChange={e => setEventLocation(e.target.value)} /></div>
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
                <Link to={`/trees/${treeId}/stories/${s.id}`} className="font-medium text-sm hover:text-primary hover:underline">{s.title}</Link>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {s.event_date     && <Badge variant="secondary" className="text-xs">{s.event_date.slice(0,4)}</Badge>}
                  {s.event_location && <Badge variant="outline"   className="text-xs">{s.event_location}</Badge>}
                </div>
                {s.content && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.content}</p>}
              </div>
              <Button variant="destructive" size="sm" className="shrink-0" onClick={() => deleteMut.mutate(s.id)}>Del</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
