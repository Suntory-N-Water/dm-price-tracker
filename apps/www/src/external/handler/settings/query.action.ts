'use server';

import { getCommonExcludeKeywordsServer } from './query.server';

export async function getCommonExcludeKeywordsAction() {
  return await getCommonExcludeKeywordsServer();
}
