export class CategorySlugHelper {
  static convertToSlug(name: string | null): string {
    if (!name || name.trim() === '') return '';

    return name
      .toLowerCase()
      .trim()
      .replace(/[áàảãạâấầẩẫậăắằẳẵặ]/g, 'a')
      .replace(/[éèẻẽẹêếềểễệ]/g, 'e')
      .replace(/[íìỉĩị]/g, 'i')
      .replace(/[óòỏõọôốồổỗộơớờởỡợ]/g, 'o')
      .replace(/[úùủũụưứừửữự]/g, 'u')
      .replace(/[ýỳỷỹỵ]/g, 'y')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  static findCategoryBySlug(categories: any[], targetSlug: string): any | null {
    return categories.find((cat) => {
      if (!cat.name) return false;
      return this.convertToSlug(cat.name) === targetSlug;
    });
  }
}
