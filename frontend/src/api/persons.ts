import { apiClient } from "./client";
import type { PaginatedResponse } from "@/types/api";
import type { Person } from "@/types/person";

type PersonWriteData = {
  given_name?: string | null;
  family_name?: string | null;
  maiden_name?: string | null;
  nickname?: string | null;
  birth_date?: string | null;
  birth_date_qualifier?: string | null;
  birth_date_2?: string | null;
  birth_date_original?: string | null;
  death_date?: string | null;
  death_date_qualifier?: string | null;
  death_date_2?: string | null;
  death_date_original?: string | null;
  birth_location?: string | null;
  birth_place_id?: string | null;
  death_location?: string | null;
  death_place_id?: string | null;
  gender?: string | null;
  is_living?: boolean | null;
  occupation?: string | null;
  nationalities?: string[] | null;
  education?: string | null;
  bio?: string | null;
  profile_picture_id?: string | null;
};

export function listPersons(treeId: string, skip = 0, limit = 20) {
  return apiClient.get<PaginatedResponse<Person>>(
    `/trees/${treeId}/persons`,
    { skip: String(skip), limit: String(limit) }
  );
}

export function createPerson(treeId: string, data: PersonWriteData) {
  return apiClient.post<Person>(`/trees/${treeId}/persons`, data);
}

export function getPerson(treeId: string, personId: string) {
  return apiClient.get<Person>(`/trees/${treeId}/persons/${personId}`);
}

export function updatePerson(treeId: string, personId: string, data: PersonWriteData) {
  return apiClient.put<Person>(`/trees/${treeId}/persons/${personId}`, data);
}

export function deletePerson(treeId: string, personId: string) {
  return apiClient.delete<void>(`/trees/${treeId}/persons/${personId}`);
}

export function getPersonNetwork(treeId: string, personId: string) {
  return apiClient.get<Person[]>(`/trees/${treeId}/persons/${personId}/network`);
}
