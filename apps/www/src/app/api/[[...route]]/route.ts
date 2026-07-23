import { getCloudflareContext } from '@opennextjs/cloudflare';
import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createApp } from '@/api/app';

const api = createApp();
const adapter = new Hono().all('*', (context) => {
  const { env } = getCloudflareContext();
  return api.fetch(context.req.raw, env);
});
const handler = handle(adapter);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
