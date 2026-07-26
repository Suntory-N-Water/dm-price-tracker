import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/displayDbSchema.ts',
  out: './migrations-display-db',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '',
    databaseId: process.env['CLOUDFLARE_DISPLAY_DATABASE_ID'] ?? '',
    token: process.env['CLOUDFLARE_D1_TOKEN'] ?? '',
  },
});
