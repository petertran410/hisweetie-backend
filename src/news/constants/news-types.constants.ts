// src/news/constants/news-types.constants.ts - MỚI
export const NEWS_TYPES = {
  NEWS: 'NEWS',
  CULTURE: 'CULTURE',
  VIDEO: 'VIDEO',
  KIEN_THUC_NGUYEN_LIEU: 'KIEN_THUC_NGUYEN_LIEU',
  KIEN_THUC_TRA: 'KIEN_THUC_TRA',
  TREND_PHA_CHE: 'TREND_PHA_CHE',
  REVIEW_SAN_PHAM: 'REVIEW_SAN_PHAM',
  CONG_THUC_PHA_CHE: 'CONG_THUC_PHA_CHE',
} as const;

export const NEWS_TYPE_LABELS = {
  [NEWS_TYPES.NEWS]: 'Tin Tức',
  [NEWS_TYPES.CULTURE]: 'Văn Hóa',
  [NEWS_TYPES.VIDEO]: 'Video',
  [NEWS_TYPES.KIEN_THUC_NGUYEN_LIEU]: 'Kiến Thức Nguyên Liệu Pha Chế',
  [NEWS_TYPES.KIEN_THUC_TRA]: 'Kiến Thức Về Trà',
  [NEWS_TYPES.TREND_PHA_CHE]: 'Trend Pha Chế',
  [NEWS_TYPES.REVIEW_SAN_PHAM]: 'Review - Đánh Giá Sản Phẩm',
  [NEWS_TYPES.CONG_THUC_PHA_CHE]: 'Công thức pha chế',
} as const;

export const ARTICLE_SECTIONS = [
  {
    type: NEWS_TYPES.KIEN_THUC_NGUYEN_LIEU,
    label: NEWS_TYPE_LABELS[NEWS_TYPES.KIEN_THUC_NGUYEN_LIEU],
    slug: 'kien-thuc-nguyen-lieu-pha-che',
  },
  {
    type: NEWS_TYPES.KIEN_THUC_TRA,
    label: NEWS_TYPE_LABELS[NEWS_TYPES.KIEN_THUC_TRA],
    slug: 'kien-thuc-ve-tra',
  },
  {
    type: NEWS_TYPES.TREND_PHA_CHE,
    label: NEWS_TYPE_LABELS[NEWS_TYPES.TREND_PHA_CHE],
    slug: 'trend-pha-che',
  },
  {
    type: NEWS_TYPES.REVIEW_SAN_PHAM,
    label: NEWS_TYPE_LABELS[NEWS_TYPES.REVIEW_SAN_PHAM],
    slug: 'review-danh-gia-san-pham',
  },
  {
    type: NEWS_TYPES.CONG_THUC_PHA_CHE,
    label: NEWS_TYPE_LABELS[NEWS_TYPES.CONG_THUC_PHA_CHE],
    slug: 'cong-thuc-pha-che',
  },
  {
    type: NEWS_TYPES.NEWS,
    label: NEWS_TYPE_LABELS[NEWS_TYPES.NEWS],
    slug: 'tin-tuc',
  },
] as const;

export type NewsTypeValue = (typeof NEWS_TYPES)[keyof typeof NEWS_TYPES];
