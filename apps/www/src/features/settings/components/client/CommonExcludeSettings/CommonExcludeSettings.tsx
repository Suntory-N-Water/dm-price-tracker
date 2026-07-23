'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useState } from 'react';
import * as v from 'valibot';
import { commonExcludeFormSchema } from '@/external/dto/api-schemas';
import { updateCommonExcludeKeywordsAction } from '@/external/handler/settings/mutation.action';
import { getCommonExcludeKeywordsAction } from '@/external/handler/settings/query.action';
import { settingKeys } from '@/features/settings/queries/keys';
import { watchKeys } from '@/features/watches/queries/keys';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';

export function CommonExcludeSettings({
  initialKeywords,
}: {
  initialKeywords: string[];
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: settingKeys.commonExcludes,
    queryFn: getCommonExcludeKeywordsAction,
    initialData: { keywords: initialKeywords },
  });
  const [keywords, setKeywords] = useState([
    ...query.data.keywords,
    ...Array.from({ length: 3 - query.data.keywords.length }, () => ''),
  ]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: updateCommonExcludeKeywordsAction,
    onSuccess: async (result) => {
      setMessage(
        `保存しました。価格チェック中の${result.updatedCardCount}枚へ反映しました`,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: settingKeys.commonExcludes,
        }),
        queryClient.invalidateQueries({ queryKey: watchKeys.all }),
      ]);
    },
  });

  return (
    <div className='mx-auto max-w-3xl space-y-6'>
      <div>
        <p className='mb-1 text-sm font-semibold text-emerald-700'>
          EXCLUDE SETTINGS
        </p>
        <h1 className='text-3xl font-bold tracking-tight'>共通除外ワード</h1>
      </div>
      <Card>
        <CardHeader>
          <h2 className='text-xl font-bold'>すべてのカードで除外する</h2>
          <p className='mt-2 text-sm leading-6 text-stone-600'>
            除外ワードは1カードにつき3枠です。ここで入力した単語が全カード共通で枠を使い、残りをカード別に設定できます。
          </p>
        </CardHeader>
        <CardContent>
          <form
            className='space-y-5'
            onSubmit={(event) => {
              event.preventDefault();
              setError('');
              setMessage('');
              const result = v.safeParse(commonExcludeFormSchema, { keywords });
              if (!result.success) {
                setError(result.issues[0]?.message ?? '入力値が不正です');
                return;
              }
              mutation.mutate(result.output);
            }}
          >
            <div className='grid gap-4 sm:grid-cols-3'>
              {keywords.map((keyword, index) => (
                <label
                  key={`common-${index.toString()}`}
                  className='space-y-2 text-sm font-semibold'
                  htmlFor={`common-${index.toString()}`}
                >
                  {index + 1}つ目
                  <Input
                    id={`common-${index.toString()}`}
                    value={keyword}
                    onChange={(event) =>
                      setKeywords((current) =>
                        current.map((value, currentIndex) =>
                          currentIndex === index ? event.target.value : value,
                        ),
                      )
                    }
                    placeholder='未設定'
                    maxLength={50}
                  />
                </label>
              ))}
            </div>
            {error !== '' && (
              <p className='text-sm text-red-700' role='alert'>
                {error}
              </p>
            )}
            {message !== '' && (
              <p className='text-sm text-emerald-800' role='status'>
                {message}
              </p>
            )}
            <div className='flex justify-end'>
              <Button type='submit' disabled={mutation.isPending}>
                <Save className='size-4' />
                保存
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
