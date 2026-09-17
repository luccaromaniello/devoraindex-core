import { createHash, randomBytes } from "node:crypto";

import { type PrismaClient } from "@prisma/client";
import { type AppSession, type AppSessionStore, type OAuthStore } from "../auth/atproto-oauth.js";

export class PrismaAppSessionStore implements AppSessionStore {
	constructor(private readonly prisma: PrismaClient) {}

	async create(did: string, ttlSeconds: number): Promise<AppSession> {
		await this.prisma.appSession.deleteMany({
			where: { expiresAt: { lte: new Date() } },
		});

		const session = {
			id: randomBytes(32).toString("base64url"),
			did,
			expiresAt: new Date(Date.now() + ttlSeconds * 1000),
		};
		await this.prisma.appSession.create({ data: session });
		return {
			id: session.id,
			did: session.did,
			expiresAt: session.expiresAt.getTime(),
		};
	}

	async get(id: string): Promise<AppSession | undefined> {
		const session = await this.prisma.appSession.findUnique({ where: { id } });
		if (!session) return undefined;
		if (session.expiresAt.getTime() <= Date.now()) {
			await this.del(id);
			return undefined;
		}

		return {
			id: session.id,
			did: session.did,
			expiresAt: session.expiresAt.getTime(),
		};
	}

	async del(id: string): Promise<void> {
		await this.prisma.appSession.deleteMany({ where: { id } });
	}
}

/**
 * Uses Redis as a read through cache while keeping PostgreSQL as the durable
 * source of truth for application sessions.
 */
export class CachedAppSessionStore implements AppSessionStore {
	constructor(
		private readonly primary: AppSessionStore,
		private readonly cache: OAuthStore<AppSession>,
	) {}

	async create(did: string, ttlSeconds: number): Promise<AppSession> {
		const session = await this.primary.create(did, ttlSeconds);
		try {
			await this.cache.set(cacheKey(session.id), session);
		} catch (error) {
			logCacheError("write", error);
		}
		return session;
	}

	async get(id: string): Promise<AppSession | undefined> {
		const key = cacheKey(id);
		try {
			const cached = await this.cache.get(key);
			if (cached) {
				if (cached.expiresAt > Date.now()) return cached;
				await this.cache.del(key);
				return undefined;
			}
		} catch (error) {
			logCacheError("read", error);
		}

		const session = await this.primary.get(id);
		if (session) {
			try {
				await this.cache.set(key, session);
			} catch (error) {
				logCacheError("write", error);
			}
		}
		return session;
	}

	async del(id: string): Promise<void> {
		await this.primary.del(id);
		try {
			await this.cache.del(cacheKey(id));
		} catch (error) {
			logCacheError("delete", error);
		}
	}
}

function cacheKey(sessionId: string): string {
	return createHash("sha256").update(sessionId).digest("hex");
}

function logCacheError(operation: string, error: unknown): void {
	console.error(
		`Application session cache ${operation} failed`,
		error instanceof Error ? error.message : "unknown error",
	);
}
