export interface Place {
  id: string;
  display_name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  country_code: string | null;
  lat: number | null;
  lon: number | null;
  geocoder: string | null;
  geocoded_at: string | null;
  created_at: string;
}
