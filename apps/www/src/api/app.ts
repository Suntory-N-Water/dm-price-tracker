import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { authentication, verifyAccessToken } from './middleware/authentication';
import { settingsRoutes } from './routes/settings';
import { cardRoutes } from './routes/cards';
import { cardWatchRoutes } from './routes/card-watches';
import { adminProductRoutes } from './routes/admin-products';
import { productRoutes } from './routes/products';
import type { AccessTokenVerifier, ApiEnv } from './types';

export function createApp({
  verifyAccessToken: accessTokenVerifier = verifyAccessToken,
}: {
  verifyAccessToken?: AccessTokenVerifier;
} = {}) {
  const app = new Hono<ApiEnv>().basePath('/api');

  app.get('/health', (context) => context.json({ ok: true }));
  app.use(
    '*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (context) =>
        context.json({ error: 'リクエストが大きすぎます' }, 413),
    }),
  );
  app.use('*', authentication(accessTokenVerifier));
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
    console.error('API処理中に予期しないエラーが発生しました', error);
    return context.json({ error: 'サーバーエラーが発生しました' }, 500);
  });

  return routes;
}

export type AppType = ReturnType<typeof createApp>;

export default createApp();
