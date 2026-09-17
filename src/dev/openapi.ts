import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { type Hono } from "hono";
import { z } from "zod";

const healthRoute = createRoute({
	method: "get",
	path: "/health",
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ status: z.literal("ok") }),
				},
			},
			description: "Service is healthy",
		},
	},
});

const errorSchema = z.object({ error: z.string() });

const loginRoute = createRoute({
	method: "post",
	path: "/oauth/login",
	tags: ["Authentication"],
	summary: "Start AT Protocol login",
	description:
		"Discover the user's identity provider and begin the AT Protocol OAuth flow. The returned URL should be opened by the browser.",
	request: {
		body: {
			required: true,
			content: {
				"application/json": {
					schema: z.object({
						handle: z.string().min(1).max(253).describe("The user's AT Protocol handle."),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			description: "OAuth authorization URL created",
			content: {
				"application/json": {
					schema: z.object({ redirectUrl: z.string().url() }),
				},
			},
		},
		502: {
			description: "Identity provider discovery or authorization failed",
			content: { "application/json": { schema: errorSchema } },
		},
	},
});

const callbackRoute = createRoute({
	method: "get",
	path: "/oauth/callback",
	tags: ["Authentication"],
	summary: "Complete AT Protocol login",
	description:
		"OAuth redirect endpoint. The server exchanges the authorization code, stores the AT Protocol session, sets an opaque httpOnly application cookie, and redirects the browser to the frontend.",
	request: {
		query: z.object({
			code: z.string().optional().describe("Authorization code returned on a successful authorization."),
			state: z.string().optional().describe("OAuth state returned by the authorization server."),
			error: z.string().optional().describe("OAuth error returned when authorization was denied."),
			error_description: z.string().optional(),
		}),
	},
	responses: {
		302: {
			description: "Redirect to the frontend after processing the OAuth callback",
		},
	},
});

const sessionRoute = createRoute({
	method: "get",
	path: "/oauth/session",
	tags: ["Authentication"],
	summary: "Get the current application session",
	description:
		"Restores the server-side AT Protocol session and returns the authenticated DID when the session is valid.",
	security: [{ appSessionCookie: [] }],
	responses: {
		200: {
			description: "Current user, or null when the browser is not authenticated",
			content: {
				"application/json": {
					schema: z.object({
						user: z.object({ did: z.string().describe("The user's stable AT Protocol DID.") }).nullable(),
					}),
				},
			},
		},
	},
});

const logoutRoute = createRoute({
	method: "post",
	path: "/oauth/logout",
	tags: ["Authentication"],
	summary: "End the current application session",
	description:
		"Revokes the restored AT Protocol session when present, deletes the server-side application session, and clears the cookie.",
	security: [{ appSessionCookie: [] }],
	responses: {
		200: {
			description: "Logout completed",
			content: {
				"application/json": {
					schema: z.object({ success: z.literal(true) }),
				},
			},
		},
	},
});

const clientMetadataRoute = createRoute({
	method: "get",
	path: "/oauth/client-metadata.json",
	tags: ["AT Protocol OAuth"],
	summary: "Get OAuth client metadata",
	description: "Public OAuth client metadata consumed by AT Protocol authorization servers.",
	responses: {
		200: {
			description: "OAuth client metadata",
			content: {
				"application/json": {
					schema: z
						.object({
							client_id: z.string(),
							redirect_uris: z.array(z.string()),
							scope: z.string(),
							response_types: z.array(z.string()),
							grant_types: z.array(z.string()),
						})
						.passthrough(),
				},
			},
		},
	},
});

const jwksRoute = createRoute({
	method: "get",
	path: "/oauth/jwks.json",
	tags: ["AT Protocol OAuth"],
	summary: "Get the OAuth public key set",
	description:
		"Public JSON Web Key Set used by authorization servers to verify the client's private-key JWT signatures.",
	responses: {
		200: {
			description: "JSON Web Key Set",
			content: {
				"application/json": {
					schema: z.object({ keys: z.array(z.record(z.string(), z.unknown())) }),
				},
			},
		},
	},
});

export function mountDevelopmentDocs(app: Hono): void {
	const docs = new OpenAPIHono();
	docs.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));
	for (const route of [loginRoute, callbackRoute, sessionRoute, logoutRoute, clientMetadataRoute, jwksRoute]) {
		docs.openAPIRegistry.registerPath(route);
	}
	docs.openAPIRegistry.registerComponent("securitySchemes", "appSessionCookie", {
		type: "apiKey",
		in: "cookie",
		name: "session",
		description: "Opaque httpOnly cookie issued by /oauth/callback.",
	});
	docs.doc("/openapi.json", {
		openapi: "3.0.3",
		info: {
			title: "DevoraIndex Core API",
			version: "0.1.0",
			description:
				"Development API documentation for DevoraIndex. OAuth state and AT Protocol sessions remain on the server; the browser receives an opaque application session cookie.",
		},
	});
	app.route("/", docs);
	app.get(
		"/docs",
		Scalar({
			url: "/openapi.json",
			pageTitle: "DevoraIndex Core API",
		}),
	);
}
