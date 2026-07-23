'use server';

import {
  getCardWatchesServer,
  getPriceHistoryServer,
  getProductsServer,
} from './query.server';

export async function getCardWatchesAction(filters: {
  name: string;
  productCode: string;
}) {
  return await getCardWatchesServer(filters);
}

export async function getPriceHistoryAction(cardId: string) {
  return await getPriceHistoryServer(cardId);
}

export async function getProductsAction() {
  return await getProductsServer();
}
