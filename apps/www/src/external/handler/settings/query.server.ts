import * as v from 'valibot';
import { settingsResponseSchema } from '@/external/dto/api-schemas';
import { requestApi } from '@/external/handler/api-request.server';

export async function getCommonExcludeKeywordsServer() {
  return v.parse(
    settingsResponseSchema,
    await requestApi('/api/settings/common-exclude-keywords'),
  );
}
