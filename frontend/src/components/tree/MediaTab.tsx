import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listMedia, uploadMedia, deleteMedia, fetchMediaBlob } from "@/api/media";
import { AuthImage } from "@/components/common/AuthImage";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { MediaGridSkeleton } from "@/components/common/Skeleton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Download, Trash2 } from "lucide-react";
import type { Media } from "@/types/media";

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaTab({ treeId }: { treeId: string }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 24;

  const { data: items, isLoading } = useQuery({
    queryKey: queryKeys.media.all(treeId),
    queryFn: () => listMedia(treeId),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadMedia(treeId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all(treeId) });
      toast.success("File uploaded");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Upload failed"); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMedia(treeId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all(treeId) });
      toast.success("File deleted");
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "Delete failed"); },
  });

  const filtered = useMemo(() => {
    let list = items ?? [];
    if (typeFilter !== "all") list = list.filter(m => m.media_type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(m => (m.original_filename ?? "").toLowerCase().includes(q) || (m.caption ?? "").toLowerCase().includes(q));
    return list;
  }, [items, typeFilter, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
  };

  if (isLoading) return <MediaGridSkeleton count={8} />;

  const isImage = (m: Media) => m.mime_type?.startsWith("image/");

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-0">
          <Input placeholder="Search files…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="h-8 w-full sm:w-48" />
          <Select value={typeFilter} onValueChange={v => { if (v !== null) { setTypeFilter(v); setPage(0); } }}>
            <SelectTrigger className="h-8 w-36">
              <span className="text-sm">{typeFilter === "all" ? "All types" : typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="photo">Photos</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length} file{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept="image/*,audio/*,video/*,.pdf,.doc,.docx" />
        <Button className="h-8 shrink-0" onClick={() => fileRef.current?.click()} disabled={uploadMut.isPending}>
          {uploadMut.isPending ? "Uploading…" : "+ Upload"}
        </Button>
      </div>

      {/* Gallery */}
      {filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">{search || typeFilter !== "all" ? "No files match." : "No media yet. Upload photos, documents, or audio."}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {paginated.map(m => (
            <div key={m.id} className="group border rounded-lg overflow-hidden bg-card hover:shadow-md transition-shadow">
              {/* Preview */}
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {isImage(m) ? (
                  <AuthImage treeId={treeId} mediaId={m.id} alt={m.original_filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center p-3">
                    <div className="text-2xl mb-1">
                      {m.media_type === "video" ? "🎬" : m.media_type === "audio" ? "🎵" : m.media_type === "document" ? "📄" : "📎"}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate max-w-full">{m.original_filename}</p>
                  </div>
                )}
              </div>
              {/* Info */}
              <div className="px-2 py-1.5 space-y-0.5">
                <p className="text-xs font-medium truncate" title={m.original_filename}>{m.original_filename}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[9px] px-1 py-0">{m.media_type}</Badge>
                    <span className="text-[10px] text-muted-foreground">{formatSize(m.size_bytes)}</span>
                  </div>
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={async () => {
                      const url = await fetchMediaBlob(treeId, m.id);
                      const a = document.createElement("a");
                      a.href = url; a.download = m.original_filename; a.click();
                      URL.revokeObjectURL(url);
                    }} className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors" title="Download">
                      <Download className="h-3 w-3" />
                    </button>
                    <button onClick={() => setConfirmDeleteId(m.id)} className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-destructive/15 text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50" disabled={deleteMut.isPending} title="Delete">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(0)}>«</Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => { if (confirmDeleteId) deleteMut.mutate(confirmDeleteId); }}
        title="Delete media?"
        message="This file will be permanently deleted."
        confirmLabel="Delete"
        isPending={deleteMut.isPending}
      />
    </div>
  );
}
