import { type NodeSavedSession, type NodeSavedState } from "@atproto/oauth-client-node";
import { Hono } from "hono";
import { createAtprotoOAuthClient, createMemoryAppSessionStore, createMemoryStore } from "./auth/atproto-oauth.js";
import { type AppSessionStore, type OAuthStore } from "./auth/atproto-oauth.js";
import { createAuthRoutes } from "./auth/routes.js";
import { type NodeOAuthClient } from "@atproto/oauth-client-node";

export interface AppOptions {
	oauthClient?: NodeOAuthClient;
	stateStore?: OAuthStore<NodeSavedState>;
	sessionStore?: OAuthStore<NodeSavedSession>;
	appSessionStore?: AppSessionStore;
	publicUrl?: string;
}

export function createApp(options: AppOptions = {}) {
	const stateStore = options.stateStore ?? createMemoryStore<NodeSavedState>();
	const sessionStore = options.sessionStore ?? createMemoryStore<NodeSavedSession>();
	const appSessionStore = options.appSessionStore ?? createMemoryAppSessionStore();
	const oauthClient =
		options.oauthClient ??
		createAtprotoOAuthClient({
			redirectUris: ["http://127.0.0.1:3000/oauth/callback"],
			stateStore,
			sessionStore,
		});

	const app = new Hono();

	app.get("/health", (c) => c.json({ status: "ok" }));

	app.route(
		"/oauth",
		createAuthRoutes({
			oauthClient,
			appSessionStore,
			publicUrl: options.publicUrl ?? process.env.PUBLIC_URL ?? "http://127.0.0.1:3000",
		}),
	);

	if (process.env.NODE_ENV !== "production") {
		import("./dev/openapi.js").then(({ mountDevelopmentDocs }) => {
			mountDevelopmentDocs(app);
		});
	}

	return app;
}
