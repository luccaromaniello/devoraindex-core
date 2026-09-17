import { type NodeSavedSession, type NodeSavedState, type RuntimeLock } from "@atproto/oauth-client-node";
import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import {
	type AppSession,
	type AppSessionStore,
	createMemoryAppSessionStore,
	createMemoryStore,
	type OAuthStore,
} from "./auth/atproto-oauth.js";
import { CachedAppSessionStore, PrismaAppSessionStore } from "./storage/postgres.js";
import { createRedisRequestLock, parseEncryptionKey, type RedisClient, RedisOAuthStore } from "./storage/redis.js";

export interface AuthStorage {
	stateStore: OAuthStore<NodeSavedState>;
	sessionStore: OAuthStore<NodeSavedSession>;
	appSessionStore: AppSessionStore;
	requestLock?: RuntimeLock;
	connect(): Promise<void>;
	disconnect(): Promise<void>;
}

export function createMemoryAuthStorage(): AuthStorage {
	return {
		stateStore: createMemoryStore<NodeSavedState>(),
		sessionStore: createMemoryStore<NodeSavedSession>(),
		appSessionStore: createMemoryAppSessionStore(),
		connect: async () => undefined,
		disconnect: async () => undefined,
	};
}

export function createDurableAuthStorage({
	databaseUrl,
	redisUrl,
	encryptionKey,
}: {
	databaseUrl: string;
	redisUrl: string;
	encryptionKey: string;
}): AuthStorage {
	const prisma = new PrismaClient({
		datasources: { db: { url: databaseUrl } },
	});
	const redis = createClient({ url: redisUrl });
	const key = parseEncryptionKey(encryptionKey);
	const redisAppSessionCache = new RedisOAuthStore<AppSession>(redis as RedisClient, {
		namespace: "devoraindex:app-session-cache",
		ttlSeconds: 5 * 60,
		encryptionKey: key,
	});
	const postgresAppSessionStore = new PrismaAppSessionStore(prisma);

	return {
		stateStore: new RedisOAuthStore<NodeSavedState>(redis as RedisClient, {
			namespace: "devoraindex:oauth-state",
			ttlSeconds: 30 * 60,
			encryptionKey: key,
		}),
		sessionStore: new RedisOAuthStore<NodeSavedSession>(redis as RedisClient, {
			namespace: "devoraindex:oauth-session",
			ttlSeconds: 90 * 24 * 60 * 60,
			encryptionKey: key,
		}),
		appSessionStore: new CachedAppSessionStore(postgresAppSessionStore, redisAppSessionCache),
		requestLock: createRedisRequestLock(redis as RedisClient),
		async connect() {
			await Promise.all([prisma.$connect(), redis.connect()]);
		},
		async disconnect() {
			await Promise.all([prisma.$disconnect(), redis.quit()]);
		},
	};
}

export * from "./storage/postgres.js";
export * from "./storage/redis.js";
