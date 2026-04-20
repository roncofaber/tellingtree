import { apiClient } from "./client";
import type { Tag } from "@/types/tag";

export function listTags(treeId: string) {
  return apiClient.get<Tag[]>(`/trees/${treeId}/tags`);
}

export function createTag(
  treeId: string,
  data: { name: string; color?: string }
) {
  return apiClient.post<Tag>(`/trees/${treeId}/tags`, data);
}

export function updateTag(
  treeId: string,
  tagId: string,
  data: { name?: string; color?: string }
) {
  return apiClient.put<Tag>(`/trees/${treeId}/tags/${tagId}`, data);
}

export function deleteTag(treeId: string, tagId: string) {
  return apiClient.delete<void>(`/trees/${treeId}/tags/${tagId}`);
}
