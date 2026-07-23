export type ApiEnv = {
  Bindings: CloudflareEnv;
  Variables: {
    userEmail: string;
  };
};

export type AccessTokenVerifier = (
  token: string,
  env: CloudflareEnv,
  audience: string,
) => Promise<string>;
