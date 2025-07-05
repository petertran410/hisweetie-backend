// src/pages/entities/pages.entity.ts - FIXED
export class Pages {
  id: bigint; // FIXED: Use bigint to match Prisma
  created_by?: string;
  created_date?: Date;
  updated_by?: string;
  updated_date?: Date;
  slug: string;
  title: string;
  content?: string;
  meta_title?: string;
  meta_description?: string;
  display_order?: number;
  parent_id?: bigint; // FIXED: Use bigint to match Prisma
  is_active?: boolean;
  is_main_page?: boolean;

  // Virtual fields for relations
  parent?: Pages;
  children?: Pages[];
}
