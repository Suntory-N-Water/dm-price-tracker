export const adminProductKeys = {
  all: ['admin-products'] as const,
  list: ['admin-products', 'list'] as const,
  available: (name: string) => ['admin-products', 'available', name] as const,
};
