import type { AppType } from '@dm-price-tracker/api';
import { hc } from 'hono/client';

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
if (configuredApiBaseUrl === undefined || configuredApiBaseUrl === '') {
  throw new Error('VITE_API_BASE_URLを設定してください');
}

export const apiBaseUrl = configuredApiBaseUrl.replace(/\/+$/u, '');

export const apiClient = hc<AppType>(apiBaseUrl, {
  init: { credentials: 'include' },
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class SessionExpiredError extends ApiError {
  constructor(status: number) {
    super('セッションが切れました。再読み込みしてください', status);
  }
}

type ApiResponse = {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<unknown>;
};

export async function parseApiResponse<T>(response: ApiResponse): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new SessionExpiredError(response.status);
  }

  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(
      body.error ?? 'APIの処理に失敗しました',
      response.status,
    );
  }

  return body;
}

export function resolveApiAssetUrl(path: string): string {
  return new URL(path, `${apiBaseUrl}/`).href;
}
