import { apiClient } from "./client";
import type { Token, User } from "@/types/api";

export function register(data: {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}) {
  return apiClient.post<User>("/auth/register", data);
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
