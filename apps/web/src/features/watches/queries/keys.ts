export const watchKeys = {
  all: ['card-watches'] as const,
  list: (filters: { name: string; productCode: string }) =>
    [...watchKeys.all, 'list', filters] as const,
  detail: (cardId: string) => [...watchKeys.all, 'detail', cardId] as const,
};
