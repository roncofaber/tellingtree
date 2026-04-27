import { API_PREFIX } from "@/lib/constants";
import { getAccessToken } from "./client";

export interface ImportResult {
  persons_created: number;
  relationships_created: number;
  duplicates_skipped: number;
  skipped: number;
  errors: string[];
}

export interface ImportProgress {
  phase: "parsing" | "persons" | "relationships" | "done"
    | "validating" | "tags" | "stories" | "media";
  current?: number;
  total?: number;
  persons_created?: number;
  relationships_created?: number;
  stories_created?: number;
  media_imported?: number;
  media_skipped?: number;
  duplicates_skipped?: number;
  skipped?: number;
  errors?: string[];
  tree_slug?: string;
}

export interface ZipImportResult {
  tree_slug: string;
  persons_created: number;
  stories_created: number;
  media_imported: number;
  media_skipped: number;
  errors: string[];
}

const MAX_GEDCOM_SIZE = 50 * 1024 * 1024;    // 50 MB
const MAX_ZIP_SIZE   = 2 * 1024 * 1024 * 1024; // 2 GB

export async function importGedcomStreaming(
  treeId: string,
  file: File,
  onProgress: (event: ImportProgress) => void,
): Promise<ImportResult> {
  if (file.size > MAX_GEDCOM_SIZE) {
    throw new Error(`File too large (${Math.round(file.size / (1024 * 1024))}MB). Maximum is ${MAX_GEDCOM_SIZE / (1024 * 1024)}MB.`);
  }
  const form = new FormData();
  form.append("file", file);

  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${API_PREFIX}/trees/${treeId}/import/gedcom`, {
    method: "POST",
    body: form,
    headers,
    credentials: "include",
  });

  if (!resp.ok) {
    let detail = "Import failed";
    try { const err = await resp.json(); detail = err.detail; } catch { /* ignore */ }
    throw new Error(detail);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ImportResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const event: ImportProgress = JSON.parse(line);
      onProgress(event);
      if (event.phase === "done") {
        finalResult = {
          persons_created: event.persons_created ?? 0,
          relationships_created: event.relationships_created ?? 0,
          duplicates_skipped: event.duplicates_skipped ?? 0,
          skipped: event.skipped ?? 0,
          errors: event.errors ?? [],
        };
      }
    }
  }

  if (!finalResult) throw new Error("Import stream ended without result");
  return finalResult;
}

export async function importZipStreaming(
  file: File,
  treeName: string | undefined,
  onProgress: (event: ImportProgress) => void,
): Promise<ZipImportResult> {
  if (file.size > MAX_ZIP_SIZE) {
    throw new Error(`File too large (${(file.size / (1024 ** 3)).toFixed(1)} GB). Maximum is 2 GB.`);
  }

  const form = new FormData();
  form.append("file", file);
  if (treeName?.trim()) form.append("tree_name", treeName.trim());

  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${API_PREFIX}/import/zip`, {
    method: "POST",
    body: form,
    headers,
    credentials: "include",
  });

  if (!resp.ok) {
    let detail = "Restore failed";
    try { const err = await resp.json(); detail = err.detail; } catch { /* ignore */ }
    throw new Error(detail);
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ZipImportResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.trim()) continue;
      const event: ImportProgress = JSON.parse(line);
      onProgress(event);
      if (event.phase === "done" && event.tree_slug) {
        finalResult = {
          tree_slug: event.tree_slug,
          persons_created: event.persons_created ?? 0,
          stories_created: event.stories_created ?? 0,
          media_imported: event.media_imported ?? 0,
          media_skipped: event.media_skipped ?? 0,
          errors: event.errors ?? [],
        };
      }
    }
  }

  if (!finalResult) throw new Error("Restore stream ended without result");
  return finalResult;
}
