'use server';

import { getCardsServer, getCardProductsServer } from './query.server';

export async function getCardsAction(filters: {
  name: string;
  productCode: string;
}) {
  return await getCardsServer(filters);
}

export async function getCardProductsAction() {
  return await getCardProductsServer();
}
