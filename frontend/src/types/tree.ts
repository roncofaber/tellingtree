export interface Tree {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface TreeMember {
  id: string;
  tree_id: string;
  user_id: string;
  role: string;
  created_at: string;
  username: string | null;
}
