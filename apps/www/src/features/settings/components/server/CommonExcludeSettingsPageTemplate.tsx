import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
} from '@tanstack/react-query';
import { getCommonExcludeKeywordsServer } from '@/external/handler/settings/query.server';
import { settingKeys } from '@/features/settings/queries/keys';
import { CommonExcludeSettings } from '../client/CommonExcludeSettings/CommonExcludeSettings';

export async function CommonExcludeSettingsPageTemplate() {
  const response = await getCommonExcludeKeywordsServer();
  const queryClient = new QueryClient();
  queryClient.setQueryData(settingKeys.commonExcludes, response);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CommonExcludeSettings initialKeywords={response.keywords} />
    </HydrationBoundary>
  );
}
