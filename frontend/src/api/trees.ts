import { apiClient } from "./client";
import type { PaginatedResponse } from "@/types/api";
import type { Tree, TreeMember } from "@/types/tree";

export function listTrees(skip = 0, limit = 20) {
  return apiClient.get<PaginatedResponse<Tree>>("/trees", {
    skip: String(skip),
    limit: String(limit),
  });
}

export function createTree(data: {
  name: string;
  description?: string;
  is_public?: boolean;
}) {
  return apiClient.post<Tree>("/trees", data);
}

export function getTree(treeId: string) {
  return apiClient.get<Tree>(`/trees/${treeId}`);
}

export function updateTree(
  treeId: string,
  data: { name?: string; description?: string; is_public?: boolean; slug?: string }
) {
  return apiClient.put<Tree>(`/trees/${treeId}`, data);
}

export function deleteTree(treeId: string) {
  return apiClient.delete<void>(`/trees/${treeId}`);
}

export function transferTree(treeId: string, newOwnerId: string) {
  return apiClient.put<Tree>(`/trees/${treeId}/transfer`, {
    new_owner_id: newOwnerId,
  });
}

export function listMembers(treeId: string) {
  return apiClient.get<TreeMember[]>(`/trees/${treeId}/members`);
}

export function addMember(
  treeId: string,
  data: { username: string; role?: string }
) {
  return apiClient.post<TreeMember>(`/trees/${treeId}/members`, data);
}

export function updateMember(treeId: string, userId: string, role: string) {
  return apiClient.put<TreeMember>(`/trees/${treeId}/members/${userId}`, {
    role,
  });
}

export function removeMember(treeId: string, userId: string) {
  return apiClient.delete<void>(`/trees/${treeId}/members/${userId}`);
}

export interface SearchResult {
  type: "person" | "story";
  id: string;
  label: string;
  detail: string | null;
}

export function searchTree(treeSlug: string, q: string) {
  return apiClient.get<SearchResult[]>(`/trees/${treeSlug}/search`, { q });
}
