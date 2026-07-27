export const watchKeys = {
  all: ['card-watches'] as const,
  list: (filters: { name: string; productCode: string }) =>
    [...watchKeys.all, 'list', filters] as const,
  detail: (cardId: string, period: string) =>
    [...watchKeys.all, 'detail', cardId, period] as const,
};
