import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listMedia, uploadMedia, deleteMedia, fetchMediaBlob } from "@/api/media";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { FileText, Music, Video, Paperclip, Download, Trash2, Upload } from "lucide-react";
import type { Media } from "@/types/media";

function mediaIcon(type: string) {
  if (type === "audio") return <Music className="h-5 w-5" />;
  if (type === "video") return <Video className="h-5 w-5" />;
  if (type === "document") return <FileText className="h-5 w-5" />;
  return <Paperclip className="h-5 w-5" />;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  treeId: string;
  storyId: string;
  editable?: boolean;
}

export function StoryAttachments({ treeId, storyId, editable = false }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: allMedia } = useQuery({
    queryKey: queryKeys.media.all(treeId),
    queryFn: () => listMedia(treeId),
  });

  const attachments = (allMedia ?? []).filter(
    (m) => m.story_id === storyId && !m.mime_type?.startsWith("image/")
  );

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadMedia(treeId, file, { story_id: storyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all(treeId) });
      toast.success("File attached");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMedia(treeId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all(treeId) });
      toast.success("Attachment removed");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const handleDownload = async (m: Media) => {
    const url = await fetchMediaBlob(treeId, m.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = m.original_filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!editable && attachments.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attachments</h3>
        {editable && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/*,.pdf,.doc,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadMut.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={uploadMut.isPending}
            >
              <Upload className="h-3 w-3 mr-1" />
              {uploadMut.isPending ? "Uploading…" : "Attach file"}
            </Button>
          </>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="text-muted-foreground shrink-0">
                {mediaIcon(m.media_type)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{m.original_filename}</p>
                <p className="text-xs text-muted-foreground">
                  {m.media_type} {formatSize(m.size_bytes) && `· ${formatSize(m.size_bytes)}`}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleDownload(m)}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                {editable && (
                  <button
                    onClick={() => deleteMut.mutate(m.id)}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editable && attachments.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No attachments yet. Upload audio, video, or documents.</p>
      )}
    </div>
  );
}
