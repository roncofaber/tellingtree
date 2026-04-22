import { apiClient } from "./client";

export interface AuditEntry {
  id: string;
  tree_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export function listAuditLogs(treeId: string, limit = 20) {
  return apiClient.get<AuditEntry[]>(`/trees/${treeId}/audit`, { limit: String(limit) });
}
