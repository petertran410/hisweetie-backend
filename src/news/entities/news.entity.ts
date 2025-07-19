export class News {
  id: number;
  created_by?: string;
  created_date?: Date;
  updated_by?: string;
  updated_date?: Date;
  description?: string;
  html_content?: string;
  images_url?: string;
  embed_url?: string; // THÊM MỚI
  title?: string;
  view?: number;
  user_id?: string;
  type?: string;
}
