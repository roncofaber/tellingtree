export interface Relationship {
  id: string;
  tree_id: string;
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
