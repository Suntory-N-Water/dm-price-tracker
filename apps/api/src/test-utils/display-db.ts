import { env } from 'cloudflare:test';

export async function resetDisplayDb(): Promise<void> {
  await env.DISPLAY_DB.batch([
    env.DISPLAY_DB.prepare('DELETE FROM crawl_targets'),
    env.DISPLAY_DB.prepare('DELETE FROM crawl_runs'),
    env.DISPLAY_DB.prepare('DELETE FROM pending_cards'),
    env.DISPLAY_DB.prepare('DELETE FROM screenshots'),
    env.DISPLAY_DB.prepare('DELETE FROM price_points'),
    env.DISPLAY_DB.prepare('DELETE FROM card_watches'),
    env.DISPLAY_DB.prepare('DELETE FROM search_conditions'),
    env.DISPLAY_DB.prepare('DELETE FROM price_series'),
    env.DISPLAY_DB.prepare('DELETE FROM user_common_exclude_keywords'),
    env.DISPLAY_DB.prepare('DELETE FROM users'),
    env.DISPLAY_DB.prepare('DELETE FROM cards'),
    env.DISPLAY_DB.prepare('DELETE FROM products'),
  ]);
}
