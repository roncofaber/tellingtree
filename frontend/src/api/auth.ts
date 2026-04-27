import { apiClient } from "./client";
import { API_PREFIX } from "@/lib/constants";
import type { Token, User } from "@/types/api";

export function register(data: {
  email: string;
  username: string;
  password: string;
  full_name?: string;
  invite_token?: string;
}) {
  return apiClient.post<User>("/auth/register", data);
}

export interface InviteValidation {
  valid: boolean;
  email: string | null;
  expired: boolean;
  used: boolean;
}

export function validateRegistrationInvite(token: string) {
  return apiClient.get<InviteValidation>(`/auth/registration-invites/${token}/validate`);
}

export function login(data: { username: string; password: string }) {
  return apiClient.post<Token>("/auth/login", data);
}

export function logout() {
  return apiClient.post<void>("/auth/logout");
}

export function getMe() {
  return apiClient.get<User>("/users/me");
}

export function updateMe(data: { full_name?: string; email?: string }) {
  return apiClient.put<User>("/users/me", data);
}

export function changePassword(data: {
  current_password: string;
  new_password: string;
}) {
  return apiClient.put<void>("/users/me/password", data);
}

export function deleteAccount(data: { password: string }) {
  return apiClient.delete<void>("/users/me", data);
}

export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiClient.upload<User>("/users/me/avatar", formData);
}

export function deleteAvatar() {
  return apiClient.delete<User>("/users/me/avatar");
}

export function updatePreferences(data: Record<string, unknown>) {
  return apiClient.patch<User>("/users/me/preferences", data);
}

export async function fetchAvatarBlob(userId: string): Promise<string> {
  const { getAccessToken } = await import("./client");
  const token = getAccessToken();
  const resp = await fetch(`${API_PREFIX}/users/${userId}/avatar`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Failed to fetch avatar");
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}
