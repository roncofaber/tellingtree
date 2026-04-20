export interface Media {
  id: string;
  tree_id: string;
  story_id: string | null;
  person_id: string | null;
  uploaded_by_id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number | null;
  media_type: string;
  caption: string | null;
  created_at: string;
}
