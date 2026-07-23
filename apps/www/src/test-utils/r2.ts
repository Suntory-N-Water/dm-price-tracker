import { env } from 'cloudflare:test';

export async function resetR2(): Promise<void> {
  for (const bucket of [env.CARD_IMAGES, env.SCREENSHOTS]) {
    const objects = await bucket.list();
    if (objects.objects.length > 0) {
      await bucket.delete(objects.objects.map(({ key }) => key));
    }
  }
}
