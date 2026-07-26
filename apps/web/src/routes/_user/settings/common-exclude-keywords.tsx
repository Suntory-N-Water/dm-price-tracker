import { createFileRoute } from '@tanstack/react-router';
import { commonExcludeKeywordsQueryOptions } from '@/features/settings/api';
import { CommonExcludeSettings } from '@/features/settings/components/client/CommonExcludeSettings/CommonExcludeSettings';

export const Route = createFileRoute('/_user/settings/common-exclude-keywords')(
  {
    head: () => ({
      meta: [
        { title: '共通除外ワード | DM Price Tracker' },
        {
          name: 'description',
          content: 'すべてのカードに適用する除外ワード設定',
        },
      ],
    }),
    loader: async ({ context }) => {
      await context.queryClient.ensureQueryData(
        commonExcludeKeywordsQueryOptions,
      );
    },
    component: CommonExcludeSettings,
  },
);
