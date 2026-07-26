import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authentication, verifyAccessToken } from './middleware/authentication';
import { settingsRoutes } from './routes/settings';
import { cardRoutes } from './routes/cards';
import { cardWatchRoutes } from './routes/card-watches';
import { adminProductRoutes } from './routes/admin-products';
import { crawlerRoutes } from './routes/crawler';
import { productRoutes } from './routes/products';
import type { AccessTokenVerifier, ApiEnv, LocalAuthentication } from './types';
import {
  CrawlAlreadyRunningError,
  NoCrawlTargetsError,
} from '@/external/service/crawler/crawl-runs';

export function createApp({
  verifyAccessToken: accessTokenVerifier = verifyAccessToken,
  localAuthentication = process.env.NODE_ENV === 'development'
    ? {
        email: process.env.LOCAL_AUTH_EMAIL ?? 'developer@example.com',
        isAdmin: process.env.LOCAL_AUTH_IS_ADMIN !== 'false',
      }
    : undefined,
}: {
  verifyAccessToken?: AccessTokenVerifier;
  localAuthentication?: LocalAuthentication;
} = {}) {
  const app = new Hono<ApiEnv>().basePath('/api');
  const limitRequestBody = bodyLimit({
    maxSize: 16 * 1024,
    onError: (context) =>
      context.json({ error: 'リクエストが大きすぎます' }, 413),
  });

  app.get('/health', (context) => context.json({ ok: true }));
  app.route('/crawler', crawlerRoutes);
  app.use('*', async (context, next) => {
    if (
      !context.req.raw.headers.has('content-length') &&
      !context.req.raw.headers.has('transfer-encoding')
    ) {
      return await next();
    }
    return await limitRequestBody(context, next);
  });
  app.use('*', authentication(accessTokenVerifier, localAuthentication));
  const routes = app
    .route('/settings', settingsRoutes)
    .route('/cards', cardRoutes)
    .route('/products', productRoutes)
    .route('/card-watches', cardWatchRoutes)
    .route('/admin/products', adminProductRoutes);

  routes.notFound((context) =>
    context.json({ error: 'APIが見つかりません' }, 404),
  );
  routes.onError((error, context) => {
    if (
      error instanceof CrawlAlreadyRunningError ||
      error instanceof NoCrawlTargetsError
    ) {
      return context.json({ error: error.message }, 409);
    }
    console.error('API処理中に予期しないエラーが発生しました', error);
    return context.json({ error: 'サーバーエラーが発生しました' }, 500);
  });

  return routes;
}

export type AppType = ReturnType<typeof createApp>;

export default createApp();
