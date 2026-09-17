import { z } from "zod";

const optionalValue = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const environmentSchema = z.object({
	NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
	HOST: z.string().default("127.0.0.1"),
	PORT: z.coerce.number().int().positive().default(3000),
	PUBLIC_URL: optionalValue.pipe(z.url().optional()),
	DATABASE_URL: optionalValue.pipe(z.url().optional()),
	REDIS_URL: optionalValue.pipe(z.url().optional()),
	OAUTH_ENCRYPTION_KEY: optionalValue.pipe(
		z
			.string()
			.regex(/^[0-9a-fA-F]{64}$/)
			.optional(),
	),
	OAUTH_CLIENT_PRIVATE_JWK: optionalValue,
	OAUTH_CLIENT_NAME: z.string().trim().min(1).default("DevoraIndex"),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
	const config = environmentSchema.parse(environment);

	if (config.NODE_ENV === "production") {
		if (!config.PUBLIC_URL || new URL(config.PUBLIC_URL).protocol !== "https:") {
			throw new Error("PUBLIC_URL must be an HTTPS URL in production");
		}
		if (!config.DATABASE_URL || !config.REDIS_URL) {
			throw new Error("DATABASE_URL and REDIS_URL are required in production");
		}
		if (!config.OAUTH_ENCRYPTION_KEY) {
			throw new Error("OAUTH_ENCRYPTION_KEY is required in production");
		}
		if (!config.OAUTH_CLIENT_PRIVATE_JWK) {
			throw new Error("OAUTH_CLIENT_PRIVATE_JWK is required in production");
		}
	}

	return config;
}
