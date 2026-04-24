import { apiClient } from "./client";

export interface UserLookup {
  id: string;
  username: string;
  full_name: string | null;
  has_avatar: boolean;
}

export function lookupUser(username: string) {
  return apiClient.get<UserLookup>(`/users/lookup?username=${encodeURIComponent(username)}`);
}
