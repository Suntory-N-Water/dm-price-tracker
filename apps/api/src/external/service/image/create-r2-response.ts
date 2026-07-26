// TODO: なんだこれ
export function createR2Response(object: R2ObjectBody): Response {
  const headers = new Headers();
  const metadata = object.httpMetadata;
  if (metadata?.contentType !== undefined) {
    headers.set('content-type', metadata.contentType);
  }
  if (metadata?.contentLanguage !== undefined) {
    headers.set('content-language', metadata.contentLanguage);
  }
  if (metadata?.contentDisposition !== undefined) {
    headers.set('content-disposition', metadata.contentDisposition);
  }
  if (metadata?.contentEncoding !== undefined) {
    headers.set('content-encoding', metadata.contentEncoding);
  }
  if (metadata?.cacheControl !== undefined) {
    headers.set('cache-control', metadata.cacheControl);
  }
  if (metadata?.cacheExpiry !== undefined) {
    headers.set('expires', metadata.cacheExpiry.toUTCString());
  }
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
}
