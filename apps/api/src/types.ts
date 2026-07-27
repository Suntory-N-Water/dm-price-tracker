export type ApiEnv = {
  Bindings: CloudflareEnv & {
    LOCAL_AUTH_EMAIL?: string;
    LOCAL_AUTH_IS_ADMIN?: string;
  };
  Variables: {
    userEmail: string;
  };
};

export type AccessTokenVerifier = (
  token: string,
  env: CloudflareEnv,
  audience: string,
) => Promise<string>;

export type LocalAuthentication = {
  email: string;
  isAdmin: boolean;
};
