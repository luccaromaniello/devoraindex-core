import {
  type NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
} from "@atproto/oauth-client-node";
import { Hono } from "hono";
import {
  type AppSessionStore,
  AT_PROTO_SCOPE,
  createAtprotoOAuthClient,
  createKeysetFromPrivateJwk,
  type OAuthStore,
} from "./auth/atproto-oauth.js";
import { createAuthRoutes } from "./auth/routes.js";
import { loadConfig } from "./config.js";
import {
  type AuthStorage,
  createDurableAuthStorage,
  createMemoryAuthStorage,
} from "./storage.js";

export interface AppOptions {
  oauthClient?: NodeOAuthClient;
  stateStore?: OAuthStore<NodeSavedState>;
  sessionStore?: OAuthStore<NodeSavedSession>;
  appSessionStore?: AppSessionStore;
  publicUrl?: string;
  scope?: string;
  storage?: AuthStorage;
}

export async function createApp(options: AppOptions = {}) {
  const config = loadConfig();
  const storage = options.storage ?? createStorage(config);
  await storage.connect();

  const stateStore = options.stateStore ?? storage.stateStore;
  const sessionStore = options.sessionStore ?? storage.sessionStore;
  const appSessionStore = options.appSessionStore ?? storage.appSessionStore;
  const publicUrl =
    options.publicUrl ?? config.PUBLIC_URL ?? "http://127.0.0.1:3000";
  const scope = options.scope ?? AT_PROTO_SCOPE;
  const keyset = config.OAUTH_CLIENT_PRIVATE_JWK
    ? await createKeysetFromPrivateJwk(config.OAUTH_CLIENT_PRIVATE_JWK)
    : undefined;
  const oauthClient =
    options.oauthClient ??
    createAtprotoOAuthClient({
      publicUrl,
      scope,
      clientName: config.OAUTH_CLIENT_NAME,
      keyset,
      requestLock: storage.requestLock,
      stateStore,
      sessionStore,
    });

  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/oauth/client-metadata.json", (c) =>
    c.json(oauthClient.clientMetadata),
  );
  app.get("/oauth/jwks.json", (c) => c.json(oauthClient.jwks));

  app.route(
    "/oauth",
    createAuthRoutes({
      oauthClient,
      appSessionStore,
      publicUrl,
      scope,
    }),
  );

  if (process.env.NODE_ENV !== "production") {
    import("./dev/openapi.js").then(({ mountDevelopmentDocs }) => {
      mountDevelopmentDocs(app);
    });
  }

  return app;
}

function createStorage(config: ReturnType<typeof loadConfig>): AuthStorage {
  if (config.DATABASE_URL && config.REDIS_URL) {
    if (!config.OAUTH_ENCRYPTION_KEY) {
      throw new Error(
        "OAUTH_ENCRYPTION_KEY is required when durable storage is configured",
      );
    }
    return createDurableAuthStorage({
      databaseUrl: config.DATABASE_URL,
      redisUrl: config.REDIS_URL,
      encryptionKey: config.OAUTH_ENCRYPTION_KEY,
    });
  }

  return createMemoryAuthStorage();
}
