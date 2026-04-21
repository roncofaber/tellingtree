import { apiClient } from "./client";
import type { Place } from "@/types/place";

export function searchPlaces(q: string): Promise<Place[]> {
  return apiClient.get<Place[]>("/places/search", { q });
}

export function getPlace(placeId: string): Promise<Place> {
  return apiClient.get<Place>(`/places/${placeId}`);
}

export function createPlace(data: Partial<Place>): Promise<Place> {
  return apiClient.post<Place>("/places", data);
}

export function updatePlace(placeId: string, data: Partial<Place>): Promise<Place> {
  return apiClient.put<Place>(`/places/${placeId}`, data);
}

export function deletePlace(placeId: string): Promise<void> {
  return apiClient.delete<void>(`/places/${placeId}`);
}

export function listTreePlaces(treeId: string): Promise<Place[]> {
  return apiClient.get<Place[]>(`/trees/${treeId}/places`);
}

export interface PlacePersonRef {
  id: string;
  name: string;
  field: string;
}

export interface PlaceDetail extends Place {
  persons: PlacePersonRef[];
}

export function listTreePlaceDetails(treeId: string): Promise<PlaceDetail[]> {
  return apiClient.get<PlaceDetail[]>(`/trees/${treeId}/places/details`);
}

export interface BatchGeocodeEvent {
  phase: "geocoding" | "done";
  current?: number;
  total?: number;
  location?: string;
  status?: "linked" | "no_match" | "error";
  display_name?: string;
  linked?: number;
  failed?: number;
}

export async function batchGeocode(
  treeId: string,
  onProgress: (event: BatchGeocodeEvent) => void,
): Promise<void> {
  const { getAccessToken } = await import("./client");
  const { API_PREFIX } = await import("@/lib/constants");
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resp = await fetch(`${API_PREFIX}/trees/${treeId}/places/geocode-all`, {
    method: "POST",
    headers,
    credentials: "include",
  });

  if (!resp.ok) throw new Error("Batch geocode failed");

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.trim()) onProgress(JSON.parse(line));
    }
  }
}
