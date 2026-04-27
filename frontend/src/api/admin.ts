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
  used_by_username: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AdminStats {
  users_total: number;
  users_pending: number;
  users_active: number;
  users_superadmin: number;
  trees_total: number;
  trees_public: number;
  persons_total: number;
  stories_total: number;
  invites_outstanding: number;
  invites_used: number;
}

export interface AdminUser extends User {
  tree_count: number;
}

export interface AdminTree {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  owner_id: string;
  owner_username: string | null;
  member_count: number;
  person_count: number;
  story_count: number;
  created_at: string;
  updated_at: string;
}

export function getAdminStats() {
  return apiClient.get<AdminStats>("/admin/stats");
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
  return apiClient.get<AdminUser[]>("/admin/users");
}

export function listAllTrees() {
  return apiClient.get<AdminTree[]>("/admin/trees");
}

export function approveUser(userId: string) {
  return apiClient.put<User>(`/admin/users/${userId}/approve`, {});
}

export function rejectUser(userId: string) {
  return apiClient.put<User>(`/admin/users/${userId}/reject`, {});
}

export function promoteUser(userId: string) {
  return apiClient.put<User>(`/admin/users/${userId}/promote`, {});
}

export function demoteUser(userId: string) {
  return apiClient.put<User>(`/admin/users/${userId}/demote`, {});
}

export function generateResetToken(userId: string) {
  return apiClient.post<{ url: string }>(`/admin/users/${userId}/reset-token`, {});
}

export function deleteUser(userId: string) {
  return apiClient.delete<void>(`/admin/users/${userId}`);
}
