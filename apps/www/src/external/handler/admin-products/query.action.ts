'use server';

import {
  getAdminProductsServer,
  getAvailableAdminProductsServer,
} from './query.server';

export async function getAdminProductsAction() {
  return await getAdminProductsServer();
}

export async function getAvailableAdminProductsAction(name: string) {
  return await getAvailableAdminProductsServer(name);
}
