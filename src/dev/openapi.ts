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

export function mountDevelopmentDocs(app: Hono): void {
	const docs = new OpenAPIHono();
	docs.openapi(healthRoute, (c) => c.json({ status: "ok" }, 200));
	docs.doc("/openapi.json", {
		openapi: "3.1.0",
		info: {
			title: "DevoraIndex Core API",
			version: "0.1.0",
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
