export const cardKeys = {
  all: ['cards'] as const,
  list: (filters: { name: string; productCode: string; page: number }) =>
    [...cardKeys.all, 'list', filters] as const,
};
