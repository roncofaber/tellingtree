export interface Story {
  id: string;
  tree_id: string;
  title: string;
  content: string | null;
  event_date: string | null;
  event_end_date: string | null;
  event_location: string | null;
  author_id: string;
  created_at: string;
  updated_at: string;
  person_ids: string[];
  tag_ids: string[];
}
