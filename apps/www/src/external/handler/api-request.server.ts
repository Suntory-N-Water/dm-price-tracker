import { getCloudflareContext } from '@opennextjs/cloudflare';
import { headers } from 'next/headers';
import { createApp } from '@/api/app';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function requestApi(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const incomingHeaders = await headers();
  const requestHeaders = new Headers(init.headers);
  const accessToken = incomingHeaders.get('cf-access-jwt-assertion');
  if (accessToken !== null) {
    requestHeaders.set('cf-access-jwt-assertion', accessToken);
  }
  if (init.body !== undefined) {
    requestHeaders.set('content-type', 'application/json');
  }

  const request = new Request(`http://internal${path}`, {
    ...init,
    headers: requestHeaders,
  });
  const { env } = getCloudflareContext();
  const response = await createApp().fetch(request, env);
  const body =
    response.status === 204
      ? undefined
      : ((await response.json()) as { error?: string });
  if (!response.ok) {
    throw new ApiError(
      body?.error ?? 'APIの処理に失敗しました',
      response.status,
    );
  }

  return body;
}
