'use server';

import * as v from 'valibot';
import {
  commonExcludeFormSchema,
  updateSettingsResponseSchema,
} from '@/external/dto/api-schemas';
import { requestApi } from '@/external/handler/api-request.server';

export async function updateCommonExcludeKeywordsAction(input: {
  keywords: string[];
}) {
  const parsed = v.parse(commonExcludeFormSchema, input);
  return v.parse(
    updateSettingsResponseSchema,
    await requestApi('/api/settings/common-exclude-keywords', {
      method: 'PUT',
      body: JSON.stringify({ keywords: parsed.keywords.filter(Boolean) }),
    }),
  );
}
