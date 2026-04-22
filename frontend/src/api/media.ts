import { apiClient } from "./client";
import { API_PREFIX } from "@/lib/constants";
import type { Media } from "@/types/media";

const MAX_MEDIA_SIZE = 100 * 1024 * 1024; // 100MB

export function listMedia(treeId: string): Promise<Media[]> {
  return apiClient.get<Media[]>(`/trees/${treeId}/media`);
}

export function uploadMedia(
  treeId: string,
  file: File,
  options?: {
    story_id?: string;
    person_id?: string;
    caption?: string;
  }
) {
  if (file.size > MAX_MEDIA_SIZE) {
    return Promise.reject(new Error(`File too large (${Math.round(file.size / (1024 * 1024))}MB). Maximum is ${MAX_MEDIA_SIZE / (1024 * 1024)}MB.`));
  }
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

export async function fetchMediaBlob(treeId: string, mediaId: string): Promise<string> {
  const { getAccessToken } = await import("./client");
  const token = getAccessToken();
  const resp = await fetch(`${API_PREFIX}/trees/${treeId}/media/${mediaId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Failed to fetch media");
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

export function deleteMedia(treeId: string, mediaId: string) {
  return apiClient.delete<void>(`/trees/${treeId}/media/${mediaId}`);
}
