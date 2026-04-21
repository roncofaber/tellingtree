import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getStory, updateStory, deleteStory } from "@/api/stories";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ErrorMessage } from "@/components/common/ErrorMessage";

export function StoryDetailPage() {
  const { treeId, storyId } = useParams<{ treeId: string; storyId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    event_date: "",
    event_end_date: "",
    event_location: "",
  });

  const { data: story, isLoading, error } = useQuery({
    queryKey: queryKeys.stories.detail(treeId!, storyId!),
    queryFn: () => getStory(treeId!, storyId!),
    enabled: !!treeId && !!storyId,
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateStory(treeId!, storyId!, {
        title: form.title,
        content: form.content || undefined,
        event_date: form.event_date || undefined,
        event_end_date: form.event_end_date || undefined,
        event_location: form.event_location || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.detail(treeId!, storyId!) });
      setEditing(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteStory(treeId!, storyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId!) });
      navigate(`/trees/${treeId}`);
    },
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message="Story not found" />;
  if (!story) return null;

  const startEdit = () => {
    setForm({
      title: story.title,
      content: story.content || "",
      event_date: story.event_date || "",
      event_end_date: story.event_end_date || "",
      event_location: story.event_location || "",
    });
    setEditing(true);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link to={`/trees/${treeId}`} className="hover:text-foreground">&larr; Tree</Link>
        <span>/</span>
        <Link to={`/trees/${treeId}?tab=stories`} className="hover:text-foreground">Stories</Link>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{story.title}</h1>
        <div className="space-x-2">
          {!editing && <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>}
          <Button variant="destructive" size="sm" onClick={() => deleteMut.mutate()}>Delete</Button>
        </div>
      </div>

      <div className="flex gap-2">
        {story.event_date && <Badge variant="secondary">{story.event_date}</Badge>}
        {story.event_location && <Badge variant="outline">{story.event_location}</Badge>}
      </div>

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
            <Textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={10} />
          </div>
          <div className="grid grid-cols-3 gap-4">
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
              <Input value={form.event_location} onChange={(e) => setForm({ ...form, event_location: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={updateMut.isPending}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="prose prose-sm max-w-none">
          {story.content ? (
            <p className="whitespace-pre-wrap">{story.content}</p>
          ) : (
            <p className="text-muted-foreground italic">No content yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
