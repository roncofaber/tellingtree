import { apiClient } from "./client";

export interface Invite {
  id: string;
  tree_id: string;
  role: string;
  token: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface InviteInfo {
  tree_name: string;
  role: string;
  expires_at: string;
  already_member: boolean;
}

export function createInvite(treeId: string, data: { role?: string; expires_in_days?: number } = {}): Promise<Invite> {
  return apiClient.post<Invite>(`/trees/${treeId}/invites`, data);
}

export function listInvites(treeId: string): Promise<Invite[]> {
  return apiClient.get<Invite[]>(`/trees/${treeId}/invites`);
}

export function revokeInvite(treeId: string, inviteId: string): Promise<void> {
  return apiClient.delete<void>(`/trees/${treeId}/invites/${inviteId}`);
}

export function getInviteInfo(token: string): Promise<InviteInfo> {
  return apiClient.get<InviteInfo>(`/invite/${token}`);
}

export function acceptInvite(token: string): Promise<void> {
  return apiClient.post<void>(`/invite/${token}/accept`);
}
