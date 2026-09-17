import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";

import { type RuntimeLock } from "@atproto/oauth-client-node";
import { type RedisClientType } from "redis";

type RedisClient = RedisClientType;

const unlockScript = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

function encodeBase64(value: Buffer): string {
  return value.toString("base64url");
}

function decodeBase64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function parseEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value, "hex");
  if (key.length !== 32)
    throw new Error(
      "OAUTH_ENCRYPTION_KEY must contain 32 bytes encoded as hexadecimal",
    );
  return key;
}

function encrypt(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  return [
    "v1",
    encodeBase64(iv),
    encodeBase64(cipher.getAuthTag()),
    encodeBase64(ciphertext),
  ].join(".");
}

function decrypt<T>(value: string, key: Buffer): T {
  const [version, encodedIv, encodedTag, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) {
    throw new Error("Invalid encrypted Redis value");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    decodeBase64(encodedIv),
  );
  decipher.setAuthTag(decodeBase64(encodedTag));
  const plaintext = Buffer.concat([
    decipher.update(decodeBase64(encodedCiphertext)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export interface RedisOAuthStoreOptions {
  namespace: string;
  ttlSeconds: number;
  encryptionKey: Buffer;
}

export class RedisOAuthStore<T> {
  private readonly client: RedisClient;
  private readonly namespace: string;
  private readonly ttlSeconds: number;
  private readonly encryptionKey: Buffer;

  constructor(client: RedisClient, options: RedisOAuthStoreOptions) {
    this.client = client;
    this.namespace = options.namespace;
    this.ttlSeconds = options.ttlSeconds;
    this.encryptionKey = options.encryptionKey;
  }

  async get(key: string): Promise<T | undefined> {
    const value = await this.client.get(this.redisKey(key));
    return value === null ? undefined : decrypt<T>(value, this.encryptionKey);
  }

  async set(key: string, value: T): Promise<void> {
    await this.client.set(
      this.redisKey(key),
      encrypt(value, this.encryptionKey),
      {
        EX: this.ttlSeconds,
      },
    );
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.redisKey(key));
  }

  private redisKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}

export function createRedisRequestLock(client: RedisClient): RuntimeLock {
  return async <T>(name: string, fn: () => T | PromiseLike<T>): Promise<T> => {
    const key = `devoraindex:oauth-lock:${createHash("sha256").update(name).digest("hex")}`;
    const token = randomUUID();
    const deadline = Date.now() + 10_000;

    while (!(await client.set(key, token, { NX: true, PX: 45_000 }))) {
      if (Date.now() >= deadline)
        throw new Error("Timed out acquiring OAuth session lock");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    try {
      return await fn();
    } finally {
      await client.eval(unlockScript, { keys: [key], arguments: [token] });
    }
  };
}

export type { RedisClient };
