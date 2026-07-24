import { describe, expect, it } from 'vitest';
import { createR2Response } from './create-r2-response';

describe('画像レスポンス', () => {
  it('R2にHTTPメタデータがある時、画像本体とContent-TypeとETagを返せること', async () => {
    const sut = createR2Response;
    const object = {
      body: new Blob(['card-image']).stream(),
      httpEtag: '"image-etag"',
      httpMetadata: {
        contentType: 'image/png',
      },
      writeHttpMetadata() {
        throw new Error('Cannot stringify arbitrary non-POJOs');
      },
    } as unknown as R2ObjectBody;

    const response = sut(object);

    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('etag')).toBe('"image-etag"');
    await expect(response.arrayBuffer()).resolves.toEqual(
      new TextEncoder().encode('card-image').buffer,
    );
  });
});
