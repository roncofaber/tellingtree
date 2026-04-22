import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $insertNodes,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  type LexicalCommand,
} from "lexical";
import { uploadMedia } from "@/api/media";
import { $createImageNode } from "../nodes/ImageNode";
import { toast } from "sonner";

export interface InsertImagePayload {
  mediaId: string;
  treeId: string;
  altText?: string;
  caption?: string;
}

export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> =
  createCommand("INSERT_IMAGE_COMMAND");

export function ImagePlugin({ treeId }: { treeId: string }) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand<InsertImagePayload>(
      INSERT_IMAGE_COMMAND,
      (payload) => {
        editor.update(() => {
          const node = $createImageNode(
            payload.mediaId,
            payload.treeId,
            payload.altText ?? "",
            payload.caption ?? ""
          );
          $insertNodes([node]);
        });
        return true;
      },
      COMMAND_PRIORITY_EDITOR
    );
  }, [editor]);

  // Handle drag-and-drop
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handleDragOver = (e: DragEvent) => {
      const hasImage = e.dataTransfer?.types.some(
        (t) => t === "Files" || t.startsWith("image/")
      );
      if (hasImage) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      }
    };

    const handleDrop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        e.preventDefault();
        try {
          const media = await uploadMedia(treeId, file);
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            mediaId: media.id,
            treeId,
            altText: file.name,
          });
        } catch {
          toast.error("Failed to upload image");
        }
      }
    };

    root.addEventListener("dragover", handleDragOver);
    root.addEventListener("drop", handleDrop);
    return () => {
      root.removeEventListener("dragover", handleDragOver);
      root.removeEventListener("drop", handleDrop);
    };
  }, [editor, treeId]);

  // Handle paste with images
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        try {
          const media = await uploadMedia(treeId, file);
          editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
            mediaId: media.id,
            treeId,
            altText: "Pasted image",
          });
        } catch {
          toast.error("Failed to upload image");
        }
      }
    };

    root.addEventListener("paste", handlePaste);
    return () => root.removeEventListener("paste", handlePaste);
  }, [editor, treeId]);

  return null;
}
