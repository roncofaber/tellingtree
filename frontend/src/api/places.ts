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
