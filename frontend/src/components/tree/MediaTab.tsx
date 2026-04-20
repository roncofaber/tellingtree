import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadMedia } from "@/api/media";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
  treeId: string;
}

export function MediaTab({ treeId }: Props) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadMedia(treeId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.media.all(treeId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.stories.all(treeId) });
    },
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Upload media to your tree</p>
        <div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx"
          />
          <Button
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploadMut.isPending}
          >
            {uploadMut.isPending ? "Uploading..." : "Upload File"}
          </Button>
        </div>
      </div>

      {uploadMut.isSuccess && uploadMut.data && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Badge>{uploadMut.data.media_type}</Badge>
              <span className="text-sm">{uploadMut.data.original_filename}</span>
              <span className="text-xs text-muted-foreground">
                uploaded successfully
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground text-center py-8">
        Media files can be attached to stories and persons.
        Use the story or person detail view to manage attachments.
      </p>
    </div>
  );
}
