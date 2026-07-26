import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as v from 'valibot';

export const CARD_IMAGES_BUCKET = 'duelmasters-card-images';
export const SCREENSHOTS_BUCKET = 'mercari-crawler-screenshots';

const r2EnvironmentSchema = v.object({
  R2_ACCOUNT_ID: v.pipe(v.string(), v.nonEmpty()),
  R2_ACCESS_KEY_ID: v.pipe(v.string(), v.nonEmpty()),
  R2_SECRET_ACCESS_KEY: v.pipe(v.string(), v.nonEmpty()),
});

export async function putR2Object({
  bucket,
  key,
  body,
}: {
  bucket: string;
  key: string;
  body: Uint8Array;
}): Promise<void> {
  const environment = v.parse(r2EnvironmentSchema, process.env);
  const client = new S3Client({
    endpoint: `https://${environment.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: environment.R2_ACCESS_KEY_ID,
      secretAccessKey: environment.R2_SECRET_ACCESS_KEY,
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/png',
    }),
  );
}
