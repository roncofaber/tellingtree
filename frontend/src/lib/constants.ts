export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
export const API_PREFIX = `${API_BASE_URL}/api/v1`;

export const ROLES = {
  viewer: "viewer",
  editor: "editor",
  admin: "admin",
} as const;

export const ROLE_LABELS: Record<string, string> = {
  viewer: "Viewer (read-only)",
  editor: "Editor (modify data)",
  admin: "Admin (manage members)",
};

export const RELATIONSHIP_TYPES: { key: string; label: string; inverse: string }[] = [
  { key: "parent",  label: "Parent",  inverse: "child" },
  { key: "child",   label: "Child",   inverse: "parent" },
  { key: "spouse",  label: "Spouse",  inverse: "spouse" },
  { key: "partner", label: "Partner", inverse: "partner" },
];

export const RELATIONSHIP_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  RELATIONSHIP_TYPES.map((t) => [t.key, t.label])
);

export const MEDIA_TYPES = {
  photo: "photo",
  audio: "audio",
  video: "video",
  document: "document",
  other: "other",
} as const;
