import { apiClient } from "./client";
import { API_PREFIX } from "@/lib/constants";
import type { Media } from "@/types/media";

export function uploadMedia(
  treeId: string,
  file: File,
  options?: {
    story_id?: string;
    person_id?: string;
    caption?: string;
  }
) {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.story_id) formData.append("story_id", options.story_id);
  if (options?.person_id) formData.append("person_id", options.person_id);
  if (options?.caption) formData.append("caption", options.caption);
  return apiClient.upload<Media>(`/trees/${treeId}/media`, formData);
}

export function getMedia(treeId: string, mediaId: string) {
  return apiClient.get<Media>(`/trees/${treeId}/media/${mediaId}`);
}

export function getMediaDownloadUrl(treeId: string, mediaId: string) {
  return `${API_PREFIX}/trees/${treeId}/media/${mediaId}/download`;
}

export function deleteMedia(treeId: string, mediaId: string) {
  return apiClient.delete<void>(`/trees/${treeId}/media/${mediaId}`);
}
