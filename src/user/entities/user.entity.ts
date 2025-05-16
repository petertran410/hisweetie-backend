export class User {}

export type UserType = {
  id: string;
  created_by: string | null;
  created_date: Date | null;
  updated_by: string | null;
  updated_date: Date | null;
  address: string | null;
  ava_url: string | null;
  email: string | null;
  full_name: string | null;
  is_active: Boolean | null;
  password: string | null;
  phone: string | null;
};
