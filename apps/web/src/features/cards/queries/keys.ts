export const cardKeys = {
  all: ['cards'] as const,
  list: (filters: { name: string; productCode: string }) =>
    [...cardKeys.all, 'list', filters] as const,
};
