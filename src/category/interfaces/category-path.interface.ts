export interface CategoryPathItem {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  parent_id: number | null;
  children?: CategoryChild[];
}

export interface CategoryChild {
  id: number;
  name: string;
  slug: string;
}

export interface ResolvedCategory {
  id: number;
  name: string;
  slug: string;
}

export interface CategoryPathResponse {
  success: boolean;
  data: CategoryPathItem[];
  message: string;
}
