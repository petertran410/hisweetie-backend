// src/utils/helper.ts
export const getInlineHTML = (cartData: any[] = []): string => {
  if (!Array.isArray(cartData) || !cartData.length) {
    return '';
  }

  return `<div>
  ${cartData
    .map(
      (i) => `<div style="margin-top: 20px;">
    <img src="${i.imagesUrl?.[0]?.replace(
      'http://',
      'https://',
    )}" style="width: 80px; height: 60px; object-fit:cover; border-radius: 3px; float:left; margin-right: 15px;" />
    <div>
      <p style="font-weight: 600; margin: 0;">${i.title}</p>
      <p>Số lượng: ${i.quantity || 1}</p>
      <p>Giá: ${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(i.price || 0)}</p>
    </div>
  </div>`,
    )
    .join('\n')}
</div>`;
};

// Format currency for Vietnamese Dong
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
};

// Generate random order code
export const generateOrderCode = (prefix: string = 'DT'): string => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${timestamp.slice(-8)}${random}`;
};

// Validate Vietnamese phone number
export const isValidVietnamesePhone = (phone: string): boolean => {
  const phoneRegex = /^(\+84|84|0)(3|5|7|8|9)([0-9]{8})$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

// Validate email format
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Calculate shipping cost
export const calculateShippingCost = (
  subtotal: number,
  freeShippingThreshold: number = 500000,
): number => {
  return subtotal >= freeShippingThreshold ? 0 : 30000;
};

// Sanitize string for database storage
export const sanitizeString = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }

  let stringValue = String(value);

  // Remove problematic characters
  stringValue = stringValue
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .trim();

  // Limit length to prevent database overflow
  if (stringValue.length > 1000) {
    stringValue = stringValue.substring(0, 1000);
  }

  return stringValue;
};
