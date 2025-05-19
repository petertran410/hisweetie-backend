export class CreateProductDto {
  title: string;
  price?: number;
  quantity: number;
  categoryIds?: number[];
  description: string;
  imagesUrl?: string[];
  generalDescription?: string;
  instruction: string;
  isFeatured?: boolean;
  featuredThumbnail?: string;
  recipeThumbnail?: string;
  type: string;
}
