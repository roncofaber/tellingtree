import { apiClient } from "./client";
import type { PaginatedResponse } from "@/types/api";
import type { Relationship } from "@/types/relationship";

export function listRelationships(treeId: string, skip = 0, limit = 20) {
  return apiClient.get<PaginatedResponse<Relationship>>(
    `/trees/${treeId}/relationships`,
    { skip: String(skip), limit: String(limit) }
  );
}

export function createRelationship(
  treeId: string,
  data: {
    person_a_id: string;
    person_b_id: string;
    relationship_type: string;
    start_date?: string;
    end_date?: string;
    notes?: string;
  }
) {
  return apiClient.post<Relationship>(`/trees/${treeId}/relationships`, data);
}

export function getRelationship(treeId: string, relId: string) {
  return apiClient.get<Relationship>(
    `/trees/${treeId}/relationships/${relId}`
  );
}

export function updateRelationship(
  treeId: string,
  relId: string,
  data: {
    relationship_type?: string;
    start_date?: string;
    end_date?: string;
    notes?: string;
  }
) {
  return apiClient.put<Relationship>(
    `/trees/${treeId}/relationships/${relId}`,
    data
  );
}

export function deleteRelationship(treeId: string, relId: string) {
  return apiClient.delete<void>(`/trees/${treeId}/relationships/${relId}`);
}

export function listPersonRelationships(treeId: string, personId: string) {
  return apiClient.get<Relationship[]>(
    `/trees/${treeId}/persons/${personId}/relationships`
  );
}
