import { randomUUID } from "node:crypto";

import {
  buildAtprotoLoopbackClientMetadata,
  JoseKey,
  type Jwk,
  Keyset,
  NodeOAuthClient,
  type NodeSavedSession,
  type NodeSavedState,
  type OAuthClientMetadataInput,
  type RuntimeLock,
} from "@atproto/oauth-client-node";

export const AT_PROTO_SCOPE = "atproto";

export interface OAuthStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

export interface AppSession {
  id: string;
  did: string;
  expiresAt: number;
}

export interface AppSessionStore {
  create(did: string, ttlSeconds: number): Promise<AppSession>;
  get(id: string): Promise<AppSession | undefined>;
  del(id: string): Promise<void>;
}

export interface AtprotoOAuthConfig {
  redirectUris?: string[];
  stateStore: OAuthStore<NodeSavedState>;
  sessionStore: OAuthStore<NodeSavedSession>;
  scope?: string;
  publicUrl?: string;
  clientName?: string;
  keyset?: Keyset;
  requestLock?: RuntimeLock;
}

/**
 * Create the AT Protocol client used by the Hono routes.
 *
 * The stores are injected so the Hono app can use memory during development
 * and Postgres in production without changing the OAuth flow.
 */
export function createAtprotoOAuthClient({
  redirectUris,
  stateStore,
  sessionStore,
  scope = AT_PROTO_SCOPE,
  publicUrl,
  clientName = "DevoraIndex",
  keyset,
  requestLock,
}: AtprotoOAuthConfig): NodeOAuthClient {
  const clientMetadata =
    publicUrl && !isLoopbackUrl(publicUrl)
      ? buildProductionClientMetadata({
          publicUrl,
          scope,
          clientName,
          redirectUris,
        })
      : buildAtprotoLoopbackClientMetadata({
          scope,
          redirect_uris: redirectUris ?? [
            "http://127.0.0.1:3000/oauth/callback",
          ],
        });

  return new NodeOAuthClient({
    clientMetadata,
    keyset,
    requestLock,
    stateStore,
    sessionStore,
  });
}

export async function createKeysetFromPrivateJwk(
  privateJwk: string,
): Promise<Keyset> {
  let parsed: Jwk;
  try {
    parsed = JSON.parse(privateJwk) as Jwk;
  } catch {
    throw new Error("OAUTH_CLIENT_PRIVATE_JWK must be valid JSON");
  }

  const key = await JoseKey.fromJWK(parsed);
  return new Keyset([key]);
}

function buildProductionClientMetadata({
  publicUrl,
  scope,
  clientName,
  redirectUris,
}: {
  publicUrl: string;
  scope: string;
  clientName: string;
  redirectUris?: string[];
}): OAuthClientMetadataInput {
  const origin = new URL(publicUrl);
  if (origin.protocol !== "https:")
    throw new Error("PUBLIC_URL must use HTTPS for a public OAuth client");

  const baseUrl = origin.origin;
  const callbackUris = redirectUris ?? [
    new URL("/oauth/callback", baseUrl).toString(),
  ];
  return {
    client_id: new URL("/oauth/client-metadata.json", baseUrl).toString(),
    client_name: clientName,
    client_uri: baseUrl,
    redirect_uris: callbackUris as [string, ...string[]],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope,
    application_type: "web",
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    jwks_uri: new URL("/oauth/jwks.json", baseUrl).toString(),
    dpop_bound_access_tokens: true,
  };
}

function isLoopbackUrl(value: string): boolean {
  const url = new URL(value);
  return (
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "[::1]"
  );
}

export function createMemoryStore<T>(): OAuthStore<T> {
  const values = new Map<string, T>();

  return {
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, value);
    },
    async del(key) {
      values.delete(key);
    },
  };
}

export function createMemoryAppSessionStore(): AppSessionStore {
  const values = new Map<string, AppSession>();

  return {
    async create(did, ttlSeconds) {
      const session = {
        id: randomUUID(),
        did,
        expiresAt: Date.now() + ttlSeconds * 1000,
      };
      values.set(session.id, session);
      return session;
    },
    async get(id) {
      const session = values.get(id);
      if (!session || session.expiresAt <= Date.now()) {
        values.delete(id);
        return undefined;
      }
      return session;
    },
    async del(id) {
      values.delete(id);
    },
  };
}
