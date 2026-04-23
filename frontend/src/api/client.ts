import { API_PREFIX } from "@/lib/constants";
import type { ApiError } from "@/types/api";

let accessToken: string | null = null;
let onAuthFailure: (() => void) | null = null;

export function setTokens(access: string) {
  accessToken = access;
}

export function clearTokens() {
  accessToken = null;
}

export function getAccessToken() {
  return accessToken;
}

export function setOnAuthFailure(cb: () => void) {
  onAuthFailure = cb;
}

export class ApiRequestError extends Error {
  status: number;
  detail: string;
  /** Raw structured payload from the server (FastAPI sometimes returns dicts). */
  payload: unknown;

  constructor(status: number, detail: string, payload?: unknown) {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.payload = payload;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  try {
    // No body needed — the HttpOnly cookie is sent automatically by the browser
    const resp = await fetch(`${API_PREFIX}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    accessToken = data.access_token;
    return true;
  } catch {
    return false;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  if (
    !(options.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  let resp = await fetch(`${API_PREFIX}${path}`, {
    ...options,
    headers,
    credentials: "include", // always include cookies (needed for refresh cookie)
  });

  if (resp.status === 401 && accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      resp = await fetch(`${API_PREFIX}${path}`, { ...options, headers, credentials: "include" });
    } else {
      onAuthFailure?.();
      throw new ApiRequestError(401, "Session expired");
    }
  }

  if (resp.status === 204) {
    return undefined as T;
  }

  if (!resp.ok) {
    let detail = "Request failed";
    let payload: unknown = undefined;
    try {
      const err: ApiError = await resp.json();
      payload = err.detail;
      // FastAPI's detail can be a string or a structured dict (we use {code, message} for some errors)
      if (typeof err.detail === "string") {
        detail = err.detail;
      } else if (err.detail && typeof err.detail === "object" && "message" in err.detail) {
        detail = String((err.detail as { message: unknown }).message);
      }
    } catch {
      // ignore parse error
    }
    throw new ApiRequestError(resp.status, detail, payload);
  }

  return resp.json();
}

export const apiClient = {
  get: <T>(path: string, params?: Record<string, string>) => {
    const url = params
      ? `${path}?${new URLSearchParams(params).toString()}`
      : path;
    return request<T>(url);
  },

  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body: body ? JSON.stringify(body) : undefined,
    }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: "POST",
      body: formData,
    }),
};
