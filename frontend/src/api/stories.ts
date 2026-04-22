import { apiClient } from "./client";
import type { PaginatedResponse } from "@/types/api";
import type { Story } from "@/types/story";

export function listStories(
  treeId: string,
  params: {
    skip?: number;
    limit?: number;
    person_id?: string;
    tag_id?: string;
  } = {}
) {
  const query: Record<string, string> = {
    skip: String(params.skip ?? 0),
    limit: String(params.limit ?? 20),
  };
  if (params.person_id) query.person_id = params.person_id;
  if (params.tag_id) query.tag_id = params.tag_id;
  return apiClient.get<PaginatedResponse<Story>>(
    `/trees/${treeId}/stories`,
    query
  );
}

export function createStory(
  treeId: string,
  data: {
    title: string;
    content?: string;
    event_date?: string;
    event_end_date?: string;
    event_location?: string;
    person_ids?: string[];
    tag_ids?: string[];
  }
) {
  return apiClient.post<Story>(`/trees/${treeId}/stories`, data);
}

export function getStory(treeId: string, storyId: string) {
  return apiClient.get<Story>(`/trees/${treeId}/stories/${storyId}`);
}

export function updateStory(
  treeId: string,
  storyId: string,
  data: {
    title?: string;
    content?: string;
    event_date?: string;
    event_end_date?: string;
    event_location?: string;
    person_ids?: string[];
  }
) {
  return apiClient.put<Story>(`/trees/${treeId}/stories/${storyId}`, data);
}

export function deleteStory(treeId: string, storyId: string) {
  return apiClient.delete<void>(`/trees/${treeId}/stories/${storyId}`);
}

export function linkPersonToStory(
  treeId: string,
  storyId: string,
  personId: string
) {
  return apiClient.post<void>(
    `/trees/${treeId}/stories/${storyId}/persons/${personId}`
  );
}

export function unlinkPersonFromStory(
  treeId: string,
  storyId: string,
  personId: string
) {
  return apiClient.delete<void>(
    `/trees/${treeId}/stories/${storyId}/persons/${personId}`
  );
}

export function addTagToStory(
  treeId: string,
  storyId: string,
  tagId: string
) {
  return apiClient.post<void>(
    `/trees/${treeId}/stories/${storyId}/tags/${tagId}`
  );
}

export function removeTagFromStory(
  treeId: string,
  storyId: string,
  tagId: string
) {
  return apiClient.delete<void>(
    `/trees/${treeId}/stories/${storyId}/tags/${tagId}`
  );
}
