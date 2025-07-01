// src/product/dto/kiotviet-product-response.dto.ts
export interface KiotVietProductResponseDto {
  id: string;
  title: string;
  description?: string;
  price: number | null;
  imagesUrl: string[];
  type?: string;
  isFromKiotViet: boolean;
  category?: {
    id: string;
    name: string;
  };
  kiotViet: {
    id: string | null;
    code: string | null;
    name: string | null;
    price: number | null;
    type: number | null;
    images: string[] | null;
    category: {
      kiotviet_id: number;
      name: string;
    } | null;
    trademark: {
      kiotviet_id: number;
      name: string;
    } | null;
    syncedAt: Date | null;
  };
}
