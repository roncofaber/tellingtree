export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  is_active: boolean;
  is_approved: boolean;
  is_superadmin: boolean;
  created_at: string;
  has_avatar: boolean;
}

export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface ApiError {
  detail: string | { code?: string; message?: string };
}
