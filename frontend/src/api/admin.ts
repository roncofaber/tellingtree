import { apiClient } from "./client";
import type { User } from "@/types/api";

export interface RegistrationInvite {
  id: string;
  token: string;
  email: string | null;
  note: string | null;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  created_at: string;
  created_by: string | null;
}

export function listRegistrationInvites() {
  return apiClient.get<RegistrationInvite[]>("/admin/registration-invites");
}

export function createRegistrationInvite(data: {
  email?: string | null;
  note?: string | null;
  expires_in_days?: number;
}) {
  return apiClient.post<RegistrationInvite>("/admin/registration-invites", data);
}

export function revokeRegistrationInvite(inviteId: string) {
  return apiClient.delete<void>(`/admin/registration-invites/${inviteId}`);
}

export function listAllUsers() {
  return apiClient.get<User[]>("/admin/users");
}

export function approveUser(userId: string) {
  return apiClient.put<User>(`/admin/users/${userId}/approve`, {});
}

export function rejectUser(userId: string) {
  return apiClient.put<User>(`/admin/users/${userId}/reject`, {});
}
