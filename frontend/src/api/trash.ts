import { apiClient } from "./client";
import type { Person } from "@/types/person";
import type { Story } from "@/types/story";

export interface TrashResponse {
  persons: Person[];
  stories: Story[];
}

export function listTrash(treeId: string): Promise<TrashResponse> {
  return apiClient.get<TrashResponse>(`/trees/${treeId}/trash`);
}

export function restorePerson(treeId: string, personId: string): Promise<void> {
  return apiClient.post<void>(`/trees/${treeId}/trash/persons/${personId}/restore`);
}

export function permanentDeletePerson(treeId: string, personId: string): Promise<void> {
  return apiClient.delete<void>(`/trees/${treeId}/trash/persons/${personId}`);
}

export function restoreStory(treeId: string, storyId: string): Promise<void> {
  return apiClient.post<void>(`/trees/${treeId}/trash/stories/${storyId}/restore`);
}

export function permanentDeleteStory(treeId: string, storyId: string): Promise<void> {
  return apiClient.delete<void>(`/trees/${treeId}/trash/stories/${storyId}`);
}
