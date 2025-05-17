export class NewsDTO {
  id: number;
  created_by: string | null;
  created_date: Date | null;
  updated_by: string | null;
  updated_date: Date | null;
  description: string | null;
  html_content: string | null;
  images_url: string | null;
  title: string | null;
  view: number | null;
  user_id: string | null;
  type: string | null;
}
