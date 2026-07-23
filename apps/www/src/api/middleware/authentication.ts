import { createRemoteJWKSet, jwtVerify } from 'jose';
import * as v from 'valibot';
import type { MiddlewareHandler } from 'hono';
import type {
  AccessTokenVerifier,
  ApiEnv,
  LocalAuthentication,
} from '../types';
import { registerUser } from '@/external/repository/user-repository';

const emailSchema = v.pipe(v.string(), v.email());
const remoteJwkSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export const verifyAccessToken: AccessTokenVerifier = async (
  token,
  env,
  audience,
) => {
  let remoteJwkSet = remoteJwkSets.get(env.TEAM_DOMAIN);
  if (remoteJwkSet === undefined) {
    remoteJwkSet = createRemoteJWKSet(
      new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`),
    );
    remoteJwkSets.set(env.TEAM_DOMAIN, remoteJwkSet);
  }

  const { payload } = await jwtVerify(token, remoteJwkSet, {
    issuer: env.TEAM_DOMAIN,
    audience,
  });

  return v.parse(emailSchema, payload.email);
};

export function authentication(
  accessTokenVerifier: AccessTokenVerifier,
  localAuthentication?: LocalAuthentication,
): MiddlewareHandler<ApiEnv> {
  return async (context, next) => {
    const token = context.req.header('cf-access-jwt-assertion');
    const isAdminRoute = context.req.path.startsWith('/api/admin/');

    let email: string;
    if (token === undefined) {
      if (localAuthentication === undefined) {
        return context.json({ error: '認証が必要です' }, 401);
      }
      if (isAdminRoute && !localAuthentication.isAdmin) {
        return context.json({ error: '管理者権限が必要です' }, 403);
      }
      email = v.parse(emailSchema, localAuthentication.email);
    } else {
      const audience = isAdminRoute
        ? context.env.ADMIN_POLICY_AUD
        : context.env.POLICY_AUD;
      try {
        email = await accessTokenVerifier(token, context.env, audience);
      } catch {
        return context.json({ error: '認証トークンが不正です' }, 401);
      }
      if (isAdminRoute && email !== context.env.ADMIN_EMAIL) {
        return context.json({ error: '管理者権限が必要です' }, 403);
      }
    }

    await registerUser(context.env.DISPLAY_DB, email);
    context.set('userEmail', email);
    await next();
  };
}
