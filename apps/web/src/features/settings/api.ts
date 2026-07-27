import { queryOptions } from '@tanstack/react-query';
import * as v from 'valibot';
import { apiClient, parseApiResponse } from '@/shared/api/client';
import type {
  SettingsResponse,
  UpdateSettingsResponse,
} from '@/shared/api/types';
import { commonExcludeFormSchema } from './form-schema';
import { settingKeys } from './queries/keys';

export const commonExcludeKeywordsQueryOptions = queryOptions({
  queryKey: settingKeys.commonExcludes,
  queryFn: async () =>
    await parseApiResponse<SettingsResponse>(
      await apiClient.api.settings['common-exclude-keywords'].$get(),
    ),
});

export async function updateCommonExcludeKeywords(input: {
  keywords: string[];
}): Promise<UpdateSettingsResponse> {
  const parsed = v.parse(commonExcludeFormSchema, input);
  return await parseApiResponse<UpdateSettingsResponse>(
    await apiClient.api.settings['common-exclude-keywords'].$put({
      json: { keywords: parsed.keywords.filter(Boolean) },
    }),
  );
}
