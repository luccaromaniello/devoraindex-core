import { buildAtprotoLoopbackClientMetadata, NodeOAuthClient } from "@atproto/oauth-client-node";
import { randomUUID } from "node:crypto";
import { type NodeSavedSession, type NodeSavedState } from "@atproto/oauth-client-node";

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
	redirectUris: string[];
	stateStore: OAuthStore<NodeSavedState>;
	sessionStore: OAuthStore<NodeSavedSession>;
	scope?: string;
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
}: AtprotoOAuthConfig): NodeOAuthClient {
	return new NodeOAuthClient({
		clientMetadata: buildAtprotoLoopbackClientMetadata({
			scope,
			redirect_uris: redirectUris,
		}),
		stateStore,
		sessionStore,
	});
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
