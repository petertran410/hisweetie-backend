type ProductPriceLike = {
  pos_price?: unknown;
  kiotviet_price?: unknown;
};

const toPriceOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getEffectiveProductPrice = (product: ProductPriceLike): number => {
  return (
    toPriceOrNull(product.pos_price) ??
    toPriceOrNull(product.kiotviet_price) ??
    0
  );
};
