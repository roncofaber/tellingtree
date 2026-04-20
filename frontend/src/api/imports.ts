import { apiClient } from "./client";

export interface ImportResult {
  persons_created: number;
  relationships_created: number;
  skipped: number;
  errors: string[];
}

export function importGedcom(treeId: string, file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  return apiClient.upload<ImportResult>(`/trees/${treeId}/import/gedcom`, form);
}
